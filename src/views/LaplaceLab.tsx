// 模块：拉普拉斯变换 3D —— |X(s)| 曲面、极点"山峰"、零点"谷底"
// 核心思想：傅里叶变换 = 沿虚轴 jω 把曲面"切一刀"（σ=0 截面）
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Plot } from '../components/Plot'
import { Badge, Panel, SegBtns, Select, Slider, SnapshotIO, TextInput, Toggle, Note } from '../components/ui'
import { ExpSection, Explanation, Tex } from '../components/Tex'
import { LabLayout } from '../components/LabLayout'
import { useI18n, pickLabel, pickNote, listSep } from '../i18n'
import { compileSignal, makeSampler, usedParams, DEFAULT_PARAMS, PARAM_KEYS, type Params } from '../lib/parser'
import { bool, deferApply, num, numRecord, str } from '../lib/snapshot'
import { sampleCT, ndft, linspace, cx, type Cx } from '../lib/numeric'
import { LAPLACE_SIGNALS, type LaplacePreset } from '../lib/presets'
import { C, baseLayout } from '../lib/plotTheme'

const NS = 57 // σ 方向网格
const NW = 57 // ω 方向网格
const NSAMP = 1536 // 时域采样
const CLAMP = 1e4
const lg = (m: number) => Math.log10(1 + Math.min(m, CLAMP))

