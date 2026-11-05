// 模块一：傅里叶变换实验室（CTFT / DTFT）
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Plot } from '../components/Plot'
import { Badge, Field, NumberField, Panel, SegBtns, Select, Slider, SnapshotIO, TextInput, Toggle, Note } from '../components/ui'
import { ExpSection, Explanation, KV, Tex } from '../components/Tex'
import { LabLayout } from '../components/LabLayout'
import { useI18n, pickLabel, pickNote } from '../i18n'
import {
  compileSignal,
  makeSampler,
  usedParams,
  DEFAULT_PARAMS,
  PARAM_KEYS,
  type Domain,
  type Params,
} from '../lib/parser'
import { bool, deferApply, num, numArray2, numRecord, str } from '../lib/snapshot'
import {
  sampleCT,
  sampleDT,
  ndft,
  linspace,
  unwrap,
  unwrapMasked,
  maxAbs,
  type Sampled,
} from '../lib/numeric'
import { CT_SIGNALS, DT_SIGNALS, type SignalPreset } from '../lib/presets'
import { C, axis, baseLayout } from '../lib/plotTheme'

const QUALITY_N = [
  { N: 2048, M: 401 },
  { N: 4096, M: 801 },
  { N: 8192, M: 1401 },
]
const QUALITY_KEYS = ['fourier.qFast', 'fourier.qStd', 'fourier.qFine'] as const

const CTAU = 2 * Math.PI

