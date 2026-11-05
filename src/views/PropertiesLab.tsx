// 模块三：傅里叶变换重要性质交互演示
// 时移 / 频移 / 尺度 / 卷积定理 / 微分
import { useDeferredValue, useMemo, useState } from 'react'
import { Plot } from '../components/Plot'
import { Panel, SegBtns, Select, Slider, SnapshotIO, Note } from '../components/ui'
import { ExpSection, Explanation, Tex } from '../components/Tex'
import { LabLayout } from '../components/LabLayout'
import { useI18n } from '../i18n'
import { compileSignal, makeSampler, DEFAULT_PARAMS, PARAM_KEYS, type Params } from '../lib/parser'
import { num, numRecord, str } from '../lib/snapshot'
import { sampleCT, ndft, linspace, unwrapMasked, maxAbs, derivative, interpAt, type Sampled } from '../lib/numeric'
import { PROP_BASE, PROP_H } from '../lib/presets'
import { C, axis, baseLayout } from '../lib/plotTheme'

type PropKind = 'shift' | 'freqshift' | 'scaling' | 'conv' | 'diff'

type PropDef = {
  value: PropKind
  label: string
  labelEn: string
  formula: string
  note: string
  noteEn: string
}

const PROPS: PropDef[] = [
  {
    value: 'shift',
    label: '时移',
    labelEn: 'Time shift',
    formula: String.raw`x(t-t_0)\ \longleftrightarrow\ e^{-j\omega t_0}X(\omega)`,
    note: '延迟只改变相位（线性相位 −ωt₀），幅度谱完全不变——“是什么”不变，“何时发生”体现在相位里。',
    noteEn: 'A delay changes only the phase (linear phase −ωt₀); the magnitude spectrum is untouched — “what it is” stays the same, “when it happens” lives in the phase.',
  },
  {
    value: 'freqshift',
    label: '频移',
    labelEn: 'Frequency shift',
    formula: String.raw`x(t)\,e^{j\omega_0 t}\ \longleftrightarrow\ X(\omega-\omega_0)`,
    note: '乘以复指数=频谱搬移；乘以余弦=上下各搬一半（调幅 AM 的原理）。这是通信调制与收音机选台的数学核心。',
    noteEn: 'Multiplying by a complex exponential shifts the spectrum; multiplying by a cosine moves half up and half down (the principle of AM). This is the mathematical core of modulation and radio tuning.',
  },
  {
    value: 'scaling',
    label: '尺度',
    labelEn: 'Scaling',
    formula: String.raw`x(at)\ \longleftrightarrow\ \frac{1}{|a|}X\!\left(\frac{\omega}{a}\right)`,
    note: '时域压缩 ↔ 频域展宽，且幅度乘 1/|a|。时宽×带宽=常数（不确定性原理的信号版）。',
    noteEn: 'Compression in time ↔ spreading in frequency, with amplitude scaled by 1/|a|. Time width × bandwidth = constant (the signal version of the uncertainty principle).',
  },
  {
    value: 'conv',
    label: '卷积定理',
    labelEn: 'Convolution theorem',
    formula: String.raw`x(t)*h(t)\ \longleftrightarrow\ X(\omega)\,H(\omega)`,
    note: '时域卷积（费力的积分）↔ 频域相乘（轻而易举）——这就是频域分析存在的理由。',
    noteEn: 'Convolution in time (an arduous integral) ↔ multiplication in frequency (effortless) — the very reason frequency-domain analysis exists.',
  },
  {
    value: 'diff',
    label: '微分',
    labelEn: 'Differentiation',
    formula: String.raw`\frac{dx(t)}{dt}\ \longleftrightarrow\ j\omega\,X(\omega)`,
    note: '微分=每个频率乘 jω：高频被放大（|ω| 因子）、直流被消灭。微分算子是高通滤波器。',
    noteEn: 'Differentiation multiplies every frequency by jω: high frequencies are amplified (the |ω| factor) and DC is annihilated. The derivative operator is a high-pass filter.',
  },
]