export default function LaplaceLab() {
  const { lang, t } = useI18n()
  const [presetId, setPresetId] = useState(LAPLACE_SIGNALS[0].id)
  const preset: LaplacePreset = useMemo(
    () => LAPLACE_SIGNALS.find((p) => p.id === presetId) ?? LAPLACE_SIGNALS[0],
    [presetId],
  )
  const [expr, setExpr] = useState(preset.expr)
  const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS, ...preset.params })
  const [sigma0, setSigma0] = useState(0)
  const [showPlane, setShowPlane] = useState(true)
  const [showPZ, setShowPZ] = useState(true)
  const [mode, setMode] = useState<'auto' | 'numeric'>('auto')

  useEffect(() => {
    setExpr(preset.expr)
    setParams({ ...DEFAULT_PARAMS, ...preset.params })
    setSigma0(0)
    setMode(preset.xs ? 'auto' : 'numeric')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId])

  const compiled = useMemo(() => compileSignal(expr), [expr])
  const symbols = compiled.ok ? usedParams(compiled.symbols) : []

  const sampled = useMemo(() => {
    if (!compiled.ok) return null
    const smp = makeSampler(compiled.compiled, 'ct', params)
    return sampleCT(smp, preset.win[0], preset.win[1], NSAMP)
  }, [compiled, params, preset])

  // 观察范围：自动包含极点/零点
  const range = useMemo(() => {
    let sr = 2.5
    let wr = 8
    for (const p of preset.poles?.(params) ?? []) {
      sr = Math.max(sr, Math.abs(p.re) + 0.9)
      wr = Math.max(wr, Math.abs(p.im) + 3)
    }
    for (const z of preset.zeros?.(params) ?? []) {
      wr = Math.max(wr, Math.abs(z.im) + 3)
    }
    return { sigR: Math.min(sr, 5), wR: Math.min(wr, 26) }
  }, [preset, params])

  const useAnalytic = mode === 'auto' && !!preset.xs
  const xsFn = useMemo(() => (useAnalytic ? preset.xs!(params) : null), [useAnalytic, preset, params])
  const poles = useMemo(() => preset.poles?.(params) ?? [], [preset, params])
  const zeros = useMemo(() => preset.zeros?.(params) ?? [], [preset, params])

  const dState = useDeferredValue({ sampled, sigma0, range, xsFn, poles, zeros })
  const grid = useMemo(() => {
    const { sampled, range, xsFn, poles, zeros } = dState
    const { sigR, wR } = range
    const sigmas = linspace(-sigR, sigR, NS)
    const omegas = linspace(-wR, wR, NW)
    const Z: number[][] = []
    if (sampled) {
      // 数值模式：复用同一对加权缓冲区（ndft 不持有输入引用），避免每个 σ 行重复分配
      const n = sampled.re.length
      const wre = xsFn ? new Float64Array(0) : new Float64Array(n)
      const wim = xsFn ? new Float64Array(0) : new Float64Array(n)
      for (let j = 0; j < NS; j++) {
        const sg = sigmas[j]
        const row: number[] = []
        if (xsFn) {
          for (let i = 0; i < NW; i++) {
            const v = xsFn(cx(sg, omegas[i]))
            row.push(lg(Math.hypot(v.re, v.im)))
          }
        } else {
          // 对每个 σ 行计算 ∫ x(t) e^{-σt} e^{-jωt} dt
          for (let i = 0; i < n; i++) {
            const w = Math.exp(-sg * sampled.t[i])
            wre[i] = sampled.re[i] * w
            wim[i] = sampled.im[i] * w
          }
          const X = ndft(wre, wim, sampled.t0, sampled.dt, omegas)
          for (let i = 0; i < NW; i++) row.push(lg(Math.hypot(X.re[i], X.im[i])))
        }
        Z.push(row)
      }
    }
    // σ=0 行索引（NS 为奇数，正中）
    const j0 = (NS - 1) / 2
    // σ₀ 截面行
    const jS = Math.max(0, Math.min(NS - 1, Math.round(((dState.sigma0 + sigR) / (2 * sigR)) * (NS - 1))))
    return { sigmas, omegas, Z, j0, jS, sigR, wR }
  }, [dState])

  // 数值傅里叶变换（独立验证曲线）
  const ftNumeric = useMemo(() => {
    if (!sampled) return null
    return ndft(sampled.re, sampled.im, sampled.t0, sampled.dt, grid.omegas)
  }, [sampled, grid.omegas])

  // 三个 2D 图的 layout（依赖 t，语言切换时重建）
  const FT_LAYOUT = useMemo(
    () =>
      baseLayout(t('laplace.ftTitle'), {
        xaxis: { title: { text: 'ω (rad/s)', font: { size: 11 } }, gridcolor: C.grid },
        yaxis: { title: { text: 'log₁₀(1+|X|)', font: { size: 11 } }, gridcolor: C.grid },
      }),
    [t],
  )
  const CUT_LAYOUT = useMemo(
    () =>
      baseLayout(t('laplace.cutTitle'), {
        xaxis: { title: { text: 'ω (rad/s)', font: { size: 11 } }, gridcolor: C.grid },
        yaxis: { title: { text: 'log₁₀(1+|X|)', font: { size: 11 } }, gridcolor: C.grid },
      }),
    [t],
  )
  const TIME_LAYOUT = useMemo(
    () =>
      baseLayout(t('laplace.timeTitle'), {
        xaxis: { title: { text: 't (s)', font: { size: 11 } }, gridcolor: C.grid },
        yaxis: { title: { text: 'x', font: { size: 11 } }, gridcolor: C.grid },
      }),
    [t],
  )

  // ---- 3D 曲面 ----
  const surfaceData = useMemo(() => {
    if (!grid.Z.length) return []
    const data: unknown[] = [
      {
        type: 'surface',
        x: Array.from(grid.sigmas),
        y: Array.from(grid.omegas),
        z: grid.Z,
        colorscale: 'Viridis',
        showscale: false,
        opacity: 0.96,
        hovertemplate: 'σ=%{x:.2f}, ω=%{y:.2f}<br>log₁₀(1+|X|)=%{z:.2f}<extra></extra>',
        name: t('laplace.surfName'),
      },
    ]
    // jω 轴切面（σ=0）—— 傅里叶变换
    const slice = grid.Z[grid.j0]
    data.push({
      type: 'scatter3d',
      mode: 'lines',
      x: grid.omegas.map(() => 0),
      y: Array.from(grid.omegas),
      z: slice,
      line: { color: C.signal, width: 9 },
      name: t('laplace.trJw'),
      hovertemplate: 'σ=0, ω=%{y:.2f}<br>log₁₀(1+|X|)=%{z:.2f}<extra></extra>',
    })
    // σ₀ 可移动切面
    const rowS = grid.Z[grid.jS]
    data.push({
      type: 'scatter3d',
      mode: 'lines',
      x: grid.omegas.map(() => grid.sigmas[grid.jS]),
      y: Array.from(grid.omegas),
      z: rowS,
      line: { color: C.compare, width: 7 },
      name: `σ=${grid.sigmas[grid.jS].toFixed(2)}`,
      hovertemplate: 'σ=%{x:.2f}, ω=%{y:.2f}<extra></extra>',
    })
    if (showPlane) {
      data.push({
        type: 'surface',
        x: [grid.sigmas[grid.jS] - 0.001, grid.sigmas[grid.jS] + 0.001],
        y: Array.from(grid.omegas),
        z: [rowS.slice(), rowS.slice()],
        opacity: 0.16,
        showscale: false,
        colorscale: [
          [0, '#94a3b8'],
          [1, '#94a3b8'],
        ],
        hoverinfo: 'skip',
        name: t('laplace.trPlane'),
      })
    }
    // 极点（山峰标记）与零点（谷底标记）
    if (showPZ && poles.length > 0) {
      data.push({
        type: 'scatter3d',
        mode: 'markers+text',
        x: poles.map((p) => p.re),
        y: poles.map((p) => p.im),
        z: poles.map(() => lg(CLAMP) + 0.25),
        marker: { color: C.pole, size: 5, symbol: 'x' },
        text: poles.map(() => t('laplace.textPole')),
        textfont: { size: 9, color: C.pole },
        name: t('laplace.trPole3d'),
      })
    }
    if (showPZ && zeros.length > 0) {
      const zf = (z: Cx) => {
        if (xsFn) {
          const v = xsFn(z)
          return lg(Math.hypot(v.re, v.im))
        }
        return 0
      }
      data.push({
        type: 'scatter3d',
        mode: 'markers+text',
        x: zeros.map((p) => p.re),
        y: zeros.map((p) => p.im),
        z: zeros.map((p) => zf(p) - 0.08),
        marker: { color: C.zero, size: 4, symbol: 'circle-open' },
        text: zeros.map(() => t('laplace.textZero')),
        textfont: { size: 9, color: C.zero },
        name: t('laplace.trZero3d'),
      })
    }
    return data
  }, [grid, showPlane, showPZ, poles, zeros, xsFn, t])

  const surfaceLayout = useMemo(
    () => ({
      paper_bgcolor: 'rgba(0,0,0,0)',
      font: { color: C.text, size: 10.5, family: '"Segoe UI","Microsoft YaHei",sans-serif' },
      margin: { l: 8, r: 8, t: 34, b: 4 },
      title: {
        text: t('laplace.surfTitle'),
        font: { size: 12.5, color: '#1d1a13' },
        x: 0.012,
        xanchor: 'left',
      },
      scene: {
        xaxis: { title: 'σ = Re{s}', gridcolor: C.grid, color: '#6b6250' },
        yaxis: { title: 'ω = Im{s}', gridcolor: C.grid, color: '#6b6250' },
        zaxis: { title: 'log₁₀(1+|X|)', gridcolor: C.grid, color: '#6b6250' },
        camera: { eye: { x: 1.75, y: -1.55, z: 1.0 } },
        bgcolor: 'rgba(0,0,0,0)',
      },
      showlegend: true,
      legend: { orientation: 'h', x: 0.99, xanchor: 'right', y: 0.99, yanchor: 'top', font: { size: 9.5 }, bgcolor: 'rgba(246,241,227,0.75)' },
    }),
    [t],
  )

  // ---- 2D 图 A：jω 截面 = 傅里叶变换（验证） ----
  const ftCheckTraces = useMemo(() => {
    if (!ftNumeric) return []
    const slice = grid.Z[grid.j0].slice()
    const ftLg = Array.from(ftNumeric.re, (_, i) => lg(Math.hypot(ftNumeric.re[i], ftNumeric.im[i])))
    return [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(grid.omegas),
        y: slice,
        line: { color: C.signal, width: 2.2 },
        name: t('laplace.trSurfSlice'),
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(grid.omegas),
        y: ftLg,
        line: { color: C.spectrum, width: 1.4, dash: 'dash' },
        name: t('laplace.trNumericFT'),
      },
    ]
  }, [grid, ftNumeric, t])

  // ---- 2D 图 B：移动切面 ----
  const cutTraces = useMemo(() => {
    const rowS = grid.Z[grid.jS]
    const traces: unknown[] = [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(grid.omegas),
        y: grid.Z[grid.j0],
        line: { color: C.signal, width: 1.8 },
        name: t('laplace.trFourier'),
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(grid.omegas),
        y: rowS,
        line: { color: C.compare, width: 2 },
        name: `σ=${grid.sigmas[grid.jS].toFixed(2)}`,
      },
    ]
    // 极点位置参考线
    for (const p of poles) {
      if (Math.abs(p.im) > 0.01 && Math.abs(p.im) < grid.wR) {
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: [p.im, p.im],
          y: [0, lg(CLAMP) * 1.05],
          line: { color: 'rgba(248,113,113,0.5)', width: 1, dash: 'dot' },
          showlegend: false,
          hoverinfo: 'skip',
        })
      }
    }
    return traces
  }, [grid, poles, t])

  const timeTraces = useMemo(() => {
    if (!sampled) return []
    return [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(sampled.t),
        y: Array.from(sampled.re),
        line: { color: C.signal, width: 1.8 },
        name: 'x(t)',
      },
    ]
  }, [sampled])

  const rocRe = poles.length > 0 ? Math.max(...poles.map((p) => p.re)) : -Infinity

  // ---- 配置导入导出（JSON）----
  const snapshotBuild = () => ({
    presetId,
    expr,
    params: { ...params },
    sigma0,
    showPlane,
    showPZ,
    mode,
  })
  const snapshotApply = (d: Record<string, unknown>) => {
    const pid = str(d, 'presetId', LAPLACE_SIGNALS[0].id)
    setPresetId(LAPLACE_SIGNALS.some((p) => p.id === pid) ? pid : LAPLACE_SIGNALS[0].id)
    // 等 [presetId] 的预设副作用先跑完，再覆盖为导入值
    deferApply(() => {
      const e = str(d, 'expr', '')
      if (e) setExpr(e)
      setParams(numRecord(d, 'params', PARAM_KEYS, DEFAULT_PARAMS) as Params)
      setSigma0(num(d, 'sigma0', sigma0, -range.sigR, range.sigR))
      setShowPlane(bool(d, 'showPlane', showPlane))
      setShowPZ(bool(d, 'showPZ', showPZ))
      setMode(str(d, 'mode', mode, ['auto', 'numeric']) as 'auto' | 'numeric')
    })
  }

  const main = (
    <div className="charts">
      <div className="chart-card span-2" data-plate={t('plates.laplace')}>
        <Plot data={surfaceData} layout={surfaceLayout} height={470} />
      </div>
      <div className="chart-card">
        <Plot data={ftCheckTraces} layout={FT_LAYOUT} height={240} />
      </div>
      <div className="chart-card">
        <Plot data={cutTraces} layout={CUT_LAYOUT} height={240} />
      </div>
      <div className="chart-card span-2">
        <Plot data={timeTraces} layout={TIME_LAYOUT} height={165} />
      </div>
    </div>
  )

  const aside = (
    <>
      <Panel title={t('laplace.sigSelect')}>
        <Select
          value={presetId}
          onChange={setPresetId}
          options={LAPLACE_SIGNALS.map((p) => ({ value: p.id, label: pickLabel(lang, p) }))}
        />
        <Note>{pickNote(lang, preset)}</Note>
      </Panel>
      <Panel title={t('common.exprCt')}>
        <TextInput value={expr} onChange={setExpr} />
        {!compiled.ok && <div className="expr-error">✗ {compiled.error}</div>}
        {useAnalytic ? (
          <Badge tone="ok">{t('laplace.analyticBadge')}</Badge>
        ) : (
          <Badge tone="info">{t('laplace.numericBadge')}</Badge>
        )}
      </Panel>
      {symbols.length > 0 && (
        <Panel title={t('common.params')}>
          {symbols.map((k) => {
            const cfg: Record<string, { min: number; max: number; step: number; label: string }> = {
              a: { min: 0.1, max: 4, step: 0.01, label: 'a' },
              b: { min: 0.1, max: 4, step: 0.01, label: 'b' },
              w0: { min: 0.5, max: 14, step: 0.05, label: 'ω₀' },
              tau: { min: 0.3, max: 3, step: 0.01, label: 'τ' },
              f0: { min: 0.2, max: 4, step: 0.01, label: 'f₀' },
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
      <Panel title={t('laplace.cutPanel')}>
        <Slider label="σ₀" min={-range.sigR} max={range.sigR} step={0.05} value={sigma0} onChange={setSigma0} />
        <div className="btn-row">
          <Badge tone="warn">{t('laplace.badgeFT')}</Badge>
        </div>
        <Toggle checked={showPlane} onChange={setShowPlane} label={t('laplace.showPlane')} />
        <Toggle checked={showPZ} onChange={setShowPZ} label={t('laplace.showPZ')} />
        {preset.xs && (
          <SegBtns
            options={[
              { value: 'auto', label: t('laplace.modeAuto') },
              { value: 'numeric', label: t('laplace.modeNumeric') },
            ]}
            value={mode}
            onChange={(v) => setMode(v as 'auto' | 'numeric')}
          />
        )}
      </Panel>
      <Panel title={t('laplace.hints')}>
        <div className="legend-list">
          <span>{t('laplace.hint1')}</span>
          <span><i style={{ background: C.pole }} /> {t('laplace.hint2')}</span>
          <span><i style={{ background: C.zero }} /> {t('laplace.hint3')}</span>
          <span><i style={{ background: C.signal }} /> {t('laplace.hint4')}</span>
          <span><i style={{ background: C.compare }} /> {t('laplace.hint5')}</span>
        </div>
      </Panel>
      <Panel title={t('common.snapshot')}>
        <SnapshotIO view="laplace" build={snapshotBuild} apply={snapshotApply} />
      </Panel>
    </>
  )

  const explanation = (
    <Explanation>
      <ExpSection title={t('common.explFormula')}>
        <Tex block tex={String.raw`X(s)=\int_{-\infty}^{\infty}x(t)\,e^{-st}\,dt,\qquad s=\sigma+j\omega`} />
        <div className="exp-note">
          {t('laplace.coreNote1')}
          <Tex tex={String.raw`X(j\omega)=\int x(t)e^{-j\omega t}dt`} />
          {t('laplace.coreNote2')}
          <b>{t('laplace.coreNoteBold')}</b>
          {t('laplace.coreNote3')}
        </div>
      </ExpSection>
      <ExpSection title={t('common.explValues')}>
        <div className="exp-note mono">
          {t('laplace.polesLine')}
          {poles.length ? poles.map((p) => `${p.re.toFixed(2)}${p.im >= 0 ? '+' : '−'}j${Math.abs(p.im).toFixed(2)}`).join(listSep(lang)) : t('laplace.polesNone')}
        </div>
        <div className="exp-note">
          {t('laplace.rocCausalLabel')}
          {poles.length ? rocRe.toFixed(2) : '−∞'}
          {poles.length > 0 && (rocRe < 0 ? t('laplace.rocOk') : t('laplace.rocBad'))}
        </div>
      </ExpSection>
      <ExpSection title={t('laplace.explWhySigma')}>
        <ul className="exp-list">
          <li>
            <Tex tex={String.raw`e^{-st}=e^{-\sigma t}e^{-j\omega t}`} />
            {t('laplace.why1a')}
            <b>{t('laplace.why1b')}</b>
            {t('laplace.why1c')}
          </li>
          <li>{t('laplace.why2')}</li>
          <li>{t('laplace.why3')}</li>
          <li>{t('laplace.why4')}</li>
        </ul>
      </ExpSection>
    </Explanation>
  )

  return <LabLayout aside={aside} main={main} explanation={explanation} />
}

