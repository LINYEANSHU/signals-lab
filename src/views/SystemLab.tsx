// 模块五：系统与零极点实验室
// H(s)/H(z)、零极点图、ROC 与稳定性、频率响应、|H| 三维曲面、时域仿真、点击放置极点
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Plot } from '../components/Plot'
import { Badge, Btn, Field, Panel, SegBtns, Select, Slider, SnapshotIO, TextInput, Toggle, Note } from '../components/ui'
import { ExpSection, Explanation, Tex } from '../components/Tex'
import { LabLayout } from '../components/LabLayout'
import { useI18n, pickLabel, pickNote, listSep } from '../i18n'
import { compileSignal, makeSampler, type Domain } from '../lib/parser'
import { bool, deferApply, num, numTuple3, str } from '../lib/snapshot'
import { linspace, unwrap, cx, cAdd, cMul, cDiv, type Cx } from '../lib/numeric'
import {
  ctPoles,
  ctZeros,
  dtPoles,
  dtZeros,
  ctFreqResp,
  dtFreqResp,
  ctStateSpace,
  simulateCTForced,
  simulateCTImpulse,
  simulateDT,
  rocCT,
  rocDT,
  rocCTStable,
  rocDTStable,
  ctPairParams,
  fmtCx,
  type CTSystem,
  type DTSystem,
} from '../lib/systems'
import { CT_SYSTEMS, DT_SYSTEMS } from '../lib/presets'
import { C, axis, baseLayout, arcPoints } from '../lib/plotTheme'

const TAU = 2 * Math.PI

type SysCT = { b: [number, number, number]; a: [number, number, number] }
type SysDT = { b: [number, number, number]; a: [number, number] }