export default function FourierLab() {
  const { lang, t } = useI18n()
  const [domain, setDomain] = useState<Domain>('ct')
  const presets = domain === 'ct' ? CT_SIGNALS : DT_SIGNALS
  const [presetId, setPresetId] = useState(CT_SIGNALS[0].id)

  const preset: SignalPreset = useMemo(
    () => presets.find((p) => p.id === presetId) ?? presets[0],
    [presets, presetId],
  )

  const [expr, setExpr] = useState(preset.expr)
  const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS, ...preset.params })
  const [win, setWin] = useState<[number, number]>(preset.win ?? [-1, 6])
  const [nwin, setNwin] = useState<[number, number]>(preset.nwin ?? [0, 64])
  const [quality, setQuality] = useState(1)
  const [unit, setUnit] = useState<'rad' | 'hz'>('rad')
  const [wmax, setWmax] = useState(preset.wmax ?? 25)
  const [unwrapPhase, setUnwrapPhase] = useState(true)

  // 切换预设 / 切换时域类型 → 应用预设参数
  useEffect(() => {
    applyPreset(preset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, domain])

  function applyPreset(p: SignalPreset) {
    setExpr(p.expr)
    setParams({ ...DEFAULT_PARAMS, ...p.params })
    if (p.win) setWin(p.win)
    if (p.nwin) setNwin(p.nwin)
    if (p.wmax) setWmax(p.wmax)
  }

  function switchDomain(d: Domain) {
    setDomain(d)
    const list = d === 'ct' ? CT_SIGNALS : DT_SIGNALS
    setPresetId(list[0].id)
  }

  const compiled = useMemo(() => compileSignal(expr), [expr])
  const symbols = compiled.ok ? usedParams(compiled.symbols) : []
  const sampler = useMemo(
    () => (compiled.ok ? makeSampler(compiled.compiled, domain, params) : null),
    [compiled, domain, params],
  )

  // 重计算较重的部分在拖动滑杆时降级（React 并发特性）
  const dParams = useDeferredValue(params)
  const dSampler = useMemo(
    () => (compiled.ok ? makeSampler(compiled.compiled, domain, dParams) : null),
    [compiled, domain, dParams],
  )

  const { N, M } = QUALITY_N[quality]

  const sampled: Sampled | null = useMemo(() => {
    if (!dSampler) return null
    if (domain === 'ct') return sampleCT(dSampler, win[0], win[1], N)
    return sampleDT(dSampler, nwin[0], nwin[1])
  }, [dSampler, domain, win, nwin, N])

  const omegas = useMemo(
    () => (domain === 'ct' ? linspace(-wmax, wmax, M) : linspace(-Math.PI, Math.PI, M)),
    [domain, wmax, M],
  )

  const spec = useMemo(() => {
    if (!sampled) return null
    return ndft(sampled.re, sampled.im, sampled.t0, sampled.dt, omegas)
  }, [sampled, omegas])

  // ---- 频率轴（rad/s ↔ Hz）----
  const freqAxisVals = useMemo(() => {
    if (domain === 'dt') return omegas
    return unit === 'hz' ? Float64Array.from(omegas, (w) => w / CTAU) : omegas
  }, [omegas, domain, unit])

  const freqLabel = domain === 'dt' ? t('fourier.freqLabelDt') : unit === 'hz' ? 'f (Hz)' : 'ω (rad/s)'

  // ---- Parseval 一致性校验 ----
  const parseval = useMemo(() => {
    if (!sampled || !spec) return null
    let et = 0
    for (let i = 0; i < sampled.re.length; i++) et += sampled.re[i] * sampled.re[i] + sampled.im[i] * sampled.im[i]
    et *= sampled.dt
    let ef = 0
    const dw = omegas[1] - omegas[0]
    for (let i = 0; i < spec.re.length; i++) ef += spec.re[i] * spec.re[i] + spec.im[i] * spec.im[i]
    ef *= dw / (2 * Math.PI) // ndft 已含 dt 因子，Parseval: ∫|x|²dt = (1/2π)∫|X|²dω
    const ratio = et > 1e-12 ? ef / et : NaN
    return { et, ef, ratio }
  }, [sampled, spec, omegas])

  // ---- 轨迹 ----
  const timeTraces = useMemo(() => {
    if (!sampled) return []
    const x = Array.from(sampled.t)
    const traces: unknown[] = []
    const hasImag = maxAbs(sampled.im) > 1e-6 * Math.max(1e-12, maxAbs(sampled.re))
    if (domain === 'dt') {
      traces.push({
        type: 'bar',
        x,
        y: Array.from(sampled.re),
        marker: { color: C.signal, opacity: 0.85 },
        name: 'x[n]',
        hovertemplate: 'n=%{x:.0f}<br>x=%{y:.4g}<extra></extra>',
      })
    } else {
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x,
        y: Array.from(sampled.re),
        line: { color: C.signal, width: 2 },
        name: hasImag ? 'Re x(t)' : 'x(t)',
        hovertemplate: 't=%{x:.3g}<br>%{y:.4g}<extra></extra>',
      })
      if (hasImag) {
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x,
          y: Array.from(sampled.im),
          line: { color: C.imag, width: 1.4, dash: 'dot' },
          name: 'Im x(t)',
        })
      }
    }
    return traces
  }, [sampled, domain])

  const magTrace = useMemo(() => {
    if (!spec) return null
    const mag = Float64Array.from(spec.re, (_, i) => Math.hypot(spec.re[i], spec.im[i]))
    return {
      type: 'scatter',
      mode: 'lines',
      x: Array.from(freqAxisVals),
      y: Array.from(mag),
      line: { color: C.spectrum, width: 1.8 },
      fill: 'tozeroy',
      fillcolor: C.spectrumFill,
      name: '|X|',
      hovertemplate: `%{x:.4g} ${domain === 'dt' ? 'rad' : unit === 'hz' ? 'Hz' : 'rad/s'}<br>|X|=%{y:.4g}<extra></extra>`,
    }
  }, [spec, freqAxisVals, unit, domain])

  const phaseTrace = useMemo(() => {
    if (!spec) return null
    const mag = Float64Array.from(spec.re, (_, i) => Math.hypot(spec.re[i], spec.im[i]))
    const m = maxAbs(mag)
    const ph = Float64Array.from(spec.im, (_, i) => Math.atan2(spec.im[i], spec.re[i] || 1e-300))
    const th = 0.004 * (m || 1)
    const unwrapped = unwrapPhase ? unwrapMasked(ph, (i) => mag[i] > th) : ph
    const x: number[] = []
    const y: number[] = []
    for (let i = 0; i < mag.length; i++) {
      if (mag[i] > th) {
        x.push(freqAxisVals[i])
        y.push(unwrapped[i])
      } else {
        x.push(freqAxisVals[i])
        y.push(NaN)
      }
    }
    return {
      type: 'scatter',
      mode: 'lines',
      x,
      y,
      line: { color: C.phase, width: 1.6 },
      name: '∠X',
      connectgaps: false,
      hovertemplate: '%{x:.4g}<br>∠X=%{y:.3g} rad<extra></extra>',
    }
  }, [spec, freqAxisVals, unwrapPhase])

  const reImTraces = useMemo(() => {
    if (!spec) return null
    return [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(freqAxisVals),
        y: Array.from(spec.re),
        line: { color: C.real, width: 1.6 },
        name: 'Re X',
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(freqAxisVals),
        y: Array.from(spec.im),
        line: { color: C.imag, width: 1.6 },
        name: 'Im X',
      },
    ]
  }, [spec, freqAxisVals])

  // ---- 峰值频率 ----
  const peak = useMemo(() => {
    if (!spec) return null
    let mi = 0
    let mv = 0
    for (let i = 0; i < spec.re.length; i++) {
      const v = Math.hypot(spec.re[i], spec.im[i])
      if (v > mv) {
        mv = v
        mi = i
      }
    }
    const w = Math.abs(omegas[mi])
    return { w, mag: mv }
  }, [spec, omegas])

  // ---- 截断提示 ----
  const truncation = useMemo(() => {
    if (!sampled) return false
    const n = sampled.re.length
    if (n < 4) return false
    const m = maxAbs(sampled.re)
    if (m < 1e-9) return false
    const edge = Math.max(
      Math.abs(sampled.re[0]) + Math.abs(sampled.im[0]),
      Math.abs(sampled.re[n - 1]) + Math.abs(sampled.im[n - 1]),
    )
    return edge > 0.03 * m
  }, [sampled])

  const timeTitle = domain === 'ct' ? t('fourier.timeTitleCt') : t('fourier.timeTitleDt')

  // layout 用 useMemo 固定引用，避免无关 state 变化引发的重渲染反复触发 Plotly.react 全量重绘
  const layoutTime = useMemo(
    () => ({ ...baseLayout(timeTitle), xaxis: axis(domain === 'ct' ? 't (s)' : 'n'), yaxis: axis(t('common.magnitude')) }),
    [timeTitle, domain, t],
  )
  const layoutMag = useMemo(
    () => ({ ...baseLayout(t('fourier.magTitle')), xaxis: axis(freqLabel), yaxis: axis('|X|') }),
    [freqLabel, t],
  )
  const layoutPhase = useMemo(
    () => ({ ...baseLayout(t('fourier.phaseTitle')), xaxis: axis(freqLabel), yaxis: axis('rad') }),
    [freqLabel, t],
  )
  const layoutReIm = useMemo(
    () => ({ ...baseLayout(t('fourier.reImTitle')), xaxis: axis(freqLabel), yaxis: axis(t('common.magnitude')) }),
    [freqLabel, t],
  )

  // ---- 配置导入导出（JSON）----
  const snapshotBuild = () => ({
    domain,
    presetId,
    expr,
    params: { ...params },
    win: [...win],
    nwin: [...nwin],
    quality,
    unit,
    wmax,
    unwrapPhase,
  })
  const snapshotApply = (d: Record<string, unknown>) => {
    const dom = str(d, 'domain', domain, ['ct', 'dt']) as Domain
    const list = dom === 'ct' ? CT_SIGNALS : DT_SIGNALS
    const pid = str(d, 'presetId', list[0].id)
    setDomain(dom)
    setPresetId(list.some((p) => p.id === pid) ? pid : list[0].id)
    // 等 [presetId, domain] 的预设副作用先跑完，再覆盖为导入值
    deferApply(() => {
      const e = str(d, 'expr', '')
      if (e) setExpr(e)
      setParams(numRecord(d, 'params', PARAM_KEYS, DEFAULT_PARAMS) as Params)
      setWin(numArray2(d, 'win', win))
      setNwin(numArray2(d, 'nwin', nwin))
      setQuality(Math.round(num(d, 'quality', quality, 0, QUALITY_N.length - 1)))
      setUnit(str(d, 'unit', unit, ['rad', 'hz']) as 'rad' | 'hz')
      setWmax(num(d, 'wmax', wmax, 1, 80))
      setUnwrapPhase(bool(d, 'unwrapPhase', unwrapPhase))
    })
  }

  const main = (
    <div className="charts">
      <div className="chart-card span-2" data-plate={t('plates.fourier')}>
        <Plot data={timeTraces} layout={layoutTime} height={210} />
      </div>
      <div className="chart-card span-2">
        {magTrace && (
          <Plot data={[magTrace]} layout={layoutMag} height={235} />
        )}
      </div>
      <div className="chart-card">
        {phaseTrace && (
          <Plot data={[phaseTrace]} layout={layoutPhase} height={215} />
        )}
      </div>
      <div className="chart-card parseval-card">
        <div className="pv-title">{t('fourier.parsevalTitle')}</div>
        {parseval && (
          <>
            <div className="pv-row">
              <span>{t('fourier.etLabel')}</span>
              <b className="mono">{parseval.et.toFixed(4)}</b>
            </div>
            <div className="pv-row">
              <span>{t('fourier.efLabel')}</span>
              <b className="mono">{parseval.ef.toFixed(4)}</b>
            </div>
            <div className="pv-bar">
              <div className="pv-bar-fill" style={{ width: `${Math.min(100, (parseval.ratio || 0) * 100)}%` }} />
              <span className="pv-bar-label">{t('fourier.ratio')} {(parseval.ratio || 0).toFixed(3)}</span>
            </div>
            <div className="pv-hint">
              {parseval.ratio && parseval.ratio > 0.985 ? t('fourier.pvOk') : t('fourier.pvHint')}
            </div>
          </>
        )}
      </div>
      <div className="chart-card span-2">
        {reImTraces && (
          <Plot data={reImTraces} layout={layoutReIm} height={215} />
        )}
      </div>
    </div>
  )

  const aside = (
    <>
      <Panel title={t('common.domain')}>
        <SegBtns
          options={[
            { value: 'ct', label: t('fourier.ct') },
            { value: 'dt', label: t('fourier.dt') },
          ]}
          value={domain}
          onChange={switchDomain}
        />
      </Panel>

      <Panel title={t('common.preset')}>
        <Select
          value={presetId}
          onChange={setPresetId}
          options={presets.map((p) => ({ value: p.id, label: pickLabel(lang, p) }))}
        />
        <Note>{pickNote(lang, preset)}</Note>
      </Panel>

      <Panel title={domain === 'ct' ? t('common.exprCt') : t('common.exprDt')}>
        <TextInput value={expr} onChange={setExpr} placeholder="exp(-a*t)*sin(2*pi*f0*t)*u(t)" />
        {!compiled.ok && <div className="expr-error">✗ {compiled.error}</div>}
        {compiled.ok && sampled && sampled.nonFinite > 0 && (
          <div className="expr-warn">⚠ {t('fourier.singularWarn', { n: sampled.nonFinite })}</div>
        )}
        <div className="help-list">
          <span>{t('fourier.helpSymbols')}</span>
          <span>{t('fourier.helpParams')}</span>
        </div>
      </Panel>

      {symbols.length > 0 && (
        <Panel title={t('common.params')}>
          {symbols.map((k) => {
            const cfg: Record<string, { min: number; max: number; step: number; label: string }> = {
              a: { min: 0.01, max: 6, step: 0.01, label: 'a' },
              b: { min: 0.01, max: 10, step: 0.01, label: 'b' },
              f0: { min: 0.01, max: 8, step: 0.01, label: 'f₀' },
              w0: { min: 0.01, max: domain === 'dt' ? 3 : 12, step: 0.01, label: 'ω₀' },
              tau: { min: 0.05, max: 4, step: 0.01, label: 'τ' },
              t0: { min: -3, max: 3, step: 0.01, label: 't₀' },
              L: { min: 1, max: 40, step: 1, label: 'L' },
            }
            const c = cfg[k] ?? { min: 0, max: 10, step: 0.01, label: k }
            return (
              <Slider
                key={k}
                label={c.label}
                min={c.min}
                max={c.max}
                step={c.step}
                value={params[k as keyof Params]}
                onChange={(v) => setParams((p) => ({ ...p, [k]: v }))}
              />
            )
          })}
        </Panel>
      )}

      <Panel title={t('fourier.window')}>
        {domain === 'ct' ? (
          <div className="grid-2col">
            <NumberField label={t('fourier.tStart')} value={win[0]} onChange={(v) => setWin([v, win[1]])} />
            <NumberField label={t('fourier.tEnd')} value={win[1]} onChange={(v) => setWin([win[0], v])} />
          </div>
        ) : (
          <div className="grid-2col">
            <NumberField label={t('fourier.nStart')} value={nwin[0]} onChange={(v) => setNwin([v, nwin[1]])} step={1} />
            <NumberField label={t('fourier.nEnd')} value={nwin[1]} onChange={(v) => setNwin([nwin[0], v])} step={1} />
          </div>
        )}
        <Field label={t('fourier.quality')}>
          <SegBtns
            options={QUALITY_KEYS.map((key, i) => ({ value: String(i), label: t(key) }))}
            value={String(quality)}
            onChange={(v) => setQuality(parseInt(v))}
          />
        </Field>
      </Panel>

      <Panel title={t('fourier.spectrum')}>
        {domain === 'ct' && (
          <Field label={t('fourier.freqUnit')}>
            <SegBtns
              options={[
                { value: 'rad', label: 'rad/s (ω)' },
                { value: 'hz', label: 'Hz (f)' },
              ]}
              value={unit}
              onChange={(v) => setUnit(v as 'rad' | 'hz')}
            />
          </Field>
        )}
        {domain === 'ct' && (
          <Slider label={t('fourier.wRange')} min={1} max={80} step={0.5} value={wmax} onChange={setWmax} unit="±rad/s" />
        )}
        <Toggle checked={unwrapPhase} onChange={setUnwrapPhase} label={t('common.unwrap')} />
        {truncation && (
          <div className="warn-box">
            {t('fourier.truncWarn1')}
            <b>{t('fourier.truncWarnBold')}</b>
            {t('fourier.truncWarn2')}
          </div>
        )}
      </Panel>

      <Panel title={t('common.snapshot')}>
        <SnapshotIO view="fourier" build={snapshotBuild} apply={snapshotApply} />
      </Panel>
    </>
  )

  const explanation = (
    <Explanation>
      <ExpSection title={t('common.explFormula')}>
        {domain === 'ct' ? (
          <>
            <Tex block tex={String.raw`X(\omega)=\int_{-\infty}^{\infty} x(t)\,e^{-j\omega t}\,dt \qquad x(t)=\frac{1}{2\pi}\int_{-\infty}^{\infty}X(\omega)\,e^{j\omega t}\,d\omega`} />
            <div className="exp-note">
              {unit === 'hz' ? (
                <>
                  {t('fourier.hzNote1')}
                  <Tex tex={String.raw`X(f)=\int x(t)\,e^{-j2\pi f t}dt`} />
                  {t('fourier.hzNote2')}
                </>
              ) : (
                <>
                  {t('fourier.ctNote')}
                  <Tex tex={String.raw`X(\omega)\approx \Delta t\,\sum_n w_n\,x(t_n)\,e^{-j\omega t_n}`} />
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <Tex block tex={String.raw`X(e^{j\omega})=\sum_{n=-\infty}^{\infty} x[n]\,e^{-j\omega n},\quad \omega\in(-\pi,\pi]`} />
            <div className="exp-note">{t('fourier.dtNote')}</div>
          </>
        )}
      </ExpSection>
      <ExpSection title={t('common.explValues')}>
        {peak && (
          <KV k={t('fourier.peakMag')} v={<span className="mono">{peak.mag.toFixed(3)}</span>} />
        )}
        {peak && domain === 'ct' && (
          <KV
            k={t('fourier.peakFreq')}
            v={
              <span className="mono">
                {unit === 'hz' ? `${(peak.w / CTAU).toFixed(3)} Hz` : `${peak.w.toFixed(2)} rad/s`}
              </span>
            }
          />
        )}
        {peak && domain === 'dt' && <KV k={t('fourier.peakW')} v={<span className="mono">{peak.w.toFixed(3)} rad</span>} />}
        <KV k={t('fourier.nSamples')} v={<span className="mono">{sampled ? sampled.re.length : 0}</span>} />
        {domain === 'ct' && <KV k="Δt" v={<span className="mono">{sampled ? sampled.dt.toFixed(4) : '—'} s</span>} />}
      </ExpSection>
      <ExpSection title={t('common.explPoints')}>
        <ul className="exp-list">
          <li>
            {t('fourier.obs1a')}
            <Tex tex={String.raw`X(-\omega)=X^*(\omega)`} />
            {t('fourier.obs1b')}
          </li>
          <li>{t('fourier.obs2')}</li>
          <li>{t('fourier.obs3')}</li>
          {truncation && <li>{t('fourier.obs4')}</li>}
        </ul>
      </ExpSection>
    </Explanation>
  )

  return <LabLayout aside={aside} main={main} explanation={explanation} />
}
