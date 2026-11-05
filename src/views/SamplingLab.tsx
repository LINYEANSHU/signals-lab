// 模块七：采样定理与混叠实验室
// 连续信号以 fs 采样 → 频谱周期重复（混叠=重叠）→ 理想 sinc 插值重建对比
import { useMemo, useState } from 'react'
import { Plot } from '../components/Plot'
import { Badge, Panel, Select, Slider, SnapshotIO, TextInput, Toggle, Note } from '../components/ui'
import { ExpSection, Explanation, Tex } from '../components/Tex'
import { LabLayout } from '../components/LabLayout'
import { useI18n, pickLabel, pickNote, listSep } from '../i18n'
import { compileSignal, makeSampler, usedParams, DEFAULT_PARAMS, PARAM_KEYS, type Params } from '../lib/parser'
import { sampleCT, ndft, linspace, maxAbs } from '../lib/numeric'
import { sampleGrid, sincInterp, aliasFreq, energyBandwidth } from '../lib/sampling'
import { SAMPLING_SIGNALS, type SignalPreset } from '../lib/presets'
import { bool, deferApply, num, numRecord, str } from '../lib/snapshot'
import { C, axis, baseLayout } from '../lib/plotTheme'

const N_DENSE = 2401 // "连续"参考曲线采样数
const TAU = 2 * Math.PI

type SamplingPreset = SignalPreset & { /** 主频率（用于混叠读数，可选） */ aliasOf?: 'f0' | 'b' }

const PRESETS = SAMPLING_SIGNALS as SamplingPreset[]

