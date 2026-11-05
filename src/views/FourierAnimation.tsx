// 模块二：傅里叶变换原理动画
// X(ω₀) = ∫ x(t) e^{-jω₀t} dt 的逐点演示：信号×旋转复指数 → 累积积分复平面轨迹 → 频谱取值
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'
import { Plot } from '../components/Plot'
import { Badge, Btn, Field, Panel, SegBtns, Select, Slider, SnapshotIO, TextInput, Toggle, Note } from '../components/ui'
import { ExpSection, Explanation, Tex } from '../components/Tex'
import { LabLayout } from '../components/LabLayout'
import { useI18n, pickLabel } from '../i18n'
import { compileSignal, makeSampler, usedParams, DEFAULT_PARAMS, PARAM_KEYS, type Params } from '../lib/parser'
import { bool, deferApply, num, numRecord, str } from '../lib/snapshot'
import { sampleCT, ndft, linspace, cumulativeIntegral } from '../lib/numeric'
import { C, axis, baseLayout } from '../lib/plotTheme'

const TAU = 2 * Math.PI
const N_ANIM = 2400

type AnimPreset = {
  id: string
  label: string
  labelEn: string
  expr: string
  params?: Partial<Params>
  win: [number, number]
  wmax: number
  hint: string
  hintEn: string
}

const ANIM_PRESETS: AnimPreset[] = [
  {
    id: 'sin',
    label: '正弦 sin(2πf₀t)',
    labelEn: 'Sine sin(2πf₀t)',
    expr: 'sin(2*pi*f0*t)',
    params: { f0: 2 },
    win: [-4, 4],
    wmax: 14,
    hint: '把 ω₀ 拖到 ±2πf₀ ≈ ±12.57（或点“跳到谱峰”）：螺线突然打开、持续增长——复指数与信号同频共振，积分不抵消。',
    hintEn: 'Drag ω₀ to ±2πf₀ ≈ ±12.57 (or click “Jump to peak”): the spiral suddenly opens and keeps growing — the complex exponential resonates with the signal, so the integral no longer cancels.',
  },
  {
    id: 'rect',
    label: '矩形脉冲 rect(t/τ)',
    labelEn: 'Rectangular pulse rect(t/τ)',
    expr: 'rect(t/tau)',
    params: { tau: 1.2 },
    win: [-3, 3],
    wmax: 16,
    hint: 'ω₀=0 时路径是平滑曲线直奔 τ；ω₀ 增大后路径卷成越来越小的圈——高频成分被积分“平均掉”。',
    hintEn: 'At ω₀=0 the path is a smooth curve heading straight for τ; as ω₀ grows the path coils into ever smaller loops — high frequencies are “averaged out” by the integral.',
  },
  {
    id: 'gauss',
    label: '高斯脉冲 e^{-t²/2τ²}',
    labelEn: 'Gaussian pulse e^{−t²/2τ²}',
    expr: 'exp(-(t*t)/(2*tau*tau))',
    params: { tau: 0.7 },
    win: [-4, 4],
    wmax: 12,
    hint: '高斯脉冲各频率都有成分但高频衰减快：ω₀ 越大螺线终点越靠近原点。',
    hintEn: 'A Gaussian pulse contains every frequency, with fast high-frequency decay: the larger ω₀, the closer the spiral endpoint stays to the origin.',
  },
  {
    id: 'two',
    label: '双音 sin(2πf₀t)+0.5sin(2πbt)',
    labelEn: 'Two tones sin(2πf₀t)+0.5sin(2πbt)',
    expr: 'sin(2*pi*f0*t) + 0.5*sin(2*pi*b*t)',
    params: { f0: 2, b: 5 },
    win: [-4, 4],
    wmax: 20,
    hint: '两个谱峰：分别把 ω₀ 对准 2πf₀ 与 2πb，观察两个不同大小的“共振生长”。',
    hintEn: 'Two spectral peaks: aim ω₀ at 2πf₀ and then at 2πb, and watch two “resonant growths” of different sizes.',
  },
  {
    id: 'exp',
    label: '单边指数 e^{-at}u(t)',
    labelEn: 'One-sided exponential e^{−at}u(t)',
    expr: 'exp(-a*t)*u(t)',
    params: { a: 1 },
    win: [-1, 6],
    wmax: 14,
    hint: 'ω₀=0 终点在正实轴（值为 1/a）；随 ω₀ 增大终点绕向负虚轴——相位滞后增加。',
    hintEn: 'At ω₀=0 the endpoint lies on the positive real axis (value 1/a); as ω₀ grows it swings toward the negative imaginary axis — increasing phase lag.',
  },
]

