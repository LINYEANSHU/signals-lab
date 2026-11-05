// 开发自检：核心数值算法的数学正确性断言（dev 模式下在浏览器控制台运行）
import { compileSignal, makeSampler } from './parser'
import { sampleCT, ndft, linspace, convolve, polyRoots, cx, cumulativeIntegral } from './numeric'
import { ctPoles, dtPoles } from './systems'
import { CT_SIGNALS } from './presets'

let pass = 0
let fail = 0
const results: string[] = []

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    results.push(`✓ ${name} ${detail ?? ''}`)
    console.log(`%c✓ ${name}`, 'color:#34d399', detail ?? '')
  } else {
    fail++
    results.push(`✗ ${name} ${detail ?? ''}`)
    console.error(`✗ ${name}`, detail ?? '')
  }
}

export function runDevTests() {
  console.group('%cSignals Lab 数学自检', 'font-weight:bold;color:#38bdf8')
  const TAU = 2 * Math.PI

  // 1. 矩形脉冲 CTFT：X(0)=τ，第一零点 2π/τ
  {
    const c = compileSignal('rect(t/tau)')
    const smp = makeSampler((c as any).compiled, 'ct', { a: 1, b: 3, f0: 1, w0: 2, tau: 1.6, t0: 0, L: 8 })
    const S = sampleCT(smp, -3, 3, 4096)
    const w = linspace(-40, 40, 1601)
    const X = ndft(S.re, S.im, S.t0, S.dt, w)
    const mag = (i: number) => Math.hypot(X.re[i], X.im[i])
    const i0 = 800
    check('rect: |X(0)| = τ = 1.6', Math.abs(mag(i0) - 1.6) < 0.02, `得到 ${mag(i0).toFixed(4)}`)
    // 第一零点在 ω = 2π/τ ≈ 3.927
    const idx = w.reduce((best, v, i) => (Math.abs(v - TAU / 1.6) < Math.abs(w[best] - TAU / 1.6) ? i : best), 0)
    check('rect: 第一零点位于 2π/τ', mag(idx) < 0.08 * 1.6, `|X(2π/τ)| = ${mag(idx).toFixed(4)}`)
  }

  // 2. 单边指数：|X(0)| = 1/a
  {
    const c = compileSignal('exp(-a*t)*u(t)')
    const smp = makeSampler((c as any).compiled, 'ct', { a: 1.2, b: 3, f0: 1, w0: 2, tau: 1, t0: 0, L: 8 })
    const S = sampleCT(smp, -1, 8, 4096)
    const X = ndft(S.re, S.im, S.t0, S.dt, linspace(-30, 30, 801))
    check('exp: |X(0)| ≈ 1/a = 0.833', Math.abs(Math.hypot(X.re[400], X.im[400]) - 1 / 1.2) < 0.01, `得到 ${Math.hypot(X.re[400], X.im[400]).toFixed(4)}`)
  }

  // 3. Parseval（阻尼振荡，宽频窗）
  {
    const c = compileSignal('exp(-a*t)*sin(2*pi*f0*t)*u(t)')
    const smp = makeSampler((c as any).compiled, 'ct', { a: 0.8, b: 3, f0: 2, w0: 2, tau: 1, t0: 0, L: 8 })
    const S = sampleCT(smp, -1, 8, 4096)
    const w = linspace(-60, 60, 1201)
    const X = ndft(S.re, S.im, S.t0, S.dt, w)
    let et = 0
    for (let i = 0; i < S.re.length; i++) et += S.re[i] * S.re[i]
    et *= S.dt
    let ef = 0
    const dw = w[1] - w[0]
    for (let i = 0; i < X.re.length; i++) ef += X.re[i] * X.re[i] + X.im[i] * X.im[i]
    ef *= dw / TAU
    check('Parseval 比值 ∈ (0.9, 1.05)', ef / et > 0.9 && ef / et < 1.05, `比值 ${ef / et}`)
  }

  // 4. 卷积 rect∗rect 峰值 = τ
  {
    const c = compileSignal('rect(t/tau)')
    const smp = makeSampler((c as any).compiled, 'ct', { a: 1, b: 3, f0: 1, w0: 2, tau: 1, t0: 0, L: 8 })
    const S = sampleCT(smp, -3, 3, 1501)
    const y = convolve(S.re, S.re)
    let peak = 0
    for (const v of y) peak = Math.max(peak, v)
    const dtv = S.dt
    check('rect∗rect 峰值 = τ = 1', Math.abs(peak * dtv - 1) < 0.01, `得到 ${(peak * dtv).toFixed(4)}`)
  }

  // 5. 多项式求根：s² + 0.6s + 4 → −0.3 ± 1.9774j
  {
    const roots = polyRoots([cx(1), cx(0.6), cx(4)])
    const ok =
      roots.length === 2 &&
      Math.abs(roots[0].re + 0.3) < 1e-6 &&
      Math.abs(Math.abs(roots[0].im) - Math.sqrt(4 - 0.09)) < 1e-6
    check('polyRoots: s²+0.6s+4', ok, roots.map((r) => `${r.re.toFixed(3)}±${Math.abs(r.im).toFixed(3)}j`).join(' '))
  }

  // 6. DT 谐振器极点：z² −2r·cosθ·z + r², r=0.95, θ=0.3
  {
    const r = 0.95
    const th = 0.3
    const roots = dtPoles({ b: [0.05, 0, 0], a: [-2 * r * Math.cos(th), r * r] })
    const ok =
      roots.length === 2 &&
      Math.abs(Math.hypot(roots[0].re, roots[0].im) - r) < 1e-6 &&
      Math.abs(Math.hypot(roots[1].re, roots[1].im) - r) < 1e-6 &&
      Math.abs(Math.abs(Math.atan2(roots[0].im, roots[0].re)) - th) < 1e-6 &&
      Math.abs(Math.abs(Math.atan2(roots[1].im, roots[1].re)) - th) < 1e-6
    check('DT 谐振器极点 = 0.95·e^{±j0.3}', ok)
  }

  // 7. δ[n] DTFT 恒为 1
  {
    const c = compileSignal('delta(n)')
    const smp = makeSampler((c as any).compiled, 'dt', { a: 1, b: 3, f0: 1, w0: 2, tau: 1, t0: 0, L: 8 })
    const S = sampleCT(smp, -8, 16, 25)
    const X = ndft(S.re, S.im, S.t0, S.dt, linspace(-Math.PI, Math.PI, 41))
    let maxDev = 0
    for (let i = 0; i < X.re.length; i++) maxDev = Math.max(maxDev, Math.abs(X.re[i] - 1))
    check('δ[n] DTFT = 1（平坦）', maxDev < 1e-9, `最大偏差 ${maxDev.toExponential(1)}`)
  }

  // 8. 累积积分终值与 NDFT 一致
  {
    const c = compileSignal('exp(-t*t)*sin(3*t)')
    const smp = makeSampler((c as any).compiled, 'ct', { a: 1, b: 3, f0: 1, w0: 2, tau: 1, t0: 0, L: 8 })
    const S = sampleCT(smp, -4, 4, 2048)
    const w0 = 2.7
    const cum = cumulativeIntegral(S.re, S.im, S.t0, S.dt, w0)
    const X = ndft(S.re, S.im, S.t0, S.dt, Float64Array.of(w0))
    const dev = Math.hypot(cum.Sre[2048] - X.re[0], cum.Sim[2048] - X.im[0])
    check('累积积分终值 ≡ NDFT', dev < 1e-10, `偏差 ${dev.toExponential(1)}`)
  }

  console.log(`%c结果: ${pass} 通过, ${fail} 失败`, `color:${fail ? '#f87171' : '#34d399'};font-weight:bold`)
  console.groupEnd()
  ;(window as unknown as { __devtestResults: { pass: number; fail: number; log: string[] } }).__devtestResults = {
    pass,
    fail,
    log: results,
  }
}