export default function SamplingLab() {
  const { lang, t } = useI18n()
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const preset = useMemo(() => PRESETS.find((p) => p.id === presetId) ?? PRESETS[0], [presetId])
  const [expr, setExpr] = useState(preset.expr)
  const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS, ...preset.params })
  const [fs, setFs] = useState(12)
  const [showRecon, setShowRecon] = useState(true)

  // 预设切换：表达式与参数跟随预设（混叠读数按主频率 f0/b 计算）
  const applyPreset = (p: SamplingPreset) => {
    setExpr(p.expr)
    setParams({ ...DEFAULT_PARAMS, ...p.params })
  }
  const pickPreset = (id: string) => {
    setPresetId(id)
    const p = PRESETS.find((q) => q.id === id) ?? PRESETS[0]
    applyPreset(p)
  }

  const compiled = useMemo(() => compileSignal(expr), [expr])
  const symbols = compiled.ok ? usedParams(compiled.symbols) : []
  const win = preset.win ?? [-1, 2]

  // ---- "连续"参考信号（密集采样）----
  const dense = useMemo(() => {
    if (!compiled.ok) return null
    const smp = makeSampler(compiled.compiled, 'ct', params)
    return sampleCT(smp, win[0], win[1], N_DENSE)
  }, [compiled, params, win])

  // ---- 宽频扫描 → 99% 能量带宽 B99 ----
  const wideBand = useMemo(() => {
    if (!dense) return 0
    const w = linspace(-100, 100, 2001)
    const X = ndft(dense.re, dense.im, dense.t0, dense.dt, w)
    return energyBandwidth(X.re, X.im, w, 0.99)
  }, [dense])

  // ---- 采样网格与样本 ----
  const grid = useMemo(() => {
    if (!dense) return null
    const g = sampleGrid(win[0], win[1], fs)
    const re = new Float64Array(g.t.length)
    const im = new Float64Array(g.t.length)
    if (compiled.ok) {
      const smp = makeSampler(compiled.compiled, 'ct', params)
      for (let i = 0; i < g.t.length; i++) {
        const v = smp(g.t[i])
        re[i] = isFinite(v.re) ? v.re : 0
        im[i] = isFinite(v.im) ? v.im : 0
      }
    }
    return { ...g, re, im }
  }, [dense, compiled, params, win, fs])

  // ---- 频谱对比：真实谱 vs 采样信号谱（周期重复） ----
  const wmax = useMemo(() => Math.min(110, Math.max(2.2 * Math.PI * fs, 1.6 * wideBand + 1)), [fs, wideBand])
  const spec = useMemo(() => {
    if (!dense || !grid) return null
    const omegas = linspace(-wmax, wmax, 1201)
    const X = ndft(dense.re, dense.im, dense.t0, dense.dt, omegas)
    const Xs = ndft(grid.re, grid.im, grid.t[0], grid.dt, omegas)
    const magTrue = Float64Array.from(X.re, (_, i) => Math.hypot(X.re[i], X.im[i]))
    const magSamp = Float64Array.from(Xs.re, (_, i) => Math.hypot(Xs.re[i], Xs.im[i]))
    return { omegas, magTrue, magSamp }
  }, [dense, grid, wmax])

  // ---- 理想 sinc 重建 ----
  const recon = useMemo(() => {
    if (!dense || !grid) return null
    const y = sincInterp(grid.re, grid.im, grid.t[0], grid.dt, dense.t)
    // 重建误差取窗内中间 80%（避开有限窗 sinc 插值的边缘截断效应）
    const n = dense.re.length
    const lo = Math.floor(n * 0.1)
    const hi = Math.ceil(n * 0.9)
    let maxErr = 0
    for (let i = lo; i < hi; i++) {
      const e = Math.abs(y.re[i] - dense.re[i]) + Math.abs(y.im[i] - dense.im[i])
      if (e > maxErr) maxErr = e
    }
    return { y, maxErr }
  }, [dense, grid])

  // ---- 读数 ----
  const fsEff = grid ? grid.fsEff : fs
  const aliasText = useMemo(() => {
    const items: string[] = []
    const f0 = params.f0
    const b = params.b
    if (preset.aliasOf !== undefined || (expr.includes('f0') && isFinite(f0))) {
      items.push(`f₀=${f0.toFixed(2)}→${aliasFreq(f0, fsEff).toFixed(2)}Hz`)
    }
    if (expr.includes('b') && isFinite(b)) {
      items.push(`b=${b.toFixed(2)}→${aliasFreq(b, fsEff).toFixed(2)}Hz`)
    }
    return items.length ? items.join(listSep(lang)) : '—'
  }, [params.f0, params.b, expr, preset, fsEff, lang])

  const noAlias = spec ? fsEff / 2 >= wideBand : false
  const peakY = recon ? maxAbs(recon.y.re) : 0

  // ---- 轨迹（layout 与 data 均 useMemo 固定引用）----
  const dataTime = useMemo(() => {
    if (!dense || !grid) return []
    return [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(dense.t),
        y: Array.from(dense.re),
        line: { color: C.signal, width: 1.8 },
        name: t('sampling.trRef'),
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'markers',
        x: Array.from(grid.t),
        y: Array.from(grid.re),
        marker: { symbol: 'line-ns-open', size: 13, thickness: 2, color: C.system },
        name: t('sampling.trSamples', { fs: fsEff.toFixed(1) }),
      },
    ]
  }, [dense, grid, fsEff, t])

  const dataSpec = useMemo(() => {
    if (!spec) return []
    const nyq = Math.PI * fsEff
    const maxY = Math.max(maxAbs(spec.magTrue), maxAbs(spec.magSamp)) || 1
    return [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(spec.omegas),
        y: Array.from(spec.magTrue),
        line: { color: C.spectrum, width: 1.8 },
        name: t('sampling.trTrue'),
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(spec.omegas),
        y: Array.from(spec.magSamp),
        line: { color: C.compare, width: 1.2, dash: 'dot' },
        name: t('sampling.trSampled'),
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: [nyq, nyq],
        y: [0, maxY * 1.05],
        line: { color: '#1d1a13', width: 1, dash: 'dash' },
        name: t('sampling.trNyq', { v: nyq.toFixed(1) }),
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: [-nyq, -nyq],
        y: [0, maxY * 1.05],
        line: { color: '#1d1a13', width: 1, dash: 'dash' },
        showlegend: false,
        hoverinfo: 'skip',
      },
    ]
  }, [spec, fsEff, t])

  const dataRecon = useMemo(() => {
    if (!dense || !recon) return []
    return [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(dense.t),
        y: Array.from(dense.re),
        line: { color: 'rgba(92,86,68,0.55)', width: 1, dash: 'dash' },
        name: t('sampling.trRefShort'),
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(dense.t),
        y: Array.from(recon.y.re),
        line: { color: C.output, width: 2 },
        name: t('sampling.trRecon'),
      },
    ]
  }, [dense, recon, t])

  const layoutTime = useMemo(
    () => baseLayout(t('sampling.ltTime'), { xaxis: axis('t (s)'), yaxis: axis(t('common.magnitude')) }),
    [t],
  )
  const layoutSpec = useMemo(
    () => baseLayout(t('sampling.ltSpec'), {
      xaxis: axis('ω (rad/s)'),
      yaxis: axis('|·|'),
    }),
    [t],
  )
  const layoutRecon = useMemo(
    () => baseLayout(t('sampling.ltRecon'), { xaxis: axis('t (s)'), yaxis: axis(t('common.magnitude')) }),
    [t],
  )

  // ---- 配置导入导出 ----
  const snapshotBuild = () => ({
    presetId,
    expr,
    params: { ...params },
    fs,
    showRecon,
  })
  const snapshotApply = (d: Record<string, unknown>) => {
    const pid = str(d, 'presetId', PRESETS[0].id)
    setPresetId(PRESETS.some((p) => p.id === pid) ? pid : PRESETS[0].id)
    deferApply(() => {
      const e = str(d, 'expr', '')
      if (e) setExpr(e)
      setParams(numRecord(d, 'params', PARAM_KEYS, { ...DEFAULT_PARAMS, ...preset.params }) as Params)
      setFs(num(d, 'fs', fs, 0.5, 40))
      setShowRecon(bool(d, 'showRecon', showRecon))
    })
  }

  const main = (
    <div className="charts">
      <div className="readout-bar">
        <div className="ro-item">
          <span className="ro-k">{t('sampling.roFs')}</span>
          <span className="ro-v mono">{fsEff.toFixed(2)} Hz</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">{t('sampling.roNyquist')}</span>
          <span className="ro-v mono">{(fsEff / 2).toFixed(2)} Hz</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">{t('sampling.roB99')}</span>
          <span className="ro-v mono">{(wideBand / TAU).toFixed(2)} Hz</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">{t('sampling.roAlias')}</span>
          <span className="ro-v mono">{aliasText}</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">{t('sampling.roMaxErr')}</span>
          <span className="ro-v mono">{recon ? recon.maxErr.toExponential(1) : '—'}</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">{t('sampling.roNSamples')}</span>
          <span className="ro-v mono">{grid ? grid.t.length : 0}</span>
        </div>
      </div>
      <div className="grid-2">
        <div className="chart-card" data-plate={t('sampling.plate')}>
          <Plot data={dataTime} layout={layoutTime} height={235} />
        </div>
        <div className="chart-card">
          <Plot data={dataSpec} layout={layoutSpec} height={235} />
        </div>
        {showRecon && (
          <div className="chart-card span-2">
            <Plot data={dataRecon} layout={layoutRecon} height={230} />
          </div>
        )}
        <div className={showRecon ? 'chart-card span-2 stat-card' : 'chart-card span-2 stat-card'}>
          <div className="stat-row">
            <span>
              {noAlias ? (
                <Badge tone="ok">{t('sampling.badgeOk')}</Badge>
              ) : (
                <Badge tone="err">{t('sampling.badgeBad')}</Badge>
              )}
            </span>
            {peakY > 0 && <span className="mono">{t('sampling.reconPeak', { v: peakY.toFixed(3) })}</span>}
          </div>
          <div className="exp-note" style={{ marginTop: 6 }}>
            {t('sampling.statNote')}
          </div>
        </div>
      </div>
    </div>
  )

  const aside = (
    <>
      <Panel title={t('common.preset')}>
        <Select
          value={presetId}
          onChange={pickPreset}
          options={PRESETS.map((p) => ({ value: p.id, label: pickLabel(lang, p) }))}
        />
        <Note>{pickNote(lang, preset)}</Note>
      </Panel>
      <Panel title={t('common.exprCt')}>
        <TextInput value={expr} onChange={setExpr} placeholder="sin(2*pi*f0*t)" />
        {!compiled.ok && <div className="expr-error">✗ {compiled.error}</div>}
      </Panel>
      {symbols.length > 0 && (
        <Panel title={t('common.params')}>
          {symbols.map((k) => (
            <Slider
              key={k}
              label={k}
              min={0.01}
              max={k === 'f0' || k === 'b' ? 12 : 6}
              step={0.01}
              value={params[k as keyof Params]}
              onChange={(v) => setParams((p) => ({ ...p, [k]: v }))}
            />
          ))}
        </Panel>
      )}
      <Panel title={t('sampling.ctlPanel')}>
        <Slider label={t('sampling.fsSlider')} min={0.5} max={40} step={0.1} value={fs} onChange={setFs} unit="Hz" />
        <Toggle checked={showRecon} onChange={setShowRecon} label={t('sampling.showRecon')} />
        <Note>{t('sampling.ctlNote')}</Note>
      </Panel>
      <Panel title={t('common.snapshot')}>
        <SnapshotIO view="sampling" build={snapshotBuild} apply={snapshotApply} />
      </Panel>
    </>
  )

  const explanation = (
    <Explanation>
      <ExpSection title={t('sampling.explPeriodize')}>
        <Tex block tex={String.raw`x_s(t)=x(t)\cdot \text{III}_{T_s}(t)\ \overset{\mathcal{F}}{\longleftrightarrow}\ X_s(\omega)=\frac{1}{T_s}\sum_{k=-\infty}^{\infty}X(\omega-k\omega_s),\quad \omega_s=2\pi f_s`} />
        <div className="exp-note">
          {t('sampling.note1a')}
          <b>{t('sampling.note1b')}</b>
          {t('sampling.note1c')}
        </div>
      </ExpSection>
      <ExpSection title={t('sampling.explRecon')}>
        <Tex block tex={String.raw`y(t)=\sum_{n} x[n]\,\mathrm{sinc}\!\left(\frac{t-nT_s}{T_s}\right)\ \xrightarrow{\ f_s>2B\ }\ x(t)`} />
        <div className="exp-note">{t('sampling.note2')}</div>
      </ExpSection>
      <ExpSection title={t('common.explPoints')}>
        <ul className="exp-list">
          <li>{t('sampling.obs1')}</li>
          <li>{t('sampling.obs2')}</li>
          <li>{t('sampling.obs3')}</li>
          <li>{t('sampling.obs4')}</li>
        </ul>
      </ExpSection>
    </Explanation>
  )

  return <LabLayout aside={aside} main={main} explanation={explanation} />
}
