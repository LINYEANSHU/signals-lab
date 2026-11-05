// 模块四：卷积实验室 —— "翻转、滑动、相乘、求和" 的动画演示（CT / DT）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'
import { Plot } from '../components/Plot'
import { Badge, Btn, Panel, SegBtns, Select, Slider, SnapshotIO, Note } from '../components/ui'
import { ExpSection, Explanation, Tex } from '../components/Tex'
import { LabLayout } from '../components/LabLayout'
import { useI18n, pickLabel, pickNote, listSep } from '../i18n'
import { compileSignal, makeSampler, DEFAULT_PARAMS, PARAM_KEYS, type Domain, type Params } from '../lib/parser'
import { deferApply, num, numRecord, str } from '../lib/snapshot'
import { sampleCT, sampleDT, ndft, linspace, convolve, type Sampled } from '../lib/numeric'
import { CT_CONV, DT_CONV, type ConvPreset } from '../lib/presets'
import { C, axis, baseLayout } from '../lib/plotTheme'

const N_CONV = 1201 // 每个信号的采样点数
const SWEEP_SEC = 9

export default function ConvolutionLab() {
  const { lang, t } = useI18n()
  const [domain, setDomain] = useState<Domain>('ct')
  const presets = domain === 'ct' ? CT_CONV : DT_CONV
  const [presetId, setPresetId] = useState(CT_CONV[0].id)
  const preset: ConvPreset = useMemo(() => presets.find((p) => p.id === presetId) ?? presets[0], [presets, presetId])

  const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS, ...preset.params })
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [scrub, setScrub] = useState(0)

  useEffect(() => {
    setParams({ ...DEFAULT_PARAMS, ...preset.params })
    kRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, domain])

  const cx_ = useMemo(() => compileSignal(preset.xExpr), [preset])
  const ch_ = useMemo(() => compileSignal(preset.hExpr), [preset])

  // ---- 采样 ----
  const S: { x: Sampled | null; h: Sampled | null } = useMemo(() => {
    if (!cx_.ok || !ch_.ok) return { x: null, h: null }
    const win: [number, number] = domain === 'ct' ? preset.win ?? [-3, 3] : preset.nwin ?? [0, 24]
    const sx = makeSampler(cx_.compiled, domain, params)
    const sh = makeSampler(ch_.compiled, domain, params)
    if (domain === 'ct') {
      return { x: sampleCT(sx, win[0], win[1], N_CONV), h: sampleCT(sh, win[0], win[1], N_CONV) }
    }
    return { x: sampleDT(sx, win[0], win[1]), h: sampleDT(sh, win[0], win[1]) }
  }, [cx_, ch_, params, domain, preset])

  // ---- 卷积结果 ----
  const conv = useMemo(() => {
    if (!S.x || !S.h) return null
    if (domain === 'ct') {
      const y = convolve(S.x.re, S.h.re)
      const yi = convolve(S.x.im, S.h.im)
      const dt = S.x.dt
      const t0y = S.x.t0 + S.h.t0
      const n = y.length
      return {
        t: linspace(t0y, t0y + (n - 1) * dt, n),
        y: Float64Array.from(y, (v) => v * dt),
        t0: t0y,
        dt,
      }
    }
    const y = convolve(S.x.re, S.h.re)
    const t0y = S.x.t0 + S.h.t0
    const n = y.length
    return { t: linspace(t0y, t0y + (n - 1), n), y, t0: t0y, dt: 1 }
  }, [S, domain])

  // ---- 频域校验 |X|·|H| = |Y| ----
  const freqCheck = useMemo(() => {
    if (!S.x || !S.h || !conv) return null
    const wmax = domain === 'ct' ? 20 : Math.PI
    const omegas = linspace(-wmax, wmax, 501)
    const X = ndft(S.x.re, S.x.im, S.x.t0, S.x.dt, omegas)
    const H = ndft(S.h.re, S.h.im, S.h.t0, S.h.dt, omegas)
    const Y = ndft(conv.y, new Float64Array(conv.y.length), conv.t0, conv.dt, omegas)
    const mag = (A: { re: Float64Array; im: Float64Array }) => Float64Array.from(A.re, (_, i) => Math.hypot(A.re[i], A.im[i]))
    return { omegas, mx: mag(X), mh: mag(H), my: mag(Y), wmax }
  }, [S, conv, domain])

  const Ny = conv ? conv.y.length : 0

  // ---- 配置导入导出（JSON）----
  const snapshotBuild = () => ({
    domain,
    presetId,
    params: { ...params },
    speed,
  })
  const snapshotApply = (d: Record<string, unknown>) => {
    const dom = str(d, 'domain', domain, ['ct', 'dt']) as Domain
    const list = dom === 'ct' ? CT_CONV : DT_CONV
    const pid = str(d, 'presetId', list[0].id)
    setDomain(dom)
    setPresetId(list.some((p) => p.id === pid) ? pid : list[0].id)
    // 等 [presetId, domain] 的预设副作用先跑完，再覆盖为导入值
    deferApply(() => {
      setParams(numRecord(d, 'params', PARAM_KEYS, DEFAULT_PARAMS) as Params)
      setSpeed(num(d, 'speed', speed, 0.25, 4))
    })
  }
  const kRef = useRef(0)
  const gdFlip = useRef<unknown>(null)
  const gdY = useRef<unknown>(null)
  const readY = useRef<HTMLSpanElement | null>(null)
  const readT = useRef<HTMLSpanElement | null>(null)

  const draw = useCallback(
    (i: number) => {
      const K = Math.max(0, Math.min(Ny - 1, i))
      if (!S.x || !S.h || !conv) return
      try {
        const tK = conv.t[K]
        const rst = (gd: unknown, spec: Record<string, unknown>, idx: number[]) => {
          if (gd) {
            try {
              Plotly.restyle(gd as never, spec as never, idx as never)
            } catch {
              /* 图表重建竞态：跳过该帧 */
            }
          }
        }
      // 翻转滑动核 + 重叠乘积
      const tx = S.x.t
      const n = tx.length
      const hx: (number)[] = []
      const hy: (number)[] = []
      const py: (number)[] = []
      for (let ii = 0; ii < n; ii++) {
        const hi = K - ii // h[tK − τ] 的采样索引
        if (hi >= 0 && hi < S.h.re.length) {
          hx.push(tx[ii])
          hy.push(S.h.re[hi])
          py.push(S.x.re[ii] * S.h.re[hi])
        }
      }
      rst(gdFlip.current, { x: [hx], y: [hy] }, [1])
      rst(gdFlip.current, { x: [hx], y: [py] }, [2])
      rst(gdFlip.current, { x: [[tK, tK]], y: [[-0.05, 1.05]] }, [3])
      // y 前缀
      rst(gdY.current, { x: [conv.t.subarray(0, K + 1)], y: [conv.y.subarray(0, K + 1)] }, [1])
      rst(gdY.current, { x: [[tK]], y: [[conv.y[K]]] }, [2])
      if (readY.current) readY.current.textContent = conv.y[K].toFixed(4)
      if (readT.current) readT.current.textContent = tK.toFixed(2)
      setScrub(K)
      } catch {
        /* 单帧绘制失败：静默跳过，等待下一帧 */
      }
    },
    [S, conv, domain, Ny],
  )

  useEffect(() => {
    draw(kRef.current)
  }, [draw])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let lastDraw = 0
    const tick = (now: number) => {
      const dms = Math.min(60, now - last)
      last = now
      kRef.current = (kRef.current + (dms / 1000) * speed * (Ny / SWEEP_SEC)) % Ny
      if (now - lastDraw > 30) {
        lastDraw = now
        draw(Math.floor(kRef.current))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, draw, Ny])

  // ---- 静态轨迹 ----
  const dataX = useMemo(() => {
    if (!S.x) return []
    if (domain === 'ct')
      return [
        {
          type: 'scatter',
          mode: 'lines',
          x: Array.from(S.x.t),
          y: Array.from(S.x.re),
          line: { color: C.signal, width: 1.8 },
          fill: 'tozeroy',
          fillcolor: C.signalFill,
          name: 'x(τ)',
        },
      ]
    return [
      {
        type: 'bar',
        x: Array.from(S.x.t),
        y: Array.from(S.x.re),
        marker: { color: C.signal, opacity: 0.8 },
        name: 'x[k]',
      },
    ]
  }, [S.x, domain])

  const dataFlip = useMemo(() => {
    if (!S.h) return []
    const base: unknown[] = [
      domain === 'ct'
        ? {
            type: 'scatter',
            mode: 'lines',
            x: Array.from(S.h.t),
            y: Array.from(S.h.re),
            line: { color: C.system, width: 1.2, dash: 'dash' },
            name: 'h(τ)',
          }
        : {
            type: 'bar',
            x: Array.from(S.h.t),
            y: Array.from(S.h.re),
            marker: { color: 'rgba(96,165,250,0.4)' },
            name: 'h[k]',
          },
      domain === 'ct'
        ? { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: C.compare, width: 2 }, name: t('conv.trFlipCt'), hoverinfo: 'skip' }
        : { type: 'bar', x: [], y: [], marker: { color: C.compare, opacity: 0.9 }, name: t('conv.trFlipDt'), hoverinfo: 'skip' },
      domain === 'ct'
        ? { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: C.product, width: 0 }, fill: 'tozeroy', fillcolor: 'rgba(244,114,182,0.25)', name: t('conv.trOverlap'), hoverinfo: 'skip' }
        : { type: 'bar', x: [], y: [], marker: { color: C.product, opacity: 0.7 }, name: t('conv.trProduct'), hoverinfo: 'skip' },
      { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: '#5c5644', width: 1 }, showlegend: false, hoverinfo: 'skip' },
    ]
    return base
  }, [S.h, domain, t])

  const dataY = useMemo(() => {
    if (!conv) return []
    const full: unknown = {
      type: 'scatter',
      mode: 'lines',
      x: Array.from(conv.t),
      y: Array.from(conv.y),
      line: { color: 'rgba(52,211,153,0.35)', width: 1.2 },
      name: t('conv.trFull'),
    }
    const prefix: unknown =
      domain === 'ct'
        ? { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: C.output, width: 2.2 }, name: t('conv.trYaccCt'), fill: 'tozeroy', fillcolor: 'rgba(52,211,153,0.10)' }
        : { type: 'scatter', mode: 'lines', x: [], y: [], line: { color: C.output, width: 1 }, marker: { color: C.output, size: 5 }, name: t('conv.trYaccDt') }
    const dot: unknown = {
      type: 'scatter',
      mode: 'markers',
      x: [],
      y: [],
      marker: { color: '#d4451f', size: 9 },
      name: t('conv.trCurrent'),
    }
    return [full, prefix, dot]
  }, [conv, domain, t])

  // layout 用 useMemo 固定引用：动画每帧 setScrub 触发重渲染时，
  // Plot 组件的 effect（依赖 data/layout 引用）才不会反复触发全量 Plotly.react。
  const layoutX = useMemo(
    () =>
      baseLayout(domain === 'ct' ? t('conv.ltX') : t('conv.ltXdt'), {
        xaxis: axis(domain === 'ct' ? 'τ (s)' : 'k'),
        yaxis: axis(t('common.magnitude')),
      }),
    [domain, t],
  )
  const layoutFlip = useMemo(
    () =>
      baseLayout(t('conv.ltFlip'), {
        xaxis: axis(domain === 'ct' ? 'τ (s)' : 'k'),
        yaxis: axis(t('common.magnitude')),
      }),
    [domain, t],
  )
  const layoutY = useMemo(
    () =>
      baseLayout(domain === 'ct' ? t('conv.ltY') : t('conv.ltYdt'), {
        xaxis: axis(domain === 'ct' ? 't (s)' : 'm'),
        yaxis: axis(t('common.magnitude')),
      }),
    [domain, t],
  )

  const layoutFreq = useMemo(
    () =>
      baseLayout(t('conv.ltFreq'), {
        xaxis: axis(freqCheck ? (domain === 'ct' ? 'ω (rad/s)' : 'ω (rad)') : ''),
        yaxis: axis('|·|'),
      }),
    [freqCheck, domain, t],
  )

  const freqTraces = useMemo(() => {
    if (!freqCheck) return []
    return [
      { type: 'scatter', mode: 'lines', x: Array.from(freqCheck.omegas), y: Array.from(freqCheck.mx), line: { color: C.signal, width: 1.3 }, name: '|X|' },
      { type: 'scatter', mode: 'lines', x: Array.from(freqCheck.omegas), y: Array.from(freqCheck.mh), line: { color: C.system, width: 1.3 }, name: '|H|' },
      { type: 'scatter', mode: 'lines', x: Array.from(freqCheck.omegas), y: Array.from(freqCheck.my), line: { color: C.output, width: 1.8 }, name: '|Y|' },
      {
        type: 'scatter',
        mode: 'lines',
        x: Array.from(freqCheck.omegas),
        y: Array.from(freqCheck.mx.map((v, i) => v * freqCheck.mh[i])),
        line: { color: '#1d1a13', width: 1, dash: 'dot' },
        name: '|X|·|H|',
      },
    ]
  }, [freqCheck])

  const main = (
    <div className="charts">
      <div className="grid-2">
        <div className="chart-card" data-plate={t('conv.plate')}>
          <Plot data={dataX} layout={layoutX} height={225} />
        </div>
        <div className="chart-card">
          <Plot data={dataFlip} layout={layoutFlip} height={225} onReady={(gd) => (gdFlip.current = gd)} />
        </div>
        <div className="chart-card">
          <Plot data={dataY} layout={layoutY} height={235} onReady={(gd) => (gdY.current = gd)} />
        </div>
        <div className="chart-card">
          <Plot data={freqTraces} layout={layoutFreq} height={235} />
        </div>
      </div>
      <div className="readout-bar">
        <div className="ro-item">
          <span className="ro-k">{t('conv.roT')}</span>
          <span className="ro-v" ref={readT}>—</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">{t('conv.roY')}</span>
          <span className="ro-v" ref={readY}>—</span>
        </div>
        <div className="ro-item">
          <span className="ro-k">{t('conv.roLen')}</span>
          <span className="ro-v mono">{Ny}</span>
        </div>
      </div>
    </div>
  )

  const aside = (
    <>
      <Panel title={t('common.domain')}>
        <SegBtns
          options={[
            { value: 'ct', label: t('conv.ct') },
            { value: 'dt', label: t('conv.dt') },
          ]}
          value={domain}
          onChange={(d) => {
            setDomain(d)
            setPresetId((d === 'ct' ? CT_CONV : DT_CONV)[0].id)
          }}
        />
      </Panel>
      <Panel title={t('conv.presetPanel')}>
        <Select
          value={presetId}
          onChange={setPresetId}
          options={presets.map((p) => ({ value: p.id, label: pickLabel(lang, p) }))}
        />
        <Note>{pickNote(lang, preset)}</Note>
      </Panel>
      {Object.keys(preset.params ?? {}).length > 0 && (
        <Panel title={t('common.params')}>
          <Slider label={t('conv.tauSlider')} min={0.1} max={4} step={0.01} value={params.tau} onChange={(v) => setParams((p) => ({ ...p, tau: v }))} />
          <Slider label={t('conv.aSlider')} min={0.1} max={4} step={0.01} value={params.a} onChange={(v) => setParams((p) => ({ ...p, a: v }))} />
        </Panel>
      )}
      <Panel title={t('common.animPanel')}>
        <div className="btn-row">
          <Btn tone="accent" onClick={() => setPlaying((p) => !p)}>
            {playing ? t('common.pause') : t('common.play')}
          </Btn>
          <Btn
            onClick={() => {
              kRef.current = 0
              draw(0)
            }}
          >
            {t('common.reset')}
          </Btn>
        </div>
        <Slider label={t('common.speed')} min={0.25} max={4} step={0.25} value={speed} onChange={setSpeed} fmt={(v) => `${v}×`} />
        <Slider
          label={t('conv.slideProgress')}
          min={0}
          max={Math.max(1, Ny - 1)}
          step={1}
          value={scrub}
          onChange={(v) => {
            kRef.current = v
            draw(Math.floor(v))
          }}
          fmt={(v) => `${((v / Math.max(1, Ny - 1)) * 100).toFixed(0)}%`}
        />
      </Panel>
      <Panel title={t('conv.steps')}>
        <div className="legend-list">
          <span>{t('conv.step1')}</span>
          <span>{t('conv.step2')}</span>
          <span>{t('conv.step3')}</span>
        </div>
        <Note>{t('conv.stepsNote')}</Note>
      </Panel>
      <Panel title={t('common.snapshot')}>
        <SnapshotIO view="conv" build={snapshotBuild} apply={snapshotApply} />
      </Panel>
    </>
  )

  const explanation = (
    <Explanation>
      <ExpSection title={t('common.explDef')}>
        {domain === 'ct' ? (
          <Tex block tex={String.raw`y(t)=x(t)*h(t)=\int_{-\infty}^{\infty}x(\tau)\,h(t-\tau)\,d\tau`} />
        ) : (
          <Tex block tex={String.raw`y[m]=x[m]*h[m]=\sum_{k=-\infty}^{\infty}x[k]\,h[m-k]`} />
        )}
        <div className="exp-note">
          {t('conv.defNote', { method: domain === 'ct' ? t('conv.trapz') : t('conv.exact') })}
        </div>
      </ExpSection>
      <ExpSection title={t('common.explValues')}>
        <div className="exp-note mono">
          {domain === 'ct'
            ? t('conv.support') +
              ' ' +
              (conv ? conv.t[0].toFixed(1) : '—') +
              listSep(lang) +
              (conv ? conv.t[conv.t.length - 1].toFixed(1) : '—') +
              ' ]'
            : ''}
          {'  ·  '}
          {pickLabel(lang, preset)}
        </div>
      </ExpSection>
      <ExpSection title={t('common.explPoints')}>
        <ul className="exp-list">
          <li>
            {t('conv.obs1a')}
            <Tex tex={String.raw`x*h\leftrightarrow X\cdot H`} />
            {t('conv.obs1b')}
          </li>
          <li>{t('conv.obs2')}</li>
          <li>{t('conv.obs3')}</li>
          <li>{t('conv.obs4')}</li>
        </ul>
      </ExpSection>
    </Explanation>
  )

  return <LabLayout aside={aside} main={main} explanation={explanation} />
}
