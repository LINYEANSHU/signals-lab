// 数值计算核心：复数运算、非均匀 DFT（含旋转因子递推加速）、累积积分、卷积、
// 多项式求根（Durand–Kerner + 低阶闭式）、频率响应、数值微分等

export type Cx = { re: number; im: number }
export const cx = (re: number, im = 0): Cx => ({ re, im })
export const cAdd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im })
export const cSub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im })
export const cMul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
export const cDiv = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
export const cAbs = (a: Cx): number => Math.hypot(a.re, a.im)
export const cArg = (a: Cx): number => Math.atan2(a.im, a.re)

export function cSqrt(a: Cx): Cx {
  const r = cAbs(a)
  const re = Math.sqrt(Math.max(0, (r + a.re) / 2))
  const im = Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (r - a.re) / 2))
  return { re, im }
}

export function cExp(a: Cx): Cx {
  const m = Math.exp(a.re)
  return { re: m * Math.cos(a.im), im: m * Math.sin(a.im) }
}

export function linspace(a: number, b: number, n: number): Float64Array {
  const out = new Float64Array(n)
  if (n === 1) {
    out[0] = a
    return out
  }
  const step = (b - a) / (n - 1)
  for (let i = 0; i < n; i++) out[i] = a + step * i
  out[n - 1] = b
  return out
}

export type Sampled = {
  t: Float64Array
  re: Float64Array
  im: Float64Array
  t0: number
  dt: number
  nonFinite: number
}

/** 连续信号采样（含 NaN/Inf 计数，用于截断/奇点提示） */
export function sampleCT(fn: (t: number) => { re: number; im: number }, ta: number, tb: number, N: number): Sampled {
  const n = Math.max(8, Math.round(N))
  const t = linspace(ta, tb, n)
  const dt = n > 1 ? (tb - ta) / (n - 1) : 1
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  let bad = 0
  for (let i = 0; i < n; i++) {
    const v = fn(t[i])
    if (!isFinite(v.re) || !isFinite(v.im)) {
      bad++
      re[i] = 0
      im[i] = 0
    } else {
      re[i] = v.re
      im[i] = v.im
    }
  }
  return { t, re, im, t0: ta, dt, nonFinite: bad }
}

/** 离散信号采样：整数网格 n ∈ [na, nb] */
export function sampleDT(fn: (n: number) => { re: number; im: number }, na: number, nb: number): Sampled {
  const N = Math.max(2, Math.round(nb - na) + 1)
  const t = linspace(na, nb, N)
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  let bad = 0
  for (let i = 0; i < N; i++) {
    const v = fn(Math.round(t[i]))
    if (!isFinite(v.re) || !isFinite(v.im)) {
      bad++
      re[i] = 0
      im[i] = 0
    } else {
      re[i] = v.re
      im[i] = v.im
    }
  }
  return { t, re, im, t0: na, dt: 1, nonFinite: bad }
}

/**
 * X(ω) = ∫ x(t) e^{-jωt} dt 的梯形法数值积分（NDFT）。
 * 内层用旋转因子递推 e^{-jω(t0+n·dt)} = e^{-jω(t0+(n-1)dt)}·e^{-jωdt}，
 * 避免每点调用 sin/cos，比朴素实现快约一个数量级。
 */
export function ndft(
  re: Float64Array,
  im: Float64Array,
  t0: number,
  dt: number,
  omegas: Float64Array,
): { re: Float64Array; im: Float64Array } {
  const N = re.length
  const M = omegas.length
  const outRe = new Float64Array(M)
  const outIm = new Float64Array(M)
  for (let m = 0; m < M; m++) {
    const w = omegas[m]
    let er = Math.cos(-w * t0)
    let ei = Math.sin(-w * t0)
    const qr = Math.cos(-w * dt)
    const qi = Math.sin(-w * dt)
    let sr = 0
    let si = 0
    // 梯形权重（首尾 0.5、中间 1；N=1 时该点权重 0.5）提出内层循环：
    // 乘 1 / 0.5 均为无舍入的精确浮点运算，且各项累加顺序与朴素写法一致，结果逐位相同。
    const last = N - 1
    if (N === 1) {
      const xr = re[0]
      const xi = im[0]
      if (xr !== 0 || xi !== 0) {
        sr += 0.5 * (xr * er - xi * ei)
        si += 0.5 * (xr * ei + xi * er)
      }
    } else {
      // 首点（权重 0.5）
      {
        const xr = re[0]
        const xi = im[0]
        if (xr !== 0 || xi !== 0) {
          sr += 0.5 * (xr * er - xi * ei)
          si += 0.5 * (xr * ei + xi * er)
        }
      }
      // 旋转因子推进到 n=1
      {
        const nr = er * qr - ei * qi
        ei = er * qi + ei * qr
        er = nr
      }
      for (let n = 1; n < last; n++) {
        const xr = re[n]
        const xi = im[n]
        if (xr !== 0 || xi !== 0) {
          sr += xr * er - xi * ei
          si += xr * ei + xi * er
        }
        const nr = er * qr - ei * qi
        ei = er * qi + ei * qr
        er = nr
      }
      // 末点（权重 0.5），旋转因子已推进到 n=last
      {
        const xr = re[last]
        const xi = im[last]
        if (xr !== 0 || xi !== 0) {
          sr += 0.5 * (xr * er - xi * ei)
          si += 0.5 * (xr * ei + xi * er)
        }
      }
    }
    outRe[m] = sr * dt
    outIm[m] = si * dt
  }
  return { re: outRe, im: outIm }
}