export default function FourierAnimation() {
  const { lang, t } = useI18n()
  const [presetId, setPresetId] = useState('sin')
  const preset = ANIM_PRESETS.find((p) => p.id === presetId) ?? ANIM_PRESETS[0]
  const [expr, setExpr] = useState(preset.expr)
  const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS, ...preset.params })
  const [win] = useState<[number, number]>(preset.win)
  const [wmax, setWmax] = useState(preset.wmax)
  const [w0, setW0] = useState(4.5)
  const [compare, setCompare] = useState(true)
  const [w1, setW1] = useState(TAU * 2)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [scrub, setScrub] = useState(0)

  useEffect(() => {
    setExpr(preset.expr)
    setParams({ ...DEFAULT_PARAMS, ...preset.params })
    setWmax(preset.wmax)
    setW0(preset.id === 'sin' ? 4.5 : 4.5)
    setW1(preset.id === 'sin' ? TAU * preset.params?.f0! : TAU * 1.5)
    kRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId])

  const compiled = useMemo(() => compileSignal(expr), [expr])
  const symbols = compiled.ok ? usedParams(compiled.symbols) : []

  // ---- 采样（信号变化时）----
  const sampled = useMemo(() => {
    if (!compiled.ok) return null
    const s = makeSampler(compiled.compiled, 'ct', params)
    return sampleCT(s, win[0], win[1], N_ANIM)
  }, [compiled, params, win])

  // ---- 频谱（信号变化时）----
  const spectrum = useMemo(() => {
    if (!sampled) return null
    const omegas = linspace(-wmax, wmax, 601)
    const X = ndft(sampled.re, sampled.im, sampled.t0, sampled.dt, omegas)
    const mag = Float64Array.from(X.re, (_, i) => Math.hypot(X.re[i], X.im[i]))
    return { omegas, mag }
  }, [sampled, wmax])

  // ---- 累积积分（ω₀ / ω₁ 变化时重算，动画只回放前缀）----
  const cum0 = useMemo(() => {
    if (!sampled) return null
    return cumulativeIntegral(sampled.re, sampled.im, sampled.t0, sampled.dt, w0)
  }, [sampled, w0])

  const cum1 = useMemo(() => {
    if (!sampled || !compare) return null
    return cumulativeIntegral(sampled.re, sampled.im, sampled.t0, sampled.dt, w1)
  }, [sampled, w1, compare])

  // 复平面坐标范围（由路径实际范围决定）
  const cRange = useMemo(() => {
    if (!cum0) return [-1, 1]
    let m = 0.05
    for (let i = 0; i < cum0.Sre.length; i++) {
      m = Math.max(m, Math.abs(cum0.Sre[i]), Math.abs(cum0.Sim[i]))
      if (cum1) m = Math.max(m, Math.abs(cum1.Sre[i]), Math.abs(cum1.Sim[i]))
    }
    return [-1.15 * m, 1.15 * m]
  }, [cum0, cum1])

  const dRange = useMemo(() => {
    if (!spectrum || !cum0) return [0, 1]
    let m = 0
    for (let i = 0; i < spectrum.mag.length; i++) m = Math.max(m, spectrum.mag[i])
    for (let i = 0; i < cum0.Sre.length; i++) m = Math.max(m, Math.hypot(cum0.Sre[i], cum0.Sim[i]))
    return [0, 1.08 * m]
  }, [spectrum, cum0])

  const yRange = useMemo(() => {
    if (!sampled) return [-1, 1]
    let m = 0
    for (let i = 0; i < sampled.re.length; i++) m = Math.max(m, Math.abs(sampled.re[i]))
    return [-1.1 * m, 1.1 * m]
  }, [sampled])

  const final0 = cum0 ? Math.hypot(cum0.Sre[N_ANIM], cum0.Sim[N_ANIM]) : 0
  const final1 = cum1 ? Math.hypot(cum1.Sre[N_ANIM], cum1.Sim[N_ANIM]) : 0

  // ---- gd 引用 ----
  const gdA = useRef<unknown>(null)
  const gdB = useRef<unknown>(null)
  const gdC = useRef<unknown>(null)
  const gdD = useRef<unknown>(null)
  // 读数 DOM
  const readW0 = useRef<HTMLSpanElement | null>(null)
  const readRe = useRef<HTMLSpanElement | null>(null)
  const readIm = useRef<HTMLSpanElement | null>(null)
  const readAbs = useRef<HTMLSpanElement | null>(null)
  const readFinal = useRef<HTMLSpanElement | null>(null)

  const kRef = useRef(0)
  const productsRef = useRef<{ pRe: Float64Array; pIm: Float64Array } | null>(null)

  // ---- 动画绘制（只 restyle 动态轨迹，30fps 节流；任何单帧异常不得中断渲染循环）----
  const draw = useCallback(
    (i: number) => {
      const k = Math.max(1, Math.min(N_ANIM - 1, i))
      if (!sampled || !cum0) return
      try {
        const t = sampled.t
        const tk = t[k]
        const Sre = cum0.Sre[k]
        const Sim = cum0.Sim[k]
        const r0 = { x: [t.subarray(0, k)], y: [sampled.re.subarray(0, k)] }
        const rst = (gd: unknown, spec: Record<string, unknown>, idx: number[]) => {
          if (gd) {
            try {
              Plotly.restyle(gd as never, spec as never, idx as never)
            } catch {
              /* 图表重建竞态：跳过该帧 */
            }
          }
        }
      // A: 填充前缀 + 游标
      rst(gdA.current, { ...r0, fill: 'tozeroy', fillcolor: C.signalFill }, [1])
      rst(gdA.current, { x: [[tk, tk]], y: [yRange] }, [2])
      // B: 两组乘积前缀
      if (gdB.current && productsRef.current) {
        rst(gdB.current, { x: [t.subarray(0, k)], y: [productsRef.current.pRe.subarray(0, k)] }, [2])
        rst(gdB.current, { x: [t.subarray(0, k)], y: [productsRef.current.pIm.subarray(0, k)] }, [3])
      }
      // C: 螺线前缀 + 箭头 + 端点
      rst(gdC.current, { x: [cum0.Sre.subarray(0, k)], y: [cum0.Sim.subarray(0, k)] }, [0])
      rst(gdC.current, { x: [[0, Sre]], y: [[0, Sim]] }, [1])
      rst(gdC.current, { x: [[Sre]], y: [[Sim]] }, [2])
      if (cum1 && gdC.current) {
        rst(gdC.current, { x: [cum1.Sre.subarray(0, k)], y: [cum1.Sim.subarray(0, k)] }, [3])
        rst(gdC.current, { x: [[cum1.Sre[k]]], y: [[cum1.Sim[k]]] }, [4])
      }
      // D: 频谱取值动点
      rst(gdD.current, { x: [[w0]], y: [[Math.hypot(Sre, Sim)]] }, [1])
      if (cum1 && gdD.current) rst(gdD.current, { x: [[w1]], y: [[Math.hypot(cum1.Sre[k], cum1.Sim[k])]] }, [2])
      // 读数
      if (readRe.current) readRe.current.textContent = Sre.toFixed(4)
      if (readIm.current) readIm.current.textContent = Sim.toFixed(4)
      if (readAbs.current) readAbs.current.textContent = Math.hypot(Sre, Sim).toFixed(4)
        setScrub(k)
      } catch {
        /* 单帧绘制失败：静默跳过，等待下一帧 */
      }
    },
    [sampled, cum0, cum1, w0, w1, yRange],
  )

  // 乘积数组预计算（动画只做前缀切片）
  const products = useMemo(() => {
    if (!sampled) return null
    const n = sampled.re.length
    const pRe = new Float64Array(n)
    const pIm = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const tt = sampled.t[i]
      const c = Math.cos(w0 * tt)
      const s = Math.sin(w0 * tt)
      pRe[i] = sampled.re[i] * c + sampled.im[i] * s
      pIm[i] = sampled.im[i] * c - sampled.re[i] * s
    }
    return { pRe, pIm }
  }, [sampled, w0])

  useEffect(() => {
    productsRef.current = products
  }, [products])

  // ω 或信号变化 → 立即重绘当前帧
  useEffect(() => {
    draw(kRef.current)
  }, [draw, products])

  // 播放循环（按真实时间推进，标签页被节流时也能正确前进）
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let lastDraw = 0
    const tick = (now: number) => {
      const dms = Math.min(250, now - last)
      last = now
      kRef.current = (kRef.current + (dms / 1000) * speed * (N_ANIM / 8)) % N_ANIM
      if (now - lastDraw > 30) {
        lastDraw = now
        draw(Math.floor(kRef.current))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, draw])

  function jumpToPeak() {
    if (!spectrum) return
    let mi = 0
    for (let i = 0; i < spectrum.mag.length; i++) if (spectrum.mag[i] > spectrum.mag[mi]) mi = i
    setW0(Math.abs(spectrum.omegas[mi]))
  }

  // ---- 配置导入导出（JSON）----
  const snapshotBuild = () => ({
    presetId,
    expr,
    params: { ...params },
    wmax,
    w0,
    compare,
    w1,
    speed,
  })
  const snapshotApply = (d: Record<string, unknown>) => {
    const pid = str(d, 'presetId', ANIM_PRESETS[0].id)
    setPresetId(ANIM_PRESETS.some((p) => p.id === pid) ? pid : ANIM_PRESETS[0].id)
    // 等 [presetId] 的预设副作用先跑完，再覆盖为导入值
    deferApply(() => {
      const e = str(d, 'expr', '')
      if (e) setExpr(e)
      setParams(numRecord(d, 'params', PARAM_KEYS, DEFAULT_PARAMS) as Params)
      setWmax(num(d, 'wmax', wmax, 2, 60))
      setW0(num(d, 'w0', w0, 0, 60))
      setCompare(bool(d, 'compare', compare))
      setW1(num(d, 'w1', w1, 0, 60))
      setSpeed(num(d, 'speed', speed, 0.25, 4))
    })
  }

  // ---- 静态轨迹 ----
  const dataA = useMemo(() => {
    if (!sampled) return []
    return [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(sampled.t),
        y: Array.from(sampled.re),
        line: { color: 'rgba(251,191,36,0.45)', width: 1.2 },
        name: 'x(t)',
        hoverinfo: 'skip',
      },
      { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: C.signal, width: 1.6 }, name: t('anim.trIntegrated'), hoverinfo: 'skip' },
      { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: '#5c5644', width: 1 }, name: t('anim.trCurrentT'), hoverinfo: 'skip' },
    ]
  }, [sampled, t])

  const dataB = useMemo(() => {
    if (!sampled || !products) return []
    return [
      { type: 'scatter', mode: 'lines', x: Array.from(sampled.t), y: Array.from(products.pRe), line: { color: 'rgba(45,212,191,0.55)', width: 1 }, name: 'x·cos(ω₀t)', hoverinfo: 'skip' },
      { type: 'scatter', mode: 'lines', x: Array.from(sampled.t), y: Array.from(products.pIm), line: { color: 'rgba(244,114,182,0.55)', width: 1 }, name: '−x·sin(ω₀t)', hoverinfo: 'skip' },
      { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: C.real, width: 1.8 }, fill: 'tozeroy', fillcolor: 'rgba(45,212,191,0.14)', name: t('anim.trReAcc'), hoverinfo: 'skip' },
      { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: C.imag, width: 1.8 }, fill: 'tozeroy', fillcolor: 'rgba(244,114,182,0.12)', name: t('anim.trImAcc'), hoverinfo: 'skip' },
    ]
  }, [sampled, products, t])

  const dataC = useMemo(
    () => [
      { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: C.spectrum, width: 1.8 }, name: t('anim.trSpiral'), hoverinfo: 'skip' },
      { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: '#1d1a13', width: 2 }, name: t('anim.trVector'), hoverinfo: 'skip' },
      { type: 'scatter', mode: 'markers', x: [], y: [], marker: { color: '#1d1a13', size: 7 }, name: 'S(T)', hoverinfo: 'skip' },
      { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: C.compare, width: 1.4, dash: 'dot' }, name: t('anim.compareW1'), hoverinfo: 'skip' },
      { type: 'scatter', mode: 'markers', x: [], y: [], marker: { color: C.compare, size: 6 }, name: '', hoverinfo: 'skip', showlegend: false },
      {
        type: 'scatter',
        mode: 'markers',
        x: cum0 ? [cum0.Sre[N_ANIM]] : [],
        y: cum0 ? [cum0.Sim[N_ANIM]] : [],
        marker: { color: '#d4451f', size: 12, symbol: 'star' },
        name: t('anim.trEndpoint'),
        hovertemplate: 'X(ω₀)=%{x:.3f}%{y:+.3f}j<extra></extra>',
      },
    ],
    [cum0, t],
  )

  const dataD = useMemo(() => {
    if (!spectrum) return []
    return [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(spectrum.omegas),
        y: Array.from(spectrum.mag),
        line: { color: C.spectrum, width: 1.6 },
        fill: 'tozeroy',
        fillcolor: C.spectrumFill,
        name: '|X(ω)|',
      },
      { type: 'scatter', mode: 'markers', x: [], y: [], marker: { color: '#d4451f', size: 9, symbol: 'circle', line: { width: 1, color: '#000' } }, name: t('anim.trCurrentS') },
      { type: 'scatter', mode: 'markers', x: [], y: [], marker: { color: C.compare, size: 8, symbol: 'diamond' }, name: 'ω₁' },
    ]
  }, [spectrum, t])

  // layout 用 useMemo 固定引用，避免动画每帧 setScrub 重渲染时反复触发 Plotly.react 全量重绘
  const layoutA = useMemo(
    () => baseLayout(t('anim.ltA'), { xaxis: axis('t (s)'), yaxis: axis('x', { range: yRange }) }),
    [yRange, t],
  )
  const layoutB = useMemo(
    () => baseLayout(t('anim.ltB'), { xaxis: axis('t (s)'), yaxis: axis(t('anim.axisProduct')) }),
    [t],
  )
  const layoutC = useMemo(
    () =>
      baseLayout(t('anim.ltC'), {
        xaxis: axis('Re', { range: cRange, constrain: 'domain' }),
        yaxis: axis('Im', { range: cRange, scaleanchor: 'x', scaleratio: 1, constrain: 'domain' }),
      }),
    [cRange, t],
  )
  const layoutD = useMemo(
    () =>
      baseLayout(t('anim.ltD'), {
        xaxis: axis('ω (rad/s)', { range: [-wmax, wmax] }),
        yaxis: axis('|X|', { range: dRange }),
      }),
    [wmax, dRange, t],
  )

  const main = (
    <div className="charts">
      <div className="readout-bar">
        <div className="ro-item">
          <span className="ro-k">ω₀</span>
          <span className="ro-v">{w0.toFixed(2)} rad/s</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">f₀ = ω₀/2π</span>
          <span className="ro-v">{(w0 / TAU).toFixed(3)} Hz</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">Re ∫</span>
          <span className="ro-v" ref={readRe}>—</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">Im ∫</span>
          <span className="ro-v" ref={readIm}>—</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">|S(T)|</span>
          <span className="ro-v" ref={readAbs}>—</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">{t('anim.roFinal')}</span>
          <span className="ro-v" ref={readFinal}>{final0.toFixed(4)}</span>
        </div>
      </div>
      <div className="grid-2">
        <div className="chart-card" data-plate={t('anim.plate')}>
          <Plot data={dataA} layout={layoutA} height={215} onReady={(gd) => (gdA.current = gd)} />
        </div>
        <div className="chart-card">
          <Plot data={dataB} layout={layoutB} height={215} onReady={(gd) => (gdB.current = gd)} />
        </div>
        <div className="chart-card">
          <Plot data={dataC} layout={layoutC} height={265} onReady={(gd) => (gdC.current = gd)} />
        </div>
        <div className="chart-card">
          <Plot data={dataD} layout={layoutD} height={265} onReady={(gd) => (gdD.current = gd)} />
        </div>
      </div>
    </div>
  )

  const aside = (
    <>
      <Panel title={t('common.preset')}>
        <Select
          value={presetId}
          onChange={setPresetId}
          options={ANIM_PRESETS.map((p) => ({ value: p.id, label: pickLabel(lang, p) }))}
        />
        <Note>{lang === 'en' ? preset.hintEn : preset.hint}</Note>
      </Panel>
      <Panel title={t('common.exprCt')}>
        <TextInput value={expr} onChange={setExpr} />
        {!compiled.ok && <div className="expr-error">✗ {compiled.error}</div>}
      </Panel>
      {symbols.length > 0 && (
        <Panel title={t('common.params')}>
          {symbols.map((k) => (
            <Slider
              key={k}
              label={k}
              min={0.01}
              max={8}
              step={0.01}
              value={params[k as keyof Params]}
              onChange={(v) => setParams((p) => ({ ...p, [k]: v }))}
            />
          ))}
        </Panel>
      )}
      <Panel title={t('anim.freqPanel')}>
        <Slider label="ω₀" min={0} max={wmax} step={0.01} value={w0} onChange={setW0} unit="rad/s" />
        <div className="btn-row">
          <Btn tone="accent" onClick={jumpToPeak} title={t('anim.jumpPeakTitle')}>
            {t('anim.jumpPeak')}
          </Btn>
          <Btn onClick={() => setW0(0)}>ω₀ = 0</Btn>
        </div>
        <Toggle checked={compare} onChange={setCompare} label={t('anim.showCompare')} />
        {compare && (
          <Slider label={t('anim.compareW1')} min={0} max={wmax} step={0.01} value={w1} onChange={setW1} unit="rad/s" />
        )}
      </Panel>
      <Panel title={t('common.animPanel')}>
        <div className="btn-row">
          <Btn tone="accent" onClick={() => setPlaying((p) => !p)}>
            {playing ? t('common.pause') : t('common.play')}
          </Btn>
          <Btn onClick={() => { kRef.current = 0; draw(0) }}>{t('common.reset')}</Btn>
        </div>
        <Slider label={t('common.speed')} min={0.25} max={4} step={0.25} value={speed} onChange={setSpeed} fmt={(v) => `${v}×`} />
        <Slider
          label={t('anim.progress')}
          min={0}
          max={N_ANIM - 1}
          step={1}
          value={scrub}
          onChange={(v) => {
            kRef.current = v
            draw(Math.floor(v))
          }}
          fmt={(v) => `${((v / N_ANIM) * 100).toFixed(0)}%`}
        />
      </Panel>
      <Panel title={t('anim.legend')}>
        <div className="legend-list">
          <span><i style={{ background: C.signal }} /> {t('anim.leg1')}</span>
          <span><i style={{ background: C.real }} /> {t('anim.leg2')}</span>
          <span><i style={{ background: C.imag }} /> {t('anim.leg3')}</span>
          <span><i style={{ background: C.spectrum }} /> {t('anim.leg4')}</span>
          {compare && <span><i style={{ background: C.compare }} /> {t('anim.leg5')}</span>}
        </div>
      </Panel>
      <Panel title={t('common.snapshot')}>
        <SnapshotIO view="anim" build={snapshotBuild} apply={snapshotApply} />
      </Panel>
    </>
  )

  const explanation = (
    <Explanation>
      <ExpSection title={t('anim.explCalc')}>
        <Tex block tex={String.raw`X(\omega_0)=\int_{-\infty}^{\infty} x(t)\,\underbrace{e^{-j\omega_0 t}}_{\text{${t('anim.underbrace')}}}\,dt,\qquad \omega_0=${w0.toFixed(2)}\ \text{rad/s}`} />
        <div className="exp-note">
          {t('anim.calcNote1')}
          <Tex tex={String.raw`S(T)=\int_{t_{min}}^{T}x(t)e^{-j\omega_0t}dt`} />
          {t('anim.calcNote2')}
        </div>
      </ExpSection>
      <ExpSection title={t('anim.explWhy')}>
        <ul className="exp-list">
          <li>
            {t('anim.why1a')}
            <Tex tex={String.raw`e^{-j\omega_0 t}`} />
            {t('anim.why1b')}
            <Tex tex={String.raw`e^{+j\omega_0 t}`} />
            {t('anim.why1c')}
          </li>
          <li>{t('anim.why2')}</li>
          <li>
            {t('anim.why3a')}
            <Tex tex={String.raw`\omega_1`} />
            {t('anim.why3b')}
          </li>
          <li>
            {t('anim.why4a')}
            <Tex tex={String.raw`X(\omega_0)`} />
            {t('anim.why4b')}
          </li>
        </ul>
      </ExpSection>
      <ExpSection title={t('anim.explTips')}>
        <ul className="exp-list">
          <li>
            {t('anim.tip1a')}
            <Tex tex={String.raw`\int x\,dt`} />
            {t('anim.tip1b')}
          </li>
          <li>{t('anim.tip2')}</li>
          <li>{t('anim.tip3')}</li>
        </ul>
      </ExpSection>
    </Explanation>
  )

  return <LabLayout aside={aside} main={main} explanation={explanation} />
}