export default function SystemLab() {
  const { lang, t } = useI18n()
  const [domain, setDomain] = useState<Domain>('ct')
  const presets = domain === 'ct' ? CT_SYSTEMS : DT_SYSTEMS
  const [presetId, setPresetId] = useState(CT_SYSTEMS[0].id)
  const preset = useMemo(() => presets.find((p) => p.id === presetId) ?? presets[0], [presets, presetId])

  const [sysCT, setSysCT] = useState<SysCT>({ b: [...CT_SYSTEMS[0].b] as SysCT['b'], a: [...CT_SYSTEMS[0].a] as SysCT['a'] })
  const [sysDT, setSysDT] = useState<SysDT>({ b: [...DT_SYSTEMS[0].b] as SysDT['b'], a: [...DT_SYSTEMS[0].a] as SysDT['a'] })

  const [rocMode, setRocMode] = useState<'causal' | 'anti' | 'strip'>('causal')
  const [stripIdx, setStripIdx] = useState(0)
  const [show3d, setShow3d] = useState(false)
  const [dB, setDb] = useState(false)
  const [unwrapPhase, setUnwrapPhase] = useState(true)
  const [placePoles, setPlacePoles] = useState(false)

  const [inputKind, setInputKind] = useState<'impulse' | 'step' | 'sin' | 'custom'>('step')
  const [fIn, setFIn] = useState(0.5)
  const [wIn, setWIn] = useState(0.5)
  const [inExpr, setInExpr] = useState('sin(2*pi*f0*t)*u(t)')
  const [simT, setSimT] = useState(8)
  const [simN, setSimN] = useState(96)

  useEffect(() => {
    if (domain === 'ct') {
      const p = CT_SYSTEMS.find((q) => q.id === presetId) ?? CT_SYSTEMS[0]
      const a2 = p.a[0]
      const b = [...p.b] as SysCT['b']
      const a = [...p.a] as SysCT['a']
      if (Math.abs(a2) > 1e-12 && a2 !== 1) {
        // 归一化为首一多项式
        for (let i = 0; i < 3; i++) b[i] = b[i] / a2
        for (let i = 0; i < 3; i++) a[i] = a[i] / a2
      }
      setSysCT({ b, a })
      setInputKind(p.input)
      if (p.f) setFIn(p.f)
    } else {
      const p = DT_SYSTEMS.find((q) => q.id === presetId) ?? DT_SYSTEMS[0]
      setSysDT({ b: [...p.b] as SysDT['b'], a: [...p.a] as SysDT['a'] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, domain])

  const sysValid =
    domain === 'ct'
      ? !(Math.abs(sysCT.a[0]) < 1e-12 && Math.abs(sysCT.a[1]) < 1e-12 && Math.abs(sysCT.a[2]) < 1e-12) &&
        !(Math.abs(sysCT.a[0]) < 1e-12 && Math.abs(sysCT.b[0]) > 1e-12)
      : true

  const dSys = useDeferredValue({ sysCT, sysDT, domain, rocMode, stripIdx, inputKind, fIn, wIn, inExpr, simT, simN, dB })

  // ---- 零极点 ----
  const pz = useMemo(() => {
    if (domain === 'ct') {
      const s: CTSystem = { b: sysCT.b, a: sysCT.a }
      return { poles: ctPoles(s), zeros: ctZeros(s) }
    }
    const s: DTSystem = { b: sysDT.b, a: sysDT.a }
    return { poles: dtPoles(s), zeros: dtZeros(s) }
  }, [domain, sysCT, sysDT])

  // ---- ROC ----
  const roc = useMemo(() => {
    if (domain === 'ct') {
      const band = rocCT(pz.poles, rocMode === 'strip' ? stripIdx : rocMode)
      return { band, stable: rocCTStable(band), nStrips: 1 + new Set(pz.poles.map((p) => p.re)).size }
    }
    const band = rocDT(pz.poles, rocMode === 'strip' ? stripIdx : rocMode)
    return { band, stable: rocDTStable(band), nStrips: 1 + new Set(pz.poles.map((p) => Math.hypot(p.re, p.im).toFixed(6))).size }
  }, [domain, pz, rocMode, stripIdx])

  // ---- 视图范围 ----
  const viewRange = useMemo(() => {
    if (domain === 'dt') return { x: [-1.8, 1.8], y: [-1.8, 1.8] }
    let xmin = -4
    let xmax = 4
    let ymax = 6
    for (const p of [...pz.poles, ...pz.zeros]) {
      xmin = Math.min(xmin, p.re - 0.8)
      xmax = Math.max(xmax, p.re + 0.8)
      ymax = Math.max(ymax, Math.abs(p.im) + 1)
    }
    return { x: [xmin, xmax], y: [-ymax, ymax] }
  }, [domain, pz])

  // ---- 零极点图轨迹（含 ROC 填充）----
  const pzTraces = useMemo(() => {
    const traces: unknown[] = []
    const band = roc.band
    if (domain === 'ct') {
      // 填充矩形向两侧大幅延伸，避免宽屏下 scaleanchor 拉宽坐标轴后阴影截断
      const XLO = viewRange.x[0] - 60
      const XHI = viewRange.x[1] + 60
      const YLO = viewRange.y[0] - 60
      const YHI = viewRange.y[1] + 60
      const lo = band.lo === null ? XLO : band.lo
      const hi = band.hi === null ? XHI : band.hi
      if (hi > lo) {
        traces.push({
          type: 'scatter',
          x: [lo, hi, hi, lo, lo],
          y: [YLO, YLO, YHI, YHI, YLO],
          fill: 'toself',
          fillcolor: C.roc,
          line: { width: 0 },
          name: t('sys.trRoc'),
          hoverinfo: 'skip',
        })
      }
      if (band.lo !== null && band.lo >= viewRange.x[0] && band.lo <= viewRange.x[1]) {
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: [band.lo, band.lo],
          y: viewRange.y,
          line: { color: C.rocLine, width: 1.4, dash: 'dash' },
          name: t('sys.trRocBoundaryS', { v: band.lo.toFixed(2) }),
        })
      }
      if (band.hi !== null && band.hi >= viewRange.x[0] && band.hi <= viewRange.x[1]) {
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: [band.hi, band.hi],
          y: viewRange.y,
          line: { color: C.rocLine, width: 1.4, dash: 'dash' },
          name: t('sys.trRocBoundaryS', { v: band.hi.toFixed(2) }),
        })
      }
    } else {
      const R = 1.8
      const outer = band.hi === null ? R : band.hi
      const inner = band.lo === null ? 0 : band.lo
      if (outer > inner) {
        const o = arcPoints(0, 0, outer, 0, TAU, 72)
        const i = arcPoints(0, 0, inner, TAU, 0, 72)
        traces.push({
          type: 'scatter',
          x: [...o.x, ...i.x, o.x[0]],
          y: [...o.y, ...i.y, o.y[0]],
          fill: 'toself',
          fillcolor: C.roc,
          line: { width: 0 },
          name: t('sys.trRoc'),
          hoverinfo: 'skip',
        })
      }
      if (inner > 0.01 && inner < R) {
        const c = arcPoints(0, 0, inner, 0, TAU, 72)
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: c.x,
          y: c.y,
          line: { color: C.rocLine, width: 1.4, dash: 'dash' },
          name: t('sys.trRocBoundaryZ', { v: inner.toFixed(2) }),
        })
      }
      if (outer < R) {
        const c = arcPoints(0, 0, outer, 0, TAU, 72)
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: c.x,
          y: c.y,
          line: { color: C.rocLine, width: 1.4, dash: 'dash' },
          name: t('sys.trRocBoundaryZ', { v: outer.toFixed(2) }),
        })
      }
      const uc = arcPoints(0, 0, 1, 0, TAU, 90)
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: uc.x,
        y: uc.y,
        line: { color: '#8a8163', width: 1.4 },
        name: t('sys.trUnitCircle'),
      })
    }
    // 零点与极点
    if (pz.zeros.length > 0) {
      traces.push({
        type: 'scatter',
        mode: 'markers',
        x: pz.zeros.map((z) => z.re),
        y: pz.zeros.map((z) => z.im),
        marker: { color: C.zero, size: 11, symbol: 'circle-open', line: { width: 2 } },
        name: t('sys.trZeros'),
        hovertemplate: t('sys.hoverZero') + '<extra></extra>',
      })
    }
    if (pz.poles.length > 0) {
      traces.push({
        type: 'scatter',
        mode: 'markers',
        x: pz.poles.map((p) => p.re),
        y: pz.poles.map((p) => p.im),
        marker: { color: C.pole, size: 11, symbol: 'x', line: { width: 2 } },
        name: t('sys.trPoles'),
        hovertemplate: t('sys.hoverPole') + '<extra></extra>',
      })
    }
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: [viewRange.x[0], viewRange.x[1]],
      y: [0, 0],
      line: { color: '#c4b795', width: 1 },
      showlegend: false,
      hoverinfo: 'skip',
    })
    return traces
  }, [domain, pz, roc, viewRange, t])

  const pzLayout = useMemo(() => {
    const title = domain === 'ct' ? t('sys.pzTitleCt') : t('sys.pzTitleDt')
    return baseLayout(title, {
      xaxis: axis(domain === 'ct' ? 'σ = Re{s}' : 'Re{z}', { range: viewRange.x, zeroline: true }),
      yaxis: axis(domain === 'ct' ? 'j·Im{s}' : 'Im{z}', { range: viewRange.y, scaleanchor: 'x', scaleratio: 1 }),
    })
  }, [domain, viewRange, t])

  // 点击放置共轭极点对
  function onPzClick(ev: unknown) {
    if (!placePoles) return
    const pts = (ev as { points?: { x: number; y: number }[] }).points
    if (!pts || pts.length === 0) return
    const x = pts[0].x
    const y = Math.abs(pts[0].y ?? 0)
    if (domain === 'ct') {
      setSysCT((s) => ({ ...s, a: [1, -2 * x, x * x + y * y] }))
    } else {
      const r = Math.min(Math.hypot(x, y), 1.45)
      const th = Math.atan2(y, Math.abs(x) < 1e-9 ? r : Math.abs(x))
      setSysDT((s) => ({ ...s, a: [-2 * r * Math.cos(th), r * r] }))
    }
  }

  // ---- 频率响应 ----
  const freqResp = useMemo(() => {
    const W = domain === 'ct' ? 24 : Math.PI
    const M = 721
    const omegas = linspace(0.0001, W, M)
    const mag = new Float64Array(M)
    const ph = new Float64Array(M)
    for (let i = 0; i < M; i++) {
      const w = omegas[i]
      const H = domain === 'ct' ? ctFreqResp({ b: sysCT.b, a: sysCT.a }, w) : dtFreqResp({ b: sysDT.b, a: sysDT.a }, w)
      const m = Math.hypot(H.re, H.im)
      mag[i] = dSys.dB ? 20 * Math.log10(Math.max(m, 1e-9)) : m
      ph[i] = Math.atan2(H.im, H.re)
    }
    return { omegas, mag, ph: unwrapPhase ? unwrap(ph) : ph, W }
  }, [domain, sysCT, sysDT, dSys.dB, unwrapPhase])

  const freqTraces = useMemo(
    () => [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(freqResp.omegas),
        y: Array.from(freqResp.mag),
        line: { color: C.spectrum, width: 1.8 },
        name: dB ? '|H| dB' : domain === 'ct' ? '|H(jω)|' : '|H(e^{jω})|',
        fill: dB ? undefined : 'tozeroy',
        fillcolor: dB ? undefined : C.spectrumFill,
      },
    ],
    [freqResp, dB, domain],
  )

  const phaseTraces = useMemo(
    () => [
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(freqResp.omegas),
        y: Array.from(freqResp.ph),
        line: { color: C.phase, width: 1.8 },
        name: '∠H',
      },
    ],
    [freqResp],
  )

  // ---- 3D |H(s)| 曲面 ----
  const surfaceData = useMemo(() => {
    if (!show3d || domain !== 'ct') return null
    let smin = -3
    let smax = 3
    for (const p of pz.poles) {
      smin = Math.min(smin, p.re - 0.4)
      smax = Math.max(smax, p.re + 0.4)
    }
    const NS = 61
    const NW = 61
    const sigmas = linspace(smin, smax, NS)
    const ws = linspace(-10, 10, NW)
    const num: Cx[] = [cx(sysCT.b[0]), cx(sysCT.b[1]), cx(sysCT.b[2])]
    const den: Cx[] = [cx(sysCT.a[0]), cx(sysCT.a[1]), cx(sysCT.a[2])]
    const Z: number[][] = []
    for (let j = 0; j < NW; j++) {
      const row: number[] = []
      for (let i = 0; i < NS; i++) {
        const s = cx(sigmas[i], ws[j])
        const nv = num[0]
        let na = nv
        for (let k = 1; k < 3; k++) na = cAdd(cMul(na, s), num[k])
        let da = den[0]
        for (let k = 1; k < 3; k++) da = cAdd(cMul(da, s), den[k])
        const d2 = da.re * da.re + da.im * da.im
        const H = d2 > 1e-12 ? cDiv(na, da) : cx(0, 0)
        const m = Math.hypot(H.re, H.im)
        row.push(Math.log10(1 + m))
      }
      Z.push(row)
    }
    const data: unknown[] = [
      {
        type: 'surface',
        x: Array.from(sigmas),
        y: Array.from(ws),
        z: Z,
        colorscale: 'Viridis',
        showscale: false,
        opacity: 0.92,
        hovertemplate: 'σ=%{x:.2f}, ω=%{y:.2f}<br>log₁₀(1+|H|)=%{z:.2f}<extra></extra>',
      },
    ]
    if (pz.poles.length > 0) {
      const zTop = Math.log10(1 + 60)
      data.push({
        type: 'scatter3d',
        mode: 'markers',
        x: pz.poles.map((p) => p.re),
        y: pz.poles.map((p) => p.im),
        z: pz.poles.map(() => zTop),
        marker: { color: C.pole, size: 4, symbol: 'x' },
        name: t('sys.trPoles3d'),
      })
    }
    if (pz.zeros.length > 0) {
      data.push({
        type: 'scatter3d',
        mode: 'markers',
        x: pz.zeros.map((p) => p.re),
        y: pz.zeros.map((p) => p.im),
        z: pz.zeros.map(() => 0),
        marker: { color: C.zero, size: 4, symbol: 'circle-open' },
        name: t('sys.trZeros3d'),
      })
    }
    return data
  }, [show3d, domain, sysCT, pz, t])

  const surfaceLayout = useMemo(
    () => ({
      paper_bgcolor: 'rgba(0,0,0,0)',
      font: { color: C.text, size: 10 },
      margin: { l: 0, r: 0, t: 26, b: 0 },
      title: { text: t('sys.surfTitle'), font: { size: 12, color: '#1d1a13' }, x: 0.012 },
      scene: {
        xaxis: { title: 'σ', gridcolor: C.grid, color: '#6b6250' },
        yaxis: { title: 'ω', gridcolor: C.grid, color: '#6b6250' },
        zaxis: { title: 'log₁₀(1+|H|)', gridcolor: C.grid, color: '#6b6250' },
        camera: { eye: { x: 1.5, y: -1.4, z: 0.9 } },
        bgcolor: 'rgba(0,0,0,0)',
      },
      showlegend: true,
      legend: { orientation: 'h', x: 0.01, y: 1.1, font: { size: 10 } },
    }),
    [t],
  )

  // ---- 时域仿真 ----
  const sim = useMemo(() => {
    const { inputKind, fIn, wIn, inExpr, simT, simN } = dSys
    if (domain === 'ct') {
      const ss = ctStateSpace({ b: sysCT.b, a: sysCT.a })
      if (ss.improper) return { kind: 'err' as const, msg: t('sys.simErrImproper') }
      const M = 3000
      if (inputKind === 'impulse') {
        const r = simulateCTImpulse(ss, Math.min(simT, 14), M)
        return { kind: 'ct' as const, t: r.t, u: null, y: r.y, label: t('sys.simImpulseCt'), extra: ss.D }
      }
      let input: (t: number) => number
      let label: string
      if (inputKind === 'step') {
        input = (t) => (t >= 0 ? 1 : 0)
        label = t('sys.simStep')
      } else if (inputKind === 'sin') {
        input = (t) => Math.sin(TAU * fIn * t)
        label = t('sys.simSinF', { v: fIn.toFixed(2) })
      } else {
        const c = compileSignal(inExpr)
        if (!c.ok) return { kind: 'err' as const, msg: c.error }
        const smp = makeSampler(c.compiled, 'ct', { a: 1, b: 3, f0: fIn, w0: 2, tau: 1, t0: 0, L: 8 })
        input = (t) => smp(t).re
        label = t('sys.simCustom')
      }
      const r = simulateCTForced(ss, input, Math.min(simT, 14), M)
      return { kind: 'ct' as const, t: r.t, u: r.u, y: r.y, label, extra: ss.D }
    }
    // DT
    const N = simN
    let xIn: number[]
    let label: string
    if (inputKind === 'impulse') {
      xIn = Array.from({ length: N }, (_, i) => (i === 0 ? 1 : 0))
      label = t('sys.simImpulseDt')
    } else if (inputKind === 'step') {
      xIn = Array.from({ length: N }, () => 1)
      label = t('sys.simStep')
    } else if (inputKind === 'sin') {
      xIn = Array.from({ length: N }, (_, i) => Math.sin(wIn * i))
      label = t('sys.simSinW', { v: wIn.toFixed(2) })
    } else {
      // 仅替换独立的自变量符号 t（\b 词边界），不破坏 rect/sqrt/tri/tau/t0 等标识符
      const c = compileSignal(inExpr.replace(/\bt\b/g, 'n'))
      if (!c.ok) return { kind: 'err' as const, msg: c.error }
      const smp = makeSampler(c.compiled, 'dt', { a: 1, b: 3, f0: wIn / TAU, w0: wIn, tau: 1, t0: 0, L: 8 })
      xIn = Array.from({ length: N }, (_, i) => smp(i).re)
      label = t('sys.simCustom')
    }
    const r = simulateDT({ b: sysDT.b, a: sysDT.a }, xIn)
    return { kind: 'dt' as const, t: r.n, u: xIn, y: r.y, label, extra: 0 }
  }, [dSys, domain, sysCT, sysDT, t])

  const simTraces = useMemo(() => {
    if (sim.kind === 'err') return []
    const traces: unknown[] = []
    const xs = Array.from(sim.t)
    if (sim.u) {
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: xs,
        y: sim.u,
        line: { color: C.signal, width: 1.4, dash: 'dot' },
        name: t('sys.trInput'),
      })
    }
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: xs,
      y: sim.y,
      line: { color: C.output, width: 2 },
      name: sim.label,
    })
    return traces
  }, [sim, t])

  // layout 用 useMemo 固定引用，避免无关 state（如 placePoles/show3d）变化引发全量 Plotly.react
  const layoutMag = useMemo(
    () =>
      baseLayout((domain === 'ct' ? t('sys.ltMagCt') : t('sys.ltMagDt')) + (dB ? ' (dB)' : ''), {
        xaxis: axis(domain === 'ct' ? 'ω (rad/s)' : t('sys.axisRadSample'), { range: [0, freqResp.W] }),
        yaxis: axis(dB ? 'dB' : '|H|'),
      }),
    [domain, dB, freqResp.W, t],
  )
  const layoutPhase = useMemo(
    () =>
      baseLayout(t('sys.ltPhase'), {
        xaxis: axis(domain === 'ct' ? 'ω (rad/s)' : t('sys.axisRadSample'), { range: [0, freqResp.W] }),
        yaxis: axis('rad'),
      }),
    [domain, freqResp.W, t],
  )
  const layoutSim = useMemo(
    () =>
      baseLayout(
        t('sys.ltSim', { label: sim.kind === 'err' ? '' : sim.label }) +
          (domain === 'ct' ? t('sys.rk4') : t('sys.exactRec')),
        {
          xaxis: axis(domain === 'ct' ? 't (s)' : 'n'),
          yaxis: axis(t('common.magnitude')),
        },
      ),
    [sim, domain, t],
  )

  // ---- 读数 ----
  const h0 = useMemo(() => {
    if (domain === 'ct') {
      const H = ctFreqResp({ b: sysCT.b, a: sysCT.a }, 0)
      return Math.hypot(H.re, H.im)
    }
    const H = dtFreqResp({ b: sysDT.b, a: sysDT.a }, 0)
    return Math.hypot(H.re, H.im)
  }, [domain, sysCT, sysDT])

  const pairInfo = useMemo(() => {
    const complex = pz.poles.filter((p) => Math.abs(p.im) > 1e-9)
    if (complex.length === 0) return null
    const p = complex[0]
    if (domain === 'ct') {
      const { zeta, wn } = ctPairParams(p)
      return { zeta, wn }
    }
    return null
  }, [pz, domain])

  const dStr = (v: number) => (Math.abs(v) < 1e-12 ? '0' : v.toFixed(3).replace(/\.?0+$/, ''))

  // ---- 配置导入导出（JSON）----
  const snapshotBuild = () => ({
    domain,
    presetId,
    sysCT: [...sysCT.b, ...sysCT.a] as number[],
    sysDT: [...sysDT.b, ...sysDT.a] as number[],
    rocMode,
    stripIdx,
    show3d,
    dB,
    unwrapPhase,
    inputKind,
    fIn,
    wIn,
    simT,
    simN,
  })
  const snapshotApply = (d: Record<string, unknown>) => {
    const dom = str(d, 'domain', domain, ['ct', 'dt']) as Domain
    const list = dom === 'ct' ? CT_SYSTEMS : DT_SYSTEMS
    const pid = str(d, 'presetId', list[0].id)
    setDomain(dom)
    setPresetId(list.some((p) => p.id === pid) ? pid : list[0].id)
    // 等 [presetId, domain] 的预设副作用先跑完，再覆盖为导入值
    deferApply(() => {
      const ctArr = Array.isArray(d.sysCT) ? (d.sysCT as unknown[]) : null
      if (ctArr && ctArr.length === 6 && ctArr.every((x) => typeof x === 'number' && isFinite(x))) {
        setSysCT({ b: [ctArr[0], ctArr[1], ctArr[2]] as SysCT['b'], a: [ctArr[3], ctArr[4], ctArr[5]] as SysCT['a'] })
      }
      const dtArr = Array.isArray(d.sysDT) ? (d.sysDT as unknown[]) : null
      if (dtArr && dtArr.length === 5 && dtArr.every((x) => typeof x === 'number' && isFinite(x))) {
        setSysDT({ b: [dtArr[0], dtArr[1], dtArr[2]] as SysDT['b'], a: [dtArr[3], dtArr[4]] as SysDT['a'] })
      }
      setRocMode(str(d, 'rocMode', rocMode, ['causal', 'anti', 'strip']) as typeof rocMode)
      setStripIdx(Math.round(num(d, 'stripIdx', stripIdx, 0, 8)))
      setShow3d(bool(d, 'show3d', show3d))
      setDb(bool(d, 'dB', dB))
      setUnwrapPhase(bool(d, 'unwrapPhase', unwrapPhase))
      setInputKind(str(d, 'inputKind', inputKind, ['impulse', 'step', 'sin', 'custom']) as typeof inputKind)
      setFIn(num(d, 'fIn', fIn, 0.05, 3))
      setWIn(num(d, 'wIn', wIn, 0.02, 3.1))
      setSimT(num(d, 'simT', simT, 2, 14))
      setSimN(Math.round(num(d, 'simN', simN, 32, 200)))
    })
  }

  const main = (
    <div className="charts">
      <div className="grid-2">
        <div className="chart-card" data-plate={t('sys.plate')}>
          <Plot data={pzTraces} layout={pzLayout} height={310} onClick={onPzClick} />
          <div className="chart-footer">
            {roc.stable ? <Badge tone="ok">{t('sys.badgeStable')}</Badge> : <Badge tone="err">{t('sys.badgeUnstable')}</Badge>}
            {placePoles && <Badge tone="info">{t('sys.badgePlaceHint')}</Badge>}
          </div>
        </div>
        <div className="chart-card">
          <Plot data={freqTraces} layout={layoutMag} height={310} />
        </div>
        <div className="chart-card">
          <Plot data={phaseTraces} layout={layoutPhase} height={225} />
        </div>
        <div className="chart-card">
          {sim.kind === 'err' ? (
            <div className="sim-error">⚠ {sim.msg}</div>
          ) : (
            <Plot data={simTraces} layout={layoutSim} height={225} />
          )}
        </div>
        {show3d && domain === 'ct' && surfaceData && (
          <div className="chart-card span-2">
            <Plot data={surfaceData} layout={surfaceLayout} height={330} />
          </div>
        )}
      </div>
    </div>
  )

  const aside = (
    <>
      <Panel title={t('common.domain')}>
        <SegBtns
          options={[
            { value: 'ct', label: t('sys.ct') },
            { value: 'dt', label: t('sys.dt') },
          ]}
          value={domain}
          onChange={(d) => {
            setDomain(d)
            setPresetId((d === 'ct' ? CT_SYSTEMS : DT_SYSTEMS)[0].id)
          }}
        />
      </Panel>
      <Panel title={t('sys.lib')}>
        <Select
          value={presetId}
          onChange={setPresetId}
          options={presets.map((p) => ({ value: p.id, label: pickLabel(lang, p) }))}
        />
        <Note>{pickNote(lang, preset)}</Note>
      </Panel>
      {domain === 'ct' ? (
        <Panel title={t('sys.coefCt')}>
          <Slider label="b₂" min={-2} max={2} step={0.01} value={sysCT.b[0]} onChange={(v) => setSysCT((s) => ({ ...s, b: [v, s.b[1], s.b[2]] }))} />
          <Slider label="b₁" min={-5} max={5} step={0.01} value={sysCT.b[1]} onChange={(v) => setSysCT((s) => ({ ...s, b: [s.b[0], v, s.b[2]] }))} />
          <Slider label="b₀" min={-10} max={10} step={0.01} value={sysCT.b[2]} onChange={(v) => setSysCT((s) => ({ ...s, b: [s.b[0], s.b[1], v] }))} />
          <Slider label="a₂" min={0} max={4} step={0.05} value={sysCT.a[0]} onChange={(v) => setSysCT((s) => ({ ...s, a: [v, s.a[1], s.a[2]] }))} />
          <Slider label="a₁" min={-6} max={6} step={0.01} value={sysCT.a[1]} onChange={(v) => setSysCT((s) => ({ ...s, a: [s.a[0], v, s.a[2]] }))} />
          <Slider label="a₀" min={-10} max={10} step={0.01} value={sysCT.a[2]} onChange={(v) => setSysCT((s) => ({ ...s, a: [s.a[0], s.a[1], v] }))} />
          {!sysValid && <div className="expr-error">{t('sys.invalid')}</div>}
        </Panel>
      ) : (
        <Panel title={t('sys.coefDt')}>
          <Slider label="b₀" min={-2} max={2} step={0.005} value={sysDT.b[0]} onChange={(v) => setSysDT((s) => ({ ...s, b: [v, s.b[1], s.b[2]] }))} />
          <Slider label="b₁" min={-4} max={4} step={0.005} value={sysDT.b[1]} onChange={(v) => setSysDT((s) => ({ ...s, b: [s.b[0], v, s.b[2]] }))} />
          <Slider label="b₂" min={-4} max={4} step={0.005} value={sysDT.b[2]} onChange={(v) => setSysDT((s) => ({ ...s, b: [s.b[0], s.b[1], v] }))} />
          <Slider label="a₁" min={-2.6} max={2.6} step={0.005} value={sysDT.a[0]} onChange={(v) => setSysDT((s) => ({ ...s, a: [v, s.a[1]] }))} />
          <Slider label="a₂" min={-1.5} max={1.5} step={0.005} value={sysDT.a[1]} onChange={(v) => setSysDT((s) => ({ ...s, a: [s.a[0], v] }))} />
        </Panel>
      )}
      <Panel title={t('sys.pzPanel')}>
        <Toggle checked={placePoles} onChange={setPlacePoles} label={t('sys.placePoles')} />
        <Field label={t('sys.rocChoose')}>
          <SegBtns
            options={[
              { value: 'causal', label: t('sys.rocCausal') },
              { value: 'anti', label: t('sys.rocAnti') },
              { value: 'strip', label: t('sys.rocStrip') },
            ]}
            value={rocMode}
            onChange={(v) => setRocMode(v as typeof rocMode)}
          />
        </Field>
        {rocMode === 'strip' && (
          <Slider
            label={t('sys.stripNo')}
            min={0}
            max={Math.max(0, roc.nStrips - 1)}
            step={1}
            value={stripIdx}
            onChange={(v) => setStripIdx(Math.round(v))}
            fmt={(v) => t('sys.stripFmt', { n: v + 1 })}
          />
        )}
        <div className="pz-list mono">
          <div>
            {t('sys.poleList')}
            {pz.poles.length ? pz.poles.map((p) => fmtCx(p)).join(listSep(lang) + ' ') : t('sys.none')}
          </div>
          <div>
            {t('sys.zeroList')}
            {pz.zeros.length ? pz.zeros.map((p) => fmtCx(p)).join(listSep(lang) + ' ') : t('sys.none')}
          </div>
        </div>
      </Panel>
      <Panel title={t('sys.simPanel')}>
        <SegBtns
          options={[
            { value: 'impulse', label: t('sys.inImpulse') },
            { value: 'step', label: t('sys.inStep') },
            { value: 'sin', label: t('sys.inSin') },
            { value: 'custom', label: t('sys.inCustom') },
          ]}
          value={inputKind}
          onChange={(v) => setInputKind(v as typeof inputKind)}
        />
        {inputKind === 'sin' && domain === 'ct' && (
          <Slider label={t('sys.inFreqF')} min={0.05} max={3} step={0.01} value={fIn} onChange={setFIn} unit="Hz" />
        )}
        {inputKind === 'sin' && domain === 'dt' && (
          <Slider label={t('sys.inFreqW')} min={0.02} max={3.1} step={0.01} value={wIn} onChange={setWIn} unit={t('sys.axisRadSample')} />
        )}
        {inputKind === 'custom' && (
          <TextInput value={inExpr} onChange={setInExpr} placeholder={domain === 'ct' ? 'exp(-a*t)*u(t)' : 'sin(w0*n)*u(n)'} />
        )}
        {domain === 'ct' ? (
          <Slider label={t('sys.simT')} min={2} max={14} step={0.5} value={simT} onChange={setSimT} unit="s" />
        ) : (
          <Slider label={t('sys.simN')} min={32} max={200} step={1} value={simN} onChange={(v) => setSimN(Math.round(v))} />
        )}
      </Panel>
      <Panel title={t('sys.viewOpts')}>
        <Toggle checked={dB} onChange={setDb} label={t('sys.dB')} />
        <Toggle checked={unwrapPhase} onChange={setUnwrapPhase} label={t('common.unwrap')} />
        {domain === 'ct' && <Toggle checked={show3d} onChange={setShow3d} label={t('sys.show3d')} />}
      </Panel>
      <Panel title={t('common.snapshot')}>
        <SnapshotIO view="sys" build={snapshotBuild} apply={snapshotApply} />
      </Panel>
    </>
  )

  const sysTex =
    domain === 'ct'
      ? String.raw`H(s)=\frac{${dStr(sysCT.b[0])}s^2+${dStr(sysCT.b[1])}s+${dStr(sysCT.b[2])}}{${dStr(sysCT.a[0])}s^2+${dStr(sysCT.a[1])}s+${dStr(sysCT.a[2])}}`
      : String.raw`H(z)=\frac{${dStr(sysDT.b[0])}+${dStr(sysDT.b[1])}z^{-1}+${dStr(sysDT.b[2])}z^{-2}}{1+${dStr(sysDT.a[0])}z^{-1}+${dStr(sysDT.a[1])}z^{-2}}`

  const rocText =
    domain === 'ct'
      ? roc.band.lo !== null && roc.band.hi !== null
        ? String.raw`${roc.band.lo.toFixed(2)}<\mathrm{Re}\{s\}<${roc.band.hi.toFixed(2)}`
        : roc.band.lo !== null
          ? String.raw`\mathrm{Re}\{s\}>${roc.band.lo.toFixed(2)}`
          : String.raw`\mathrm{Re}\{s\}<${(roc.band.hi ?? 0).toFixed(2)}`
      : roc.band.lo !== null && roc.band.hi !== null
        ? String.raw`${roc.band.lo.toFixed(2)}<|z|<${roc.band.hi.toFixed(2)}`
        : roc.band.lo !== null
          ? String.raw`|z|>${roc.band.lo.toFixed(2)}`
          : String.raw`|z|<${(roc.band.hi ?? 0).toFixed(2)}`

  const explanation = (
    <Explanation>
      <ExpSection title={t('sys.explSystem')}>
        <Tex block tex={sysTex} />
        <div className="exp-note">
          {t('sys.freqNote1')}
          {domain === 'ct' ? t('sys.freqNoteCt') : t('sys.freqNoteDt')}
          {t('sys.freqNote2')}
        </div>
      </ExpSection>
      <ExpSection title={t('common.explValues')}>
        <div className="exp-note mono">
          H({domain === 'ct' ? '0' : 'e^{j0}'}) = {h0.toFixed(3)}
          {t('sys.dcGain')}
          {pairInfo ? `  ·  ζ = ${pairInfo.zeta.toFixed(3)}, ωn = ${pairInfo.wn.toFixed(3)} rad/s` : ''}
          {sim.kind === 'ct' && Math.abs(sim.extra) > 1e-9 ? t('sys.feedthrough') : ''}
        </div>
        <div className="exp-note">
          ROC: <Tex tex={rocText} /> {roc.stable ? t('sys.rocOk') : t('sys.rocBad')}
        </div>
      </ExpSection>
      <ExpSection title={t('common.explPoints')}>
        <ul className="exp-list">
          <li>{t('sys.obs1', { near: domain === 'ct' ? t('sys.nearCt') : t('sys.nearDt') })}</li>
          <li>{t('sys.obs2', { on: domain === 'ct' ? t('sys.onCt') : t('sys.onDt') })}</li>
          <li>{t('sys.obs3')}</li>
          <li>{t('sys.obs4')}</li>
        </ul>
      </ExpSection>
    </Explanation>
  )

  return <LabLayout aside={aside} main={main} explanation={explanation} />
}