export default function PropertiesLab() {
  const { lang, t } = useI18n()
  const [kind, setKind] = useState<PropKind>('shift')
  const [baseId, setBaseId] = useState(PROP_BASE[0].id)
  const [baseP, setBaseP] = useState<Partial<Params>>(PROP_BASE[0].params ?? {})
  const base = PROP_BASE.find((p) => p.id === baseId) ?? PROP_BASE[0]

  const [hId, setHId] = useState(PROP_H[0].id)
  const h = PROP_H.find((p) => p.id === hId) ?? PROP_H[0]

  const [t0, setT0] = useState(1)
  const [w0, setW0] = useState(6)
  const [a, setA] = useState(2)
  const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS, ...base.params })
  const [hParams, setHParams] = useState<Params>({ ...DEFAULT_PARAMS, ...h.params })

  function pickBase(id: string) {
    const p = PROP_BASE.find((q) => q.id === id) ?? PROP_BASE[0]
    setBaseId(id)
    setBaseP(p.params ?? {})
    setParams({ ...DEFAULT_PARAMS, ...p.params })
  }

  const merged: Params = { ...params, ...baseP }
  const N = 4096
  const M = 801

  const compiledX = useMemo(() => compileSignal(base.expr), [base.expr])
  const compiledH = useMemo(() => compileSignal(h.expr), [h.expr])

  // ---- 基信号 ----
  const baseS: Sampled | null = useMemo(() => {
    if (!compiledX.ok) return null
    const s = makeSampler(compiledX.compiled, 'ct', merged)
    return sampleCT(s, base.win![0], base.win![1], N)
  }, [compiledX, merged, base])

  const omegas = useMemo(() => linspace(-25, 25, M), [])
  const baseX = useMemo(() => (baseS ? ndft(baseS.re, baseS.im, baseS.t0, baseS.dt, omegas) : null), [baseS, omegas])

  // ---- 变换后的信号 ----
  const dParams = useDeferredValue({ kind, t0, w0, a, merged, hParams, hId })
  const trans = useMemo((): { s2: Sampled | null; label: string } => {
    const { kind, t0, w0, a, merged, hParams, hId } = dParams
    if (!compiledX.ok || !baseS) return { s2: null, label: '' }
    if (kind === 'shift') {
      const smp = makeSamplerCached(compiledX, 'ct', merged)
      const f = (t: number) => smp(t - t0)
      return { s2: sampleCT(f, baseS.t0 + t0, baseS.t0 + t0 + (baseS.t.length - 1) * baseS.dt, N), label: `x(t−${t0.toFixed(2)})` }
    }
    if (kind === 'freqshift') {
      const smp = makeSamplerCached(compiledX, 'ct', merged)
      const f = (t: number) => {
        const v = smp(t)
        return { re: v.re * Math.cos(w0 * t) - v.im * Math.sin(w0 * t), im: v.im * Math.cos(w0 * t) + v.re * Math.sin(w0 * t) }
      }
      return { s2: sampleCT(f, baseS.t0, baseS.t0 + (baseS.t.length - 1) * baseS.dt, N), label: `x(t)·cos(${w0.toFixed(1)}t)` }
    }
    if (kind === 'scaling') {
      const smp = makeSamplerCached(compiledX, 'ct', merged)
      const f = (t: number) => smp(t * a)
      const half = ((baseS.t.length - 1) * baseS.dt) / (2 * a)
      return { s2: sampleCT(f, -half, half, N), label: `x(${a.toFixed(2)}t)` }
    }
    if (kind === 'conv') {
      const ch = compileSignal(h.expr)
      if (!ch.ok || !compiledH.ok) return { s2: null, label: '' }
      const sh = makeSampler(compiledH.compiled, 'ct', hParams)
      const sH = sampleCT(sh, h.win![0], h.win![1], N)
      // 时域卷积 y = dt·conv(x, h)
      const conv = convolveSigned(baseS, sH)
      const t0y = baseS.t0 + h.win![0]
      return {
        s2: {
          t: linspace(t0y, t0y + (conv.re.length - 1) * baseS.dt, conv.re.length),
          re: conv.re,
          im: conv.im,
          t0: t0y,
          dt: baseS.dt,
          nonFinite: 0,
        },
        label: 'y = x ∗ h',
      }
    }
    // diff
    const dre = derivative(baseS.re, baseS.dt)
    const dim = derivative(baseS.im, baseS.dt)
    return {
      s2: { t: baseS.t, re: dre, im: dim, t0: baseS.t0, dt: baseS.dt, nonFinite: 0 },
      label: 'dx/dt',
    }
  }, [dParams, compiledX, baseS, compiledH, hParams, h])

  const X2 = useMemo(
    () => (trans.s2 ? ndft(trans.s2.re, trans.s2.im, trans.s2.t0, trans.s2.dt, omegas) : null),
    [trans, omegas],
  )

  // ---- 图：时域对比 ----
  const timeTraces = useMemo(() => {
    if (!baseS || !trans.s2) return []
    return [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(baseS.t),
        y: Array.from(baseS.re),
        line: { color: C.signal, width: 1.6 },
        name: 'x(t)',
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(trans.s2.t),
        y: Array.from(trans.s2.re),
        line: { color: C.compare, width: 1.6 },
        name: trans.label,
      },
    ]
  }, [baseS, trans])

  // ---- 图：幅度谱对比 ----
  const magTraces = useMemo(() => {
    if (!baseX || !X2) return []
    const mag1 = Float64Array.from(baseX.re, (_, i) => Math.hypot(baseX.re[i], baseX.im[i]))
    const mag2 = Float64Array.from(X2.re, (_, i) => Math.hypot(X2.re[i], X2.im[i]))
    const traces: unknown[] = [
      { type: 'scatter', mode: 'lines', x: Array.from(omegas), y: Array.from(mag1), line: { color: C.spectrum, width: 1.5 }, name: '|X(ω)|' },
      { type: 'scatter', mode: 'lines', x: Array.from(omegas), y: Array.from(mag2), line: { color: C.compare, width: 1.5 }, name: t('props.trTransformed') },
    ]
    if (kind === 'scaling') {
      // 理论预测 (1/|a|)·|X(ω/a)|
      const pred: (number | null)[] = []
      for (let i = 0; i < omegas.length; i++) {
        const v = interpAt(omegas, mag1, omegas[i] / a)
        pred.push(isFinite(v) ? Math.abs(1 / a) * v : NaN)
      }
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: Array.from(omegas),
        y: pred,
        line: { color: '#1d1a13', width: 1, dash: 'dot' },
        name: t('props.trScaleTheory'),
      })
    }
    if (kind === 'conv') {
      // 频域乘积预测 |X|·|H|
      if (compiledH.ok) {
        const sh = makeSampler(compiledH.compiled, 'ct', hParams)
        const sH = sampleCT(sh, h.win![0], h.win![1], N)
        const H = ndft(sH.re, sH.im, sH.t0, sH.dt, omegas)
        const prod = Float64Array.from(mag1, (v, i) => v * Math.hypot(H.re[i], H.im[i]))
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: Array.from(omegas),
          y: Array.from(prod),
          line: { color: '#1d1a13', width: 1, dash: 'dot' },
          name: t('props.trConvTheory'),
        })
      }
    }
    if (kind === 'diff') {
      // 理论 |ω|·|X|
      const prod = Float64Array.from(mag1, (v, i) => Math.abs(omegas[i]) * v)
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: Array.from(omegas),
        y: Array.from(prod),
        line: { color: '#1d1a13', width: 1, dash: 'dot' },
        name: t('props.trDiffTheory'),
      })
    }
    return traces
  }, [baseX, X2, omegas, kind, a, compiledH, hParams, h, baseS, t])

  // ---- 图：相位对比（时移专用）----
  const phaseTraces = useMemo(() => {
    if (kind !== 'shift' || !baseX || !X2) return []
    const mag1 = Float64Array.from(baseX.re, (_, i) => Math.hypot(baseX.re[i], baseX.im[i]))
    const mag2 = Float64Array.from(X2.re, (_, i) => Math.hypot(X2.re[i], X2.im[i]))
    const m = maxAbs(mag1)
    const th = 0.004 * (m || 1)
    const p1 = Float64Array.from(baseX.im, (_, i) => Math.atan2(baseX.im[i], baseX.re[i] || 1e-300))
    const p2 = Float64Array.from(X2.im, (_, i) => Math.atan2(X2.im[i], X2.re[i] || 1e-300))
    const u1 = unwrapMasked(p1, (i) => mag1[i] > th)
    const u2 = unwrapMasked(p2, (i) => mag2[i] > th)
    const mk = (arr: Float64Array) => {
      const x: number[] = []
      const y: number[] = []
      for (let i = 0; i < arr.length; i++) {
        x.push(omegas[i])
        y.push(mag1[i] > th ? arr[i] : NaN)
      }
      return { x, y }
    }
    return [
      { type: 'scatter', mode: 'lines', ...mk(u1), line: { color: C.spectrum, width: 1.5 }, name: '∠X' },
      { type: 'scatter', mode: 'lines', ...mk(u2), line: { color: C.compare, width: 1.5 }, name: '∠[e^{-jωt₀}X]' },
    ]
  }, [kind, baseX, X2, omegas])

  // 时宽 × 带宽（尺度性质数值验证）
  const tb = useMemo(() => {
    if (!baseS || !trans.s2) return null
    const dur = (s: Sampled) => {
      let e = 0
      let m = 0
      for (let i = 0; i < s.re.length; i++) e += s.re[i] * s.re[i] + s.im[i] * s.im[i]
      for (let i = 0; i < s.re.length; i++) m += (s.re[i] * s.re[i] + s.im[i] * s.im[i]) * s.t[i] * s.t[i]
      return m / e > 0 ? Math.sqrt(m / e) : 0
    }
    const bw = (X: { re: Float64Array; im: Float64Array } | null) => {
      if (!X) return 0
      let e = 0
      let m = 0
      for (let i = 0; i < X.re.length; i++) {
        const v = X.re[i] * X.re[i] + X.im[i] * X.im[i]
        e += v
        m += v * omegas[i] * omegas[i]
      }
      return e > 0 ? Math.sqrt(m / e) : 0
    }
    const t1 = dur(baseS)
    const t2 = dur(trans.s2!)
    const b1 = bw(baseX)
    const b2 = bw(X2)
    return { t1, t2, b1, b2, p1: t1 * b1, p2: t2 * b2 }
  }, [baseS, baseX, trans, X2, omegas])

  const current = PROPS.find((p) => p.value === kind)!

  // layout（依赖 t，语言切换时重建）
  const TIME_LAYOUT = useMemo(
    () => ({ ...baseLayout(t('props.ltTime')), xaxis: axis('t (s)'), yaxis: axis(t('common.magnitude')) }),
    [t],
  )
  const MAG_LAYOUT = useMemo(
    () => ({ ...baseLayout(t('props.ltMag')), xaxis: axis('ω (rad/s)'), yaxis: axis('|X|') }),
    [t],
  )
  const PHASE_LAYOUT = useMemo(
    () => ({
      ...baseLayout(t('props.ltPhase')),
      xaxis: axis('ω (rad/s)'),
      yaxis: axis('rad'),
    }),
    [t],
  )

  // ---- 配置导入导出（JSON）----
  const snapshotBuild = () => ({
    kind,
    baseId,
    params: { ...params },
    hId,
    hParams: { ...hParams },
    t0,
    w0,
    a,
  })
  const snapshotApply = (d: Record<string, unknown>) => {
    setKind(str(d, 'kind', kind, ['shift', 'freqshift', 'scaling', 'conv', 'diff']) as PropKind)
    const bid = str(d, 'baseId', baseId)
    const bp = PROP_BASE.find((q) => q.id === bid)
    if (bp) {
      setBaseId(bp.id)
      setBaseP(bp.params ?? {})
    }
    setParams(numRecord(d, 'params', PARAM_KEYS, DEFAULT_PARAMS) as Params)
    const hid = str(d, 'hId', hId)
    const hp = PROP_H.find((q) => q.id === hid)
    if (hp) {
      setHId(hp.id)
      setHParams({ ...DEFAULT_PARAMS, ...hp.params })
    }
    setHParams(numRecord(d, 'hParams', PARAM_KEYS, { ...DEFAULT_PARAMS, ...(hp ? hp.params : {}) }) as Params)
    setT0(num(d, 't0', t0, -3, 3))
    setW0(num(d, 'w0', w0, 0.5, 20))
    setA(num(d, 'a', a, 0.25, 4))
  }

  const main = (
    <div className="charts">
      <div className="grid-2">
        <div className="chart-card" data-plate={t('props.plate')}>
          <Plot data={timeTraces} layout={TIME_LAYOUT} height={250} />
        </div>
        <div className="chart-card">
          <Plot data={magTraces} layout={MAG_LAYOUT} height={250} />
        </div>
        {kind === 'shift' && (
          <div className="chart-card span-2">
            <Plot data={phaseTraces} layout={PHASE_LAYOUT} height={225} />
          </div>
        )}
        {kind === 'scaling' && tb && (
          <div className="chart-card span-2 stat-card">
            <div className="stat-row">
              <span>
                {t('props.tbOriginal')} {t('props.tbTime')}<b className="mono">{tb.t1.toFixed(3)}</b>{t('common.tbSep')}
                {t('props.tbBand')}<b className="mono">{tb.b1.toFixed(3)}</b>{t('common.tbSep')}
                {t('props.tbProduct')}<b className="mono">{tb.p1.toFixed(3)}</b>
              </span>
              <span>
                {t('props.tbTrans')} {t('props.tbTime')}<b className="mono">{tb.t2.toFixed(3)}</b>{t('common.tbSep')}
                {t('props.tbBand')}<b className="mono">{tb.b2.toFixed(3)}</b>{t('common.tbSep')}
                {t('props.tbProduct')}<b className="mono">{tb.p2.toFixed(3)}</b>
              </span>
            </div>
            <div className="exp-note" style={{ marginTop: 6 }}>
              {t('props.tbNote')}
            </div>
          </div>
        )}
        {kind === 'diff' && (
          <div className="chart-card span-2 stat-card">
            <div className="exp-note">{t('props.diffStat')}</div>
          </div>
        )}
        {kind === 'conv' && (
          <div className="chart-card span-2 stat-card">
            <div className="exp-note">{t('props.convStat')}</div>
          </div>
        )}
      </div>
    </div>
  )

  const aside = (
    <>
      <Panel title={t('props.panel')}>
        <SegBtns
          options={PROPS.map((p) => ({ value: p.value, label: lang === 'en' ? p.labelEn : p.label }))}
          value={kind}
          onChange={(v) => setKind(v)}
        />
      </Panel>
      <Panel title={t('props.basePanel')}>
        <Select
          value={baseId}
          onChange={pickBase}
          options={PROP_BASE.map((p) => ({ value: p.id, label: lang === 'en' ? p.labelEn : p.label }))}
        />
        {Object.keys(baseP).length > 0 && (
          <Slider
            label={t('props.tauSlider')}
            min={0.1}
            max={4}
            step={0.01}
            value={merged.tau}
            onChange={(v) => setParams((p) => ({ ...p, tau: v }))}
          />
        )}
      </Panel>
      {kind === 'shift' && (
        <Panel title={t('props.shiftPanel')}>
          <Slider label="t₀" min={-3} max={3} step={0.01} value={t0} onChange={setT0} unit="s" />
        </Panel>
      )}
      {kind === 'freqshift' && (
        <Panel title={t('props.modPanel')}>
          <Slider label="ω₀" min={0.5} max={20} step={0.01} value={w0} onChange={setW0} unit="rad/s" />
          <Note>{t('props.modNote')}</Note>
        </Panel>
      )}
      {kind === 'scaling' && (
        <Panel title={t('props.scalePanel')}>
          <Slider label="a" min={0.25} max={4} step={0.01} value={a} onChange={setA} />
          <Note>{t('props.scaleNote')}</Note>
        </Panel>
      )}
      {kind === 'conv' && (
        <Panel title={t('props.convPanel')}>
          <Select
            value={hId}
            onChange={(v) => {
              const p = PROP_H.find((q) => q.id === v) ?? PROP_H[0]
              setHId(v)
              setHParams({ ...DEFAULT_PARAMS, ...p.params })
            }}
            options={PROP_H.map((p) => ({ value: p.id, label: lang === 'en' ? p.labelEn : p.label }))}
          />
          <Slider label={t('props.hSlider')} min={0.2} max={4} step={0.01} value={hParams.tau} onChange={(v) => setHParams((p) => ({ ...p, tau: v, a: v }))} />
        </Panel>
      )}
      {kind === 'diff' && (
        <Panel title={t('props.diffPanel')}>
          <Note>{t('props.diffNote')}</Note>
        </Panel>
      )}
      <Panel title={t('common.snapshot')}>
        <SnapshotIO view="props" build={snapshotBuild} apply={snapshotApply} />
      </Panel>
    </>
  )

  const explanation = (
    <Explanation>
      <ExpSection title={t('props.explCurrent')}>
        <Tex block tex={current.formula} />
        <div className="exp-note">{lang === 'en' ? current.noteEn : current.note}</div>
      </ExpSection>
      <ExpSection title={t('props.explParams')}>
        <div className="exp-note mono">
          {kind === 'shift' && `t₀ = ${t0.toFixed(2)} s`}
          {kind === 'freqshift' && `ω₀ = ${w0.toFixed(2)} rad/s`}
          {kind === 'scaling' && `a = ${a.toFixed(2)}`}
          {kind === 'conv' && `${t('props.convValues')}${lang === 'en' ? base.labelEn : base.label}${t('props.convValuesH')}${lang === 'en' ? h.labelEn : h.label}`}
          {kind === 'diff' && t('props.diffValues') + (baseS ? baseS.dt.toExponential(2) : '—') + ' s'}
        </div>
      </ExpSection>
      <ExpSection title={t('common.explIntuition')}>
        <ul className="exp-list">
          {kind === 'shift' && (
            <>
              <li>{t('props.shift1')}</li>
              <li>{t('props.shift2')}</li>
            </>
          )}
          {kind === 'freqshift' && (
            <>
              <li>{t('props.freq1')}</li>
              <li>{t('props.freq2')}</li>
            </>
          )}
          {kind === 'scaling' && (
            <>
              <li>{t('props.scale1')}</li>
              <li>{t('props.scale2')}</li>
            </>
          )}
          {kind === 'conv' && (
            <>
              <li>{t('props.conv1')}</li>
              <li>{t('props.conv2')}</li>
            </>
          )}
          {kind === 'diff' && (
            <>
              <li>{t('props.diff1')}</li>
              <li>{t('props.diff2')}</li>
            </>
          )}
        </ul>
      </ExpSection>
    </Explanation>
  )

  return <LabLayout aside={aside} main={main} explanation={explanation} />
}

/* ---- helpers ---- */

function makeSamplerCached(compiled: { ok: true; compiled: import('../lib/parser').CompiledExpr } | { ok: false; error: string }, domain: 'ct', params: Params) {
  return makeSampler((compiled as { ok: true; compiled: import('../lib/parser').CompiledExpr }).compiled, domain, params)
}

function convolveSigned(a: Sampled, b: Sampled): { re: Float64Array; im: Float64Array } {
  const Na = a.re.length
  const Nb = b.re.length
  const Nr = Na + Nb - 1
  const re = new Float64Array(Nr)
  const im = new Float64Array(Nr)
  for (let i = 0; i < Na; i++) {
    const ar = a.re[i]
    const ai = a.im[i]
    if (ar === 0 && ai === 0) continue
    for (let j = 0; j < Nb; j++) {
      const br = b.re[j]
      const bi = b.im[j]
      re[i + j] += ar * br - ai * bi
      im[i + j] += ar * bi + ai * br
    }
  }
  const dt = a.dt
  for (let i = 0; i < Nr; i++) {
    re[i] *= dt
    im[i] *= dt
  }
  return { re, im }
}