/**
 * 累积积分 S[k] = ∫_{t0}^{t0+k·dt} x(t) e^{-jω0 t} dt（梯形一致，S[N] 与 ndft 结果一致）。
 * 用于傅里叶动画：预计算一次，动画只回放前缀。
 */
export function cumulativeIntegral(
  re: Float64Array,
  im: Float64Array,
  t0: number,
  dt: number,
  w0: number,
): { Sre: Float64Array; Sim: Float64Array } {
  const N = re.length
  const Sre = new Float64Array(N + 1)
  const Sim = new Float64Array(N + 1)
  let er = Math.cos(-w0 * t0)
  let ei = Math.sin(-w0 * t0)
  const qr = Math.cos(-w0 * dt)
  const qi = Math.sin(-w0 * dt)
  // 梯形权重提出循环：端点系数 dt·0.5、中段 dt·1（乘 1/0.5 精确无舍入），
  // 与原 `dt * wg * (...)` 的浮点结合顺序一致，结果逐位相同。
  const endCoef = dt * 0.5
  const midCoef = dt
  for (let n = 0; n < N; n++) {
    const coef = n === 0 || n === N - 1 ? endCoef : midCoef
    const xr = re[n]
    const xi = im[n]
    Sre[n + 1] = Sre[n] + coef * (xr * er - xi * ei)
    Sim[n + 1] = Sim[n] + coef * (xr * ei + xi * er)
    const nr = er * qr - ei * qi
    ei = er * qi + ei * qr
    er = nr
  }
  return { Sre, Sim }
}

/** 离散卷积 y[k] = Σ a[i] b[k-i] */
export function convolve(a: Float64Array, b: Float64Array): Float64Array {
  const N = a.length + b.length - 1
  const y = new Float64Array(N)
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]
    if (ai === 0) continue
    for (let j = 0; j < b.length; j++) y[i + j] += ai * b[j]
  }
  return y
}

/** 中心差分数值导数 */
export function derivative(y: Float64Array, dt: number): Float64Array {
  const n = y.length
  const out = new Float64Array(n)
  for (let i = 1; i < n - 1; i++) out[i] = (y[i + 1] - y[i - 1]) / (2 * dt)
  out[0] = (y[1] - y[0]) / dt
  out[n - 1] = (y[n - 1] - y[n - 2]) / dt
  return out
}

/** 相位解缠绕 */
export function unwrap(ph: Float64Array): Float64Array {
  const n = ph.length
  const out = new Float64Array(n)
  if (n === 0) return out
  out[0] = ph[0]
  let off = 0
  const TAU = 2 * Math.PI
  for (let i = 1; i < n; i++) {
    const d = ph[i] + off - out[i - 1]
    if (d > Math.PI) off -= TAU
    else if (d < -Math.PI) off += TAU
    out[i] = ph[i] + off
  }
  return out
}

/**
 * 带掩码的相位解缠绕：不可信（幅度过小、相位为噪声）的点
 * 两遍填充——首个可信点之前统一填首个可信相位，之后填最近可信相位，
 * 从源头消除噪声区对解缠绕的污染，最后再做解缠绕。
 */
export function unwrapMasked(ph: Float64Array, valid: (i: number) => boolean): Float64Array {
  const n = ph.length
  const filled = new Float64Array(n)
  let firstValidIdx = -1
  for (let i = 0; i < n; i++) {
    if (valid(i)) {
      firstValidIdx = i
      break
    }
  }
  if (firstValidIdx < 0) return unwrap(ph)
  const firstValidPh = ph[firstValidIdx]
  let lastValid = firstValidPh
  for (let i = 0; i < n; i++) {
    if (valid(i)) {
      lastValid = ph[i]
      filled[i] = ph[i]
    } else {
      filled[i] = i < firstValidIdx ? firstValidPh : lastValid
    }
  }
  return unwrap(filled)
}

/** 线性插值（范围外返回 NaN） */
export function interpAt(xs: Float64Array, ys: Float64Array, x: number): number {
  const n = xs.length
  if (n < 2) return NaN
  if (x < xs[0] || x > xs[n - 1]) return NaN
  const u = (x - xs[0]) / (xs[1] - xs[0])
  const i = Math.min(Math.floor(u), n - 2)
  const f = u - i
  return ys[i] * (1 - f) + ys[i + 1] * f
}

export function maxAbs(arr: Float64Array | number[]): number {
  let m = 0
  for (let i = 0; i < arr.length; i++) {
    const v = Math.abs(arr[i])
    if (isFinite(v) && v > m) m = v
  }
  return m
}

/* ---------------- 多项式与频率响应 ---------------- */

/** 复多项式求值（系数最高次在前）：P(z) = c0 z^n + ... + cn */
export function polyEval(coeffs: Cx[], z: Cx): Cx {
  let acc = cx(coeffs[0].re, coeffs[0].im)
  for (let k = 1; k < coeffs.length; k++) acc = cAdd(cMul(acc, z), coeffs[k])
  return acc
}

/**
 * 多项式求根（系数最高次在前）。
 * 次数 ≤2 用闭式，≥3 用 Durand–Kerner 迭代。全零多项式返回 []。
 */
export function polyRoots(coeffs: Cx[]): Cx[] {
  let c = coeffs.slice()
  while (c.length > 1 && Math.hypot(c[0].re, c[0].im) < 1e-14) c = c.slice(1)
  const n = c.length - 1
  if (n <= 0) return []
  if (n === 1) return [cDiv(cx(-c[1].re, -c[1].im), c[0])]
  if (n === 2) {
    const [a, b, cc] = c
    const disc = cSub(cMul(b, b), cMul(cx(4), cMul(a, cc)))
    const sq = cSqrt(disc)
    const twoA = cMul(cx(2), a)
    return [cDiv(cSub(cx(-b.re, -b.im), sq), twoA), cDiv(cAdd(cx(-b.re, -b.im), sq), twoA)]
  }
  // Durand–Kerner
  const mon = c.map((v) => cDiv(v, c[0]))
  const P = (z: Cx): Cx => polyEval(mon, z)
  const seed = cx(0.4, 0.9)
  const roots: Cx[] = []
  let z = cx(1, 0)
  for (let k = 0; k < n; k++) {
    roots.push(z)
    z = cMul(z, seed)
  }
  for (let iter = 0; iter < 200; iter++) {
    let maxDelta = 0
    for (let i = 0; i < n; i++) {
      let d = cx(1, 0)
      for (let j = 0; j < n; j++) if (j !== i) d = cMul(d, cSub(roots[i], roots[j]))
      if (Math.hypot(d.re, d.im) < 1e-300) continue
      const delta = cDiv(P(roots[i]), d)
      roots[i] = cSub(roots[i], delta)
      maxDelta = Math.max(maxDelta, Math.hypot(delta.re, delta.im))
    }
    if (maxDelta < 1e-13) break
  }
  // 实系数多项式：清洗共轭对中的数值噪声
  const allRealCoeffs = c.every((v) => Math.abs(v.im) < 1e-12)
  if (allRealCoeffs) {
    for (const r of roots) if (Math.abs(r.im) < 1e-7) r.im = 0
  }
  return roots
}

/** H(jω)：连续系统频率响应（分母在 jω 轴上接近零时做限幅保护） */
export function freqResponseCT(num: Cx[], den: Cx[], w: number): Cx {
  const n = polyEval(num, cx(0, w))
  const d = polyEval(den, cx(0, w))
  const d2 = d.re * d.re + d.im * d.im
  if (d2 < 1e-12) {
    const s = 1e-6 * Math.sign(n.re || 1)
    return cx((n.re * 1e6) * (d2 > 0 ? 1 : s) || 0, 0)
  }
  return cDiv(n, d)
}

/** H(e^{jω})：离散系统频率响应，输入为 z⁻¹ 多项式系数 (num: [b0,b1,b2], den: [1,a1,a2]) */
export function freqResponseDT(num: Cx[], den: Cx[], w: number): Cx {
  const em = cx(Math.cos(w), -Math.sin(w))
  const em2 = cMul(em, em)
  const n = cAdd(cAdd(cMul(num[0], cx(1, 0)), cMul(num[1] ?? cx(0), em)), cMul(num[2] ?? cx(0), em2))
  const d = cAdd(cAdd(cMul(den[0], cx(1, 0)), cMul(den[1] ?? cx(0), em)), cMul(den[2] ?? cx(0), em2))
  const d2 = d.re * d.re + d.im * d.im
  if (d2 < 1e-12) return cx(0, 0)
  return cDiv(n, d)
}
