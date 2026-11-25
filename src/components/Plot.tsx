import { useEffect, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'
import { useI18n } from '../i18n'
import { C, FONT } from '../lib/plotTheme'

export type PlotProps = {
  data: unknown[]
  layout?: Record<string, unknown>
  height?: number
  onClick?: (ev: unknown) => void
  onReady?: (gd: unknown) => void
  className?: string
  style?: React.CSSProperties
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const k of Object.keys(over)) {
    const b = out[k]
    const o = over[k]
    if (isPlainObject(b) && isPlainObject(o)) out[k] = deepMerge(b, o)
    else out[k] = o
  }
  return out
}

function mergeLayout(user: Record<string, unknown> | undefined): Record<string, unknown> {
  const base: Record<string, unknown> = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: C.text, size: 11, family: FONT },
    margin: { l: 52, r: 18, t: 34, b: 40 },
    showlegend: true,
    legend: { orientation: 'h', x: 0.01, y: 1.12, xanchor: 'left', font: { size: 10.5 }, bgcolor: 'rgba(0,0,0,0)' },
    hovermode: 'closest',
  }
  return user ? deepMerge(base, user) : base
}

type PlotSurface = {
  node: HTMLDivElement
  generation: number
  active: boolean
  pending: Set<Promise<unknown>>
}

function runPlotOperation<T>(surface: PlotSurface, action: () => T | PromiseLike<T>): Promise<T> {
  const job = new Promise<T>(resolve => resolve(action()))
  surface.pending.add(job)
  const settled = () => { surface.pending.delete(job) }
  void job.then(settled, settled)
  return job
}

/** Plotly 图表封装：data/layout 变化时调用 Plotly.react；支持点击事件与自适应尺寸 */
export function Plot({ data, layout, height = 240, onClick, onReady, className, style }: PlotProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<PlotSurface | null>(null)
  const onClickRef = useRef(onClick)
  const onReadyRef = useRef(onReady)
  onClickRef.current = onClick
  onReadyRef.current = onReady
  const { t } = useI18n()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const previous = surfaceRef.current
    const surface = previous?.node === el ? previous : { node: el, generation: 0, active: false, pending: new Set<Promise<unknown>>() }
    surfaceRef.current = surface
    surface.active = true
    const generation = ++surface.generation
    const ro = new ResizeObserver(() => {
      if (surface.active) void runPlotOperation(surface, () => Plotly.Plots.resize(el as never)).catch(() => {})
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      surface.active = false
      // Plotly finishes updates by emitting an event on the graph. Keep its
      // emitter alive until the in-flight operations have settled.
      void Promise.allSettled(surface.pending).then(() => {
        if (surface.generation !== generation) return
        if (surfaceRef.current === surface) surfaceRef.current = null
        try {
          Plotly.purge(el as never)
        } catch {
          /* The graph may not have initialized successfully. */
        }
      })
    }
  }, [])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const el = surface.node
    const merged = mergeLayout(layout)
    let active = true
    const render = (notify: boolean) => {
      if (!active || !surface.active) return
      void runPlotOperation(surface, () => Plotly.react(el, data as never, merged as never, {
        displayModeBar: false,
        responsive: false, // ResizeObserver owns resize so teardown can await it.
        scrollZoom: true,
        doubleClick: 'reset',
      })).then(() => {
        if (notify && active && surface.active) onReadyRef.current?.(el)
      }).catch(() => {})
    }
    render(true)
    // 始终绑定点击（回调经 ref 转发，placePoles 等开关变化无需重新绑定）。
    // plotly_click 只在命中数据点时触发；这里用 DOM click + 坐标反算，
    // 使"点击空白处放置极点"等交互在任意位置可用。
    const gdEl = el as unknown as HTMLElement & { _fullLayout?: any }
    let downX = 0
    let downY = 0
    const onDown = (ev: PointerEvent) => {
      downX = ev.clientX
      downY = ev.clientY
    }
    const domClick = (ev: MouseEvent) => {
      const cb = onClickRef.current
      if (!cb) return
      // 拖动缩放结束的 click 不算"点击放置"
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 5) return
      const fl = gdEl._fullLayout
      if (!fl || !fl.xaxis || !fl.yaxis) return // 3D 等非笛卡尔图不支持
      const bb = gdEl.getBoundingClientRect()
      const px = ev.clientX - bb.left
      const py = ev.clientY - bb.top
      const xa = fl.xaxis
      const ya = fl.yaxis
      if (px < xa._offset || px > xa._offset + xa._length) return
      if (py < ya._offset || py > ya._offset + ya._length) return
      const dx = xa.range[0] + ((px - xa._offset) / xa._length) * (xa.range[1] - xa.range[0])
      const dy = ya.range[1] - ((py - ya._offset) / ya._length) * (ya.range[1] - ya.range[0])
      cb({ points: [{ x: dx, y: dy }] })
    }
    gdEl.addEventListener('pointerdown', onDown)
    gdEl.addEventListener('click', domClick)
    // 容器晚于首帧展开时（如 3D 曲面），延迟补一次完整重绘（gl3d 的 scene 需要重新布局）。
    // 仅 3D 轨迹需要该兜底；2D 图由 ResizeObserver 处理尺寸变化，
    // 多余的一次全量 Plotly.react 只会白白重复渲染。
    const is3d = (data as { type?: unknown }[]).some(
      (t) => t && typeof t === 'object' && typeof (t as { type?: unknown }).type === 'string' &&
        ((t as { type: string }).type === 'surface' || (t as { type: string }).type.endsWith('3d')),
    )
    const t1 = is3d ? window.setTimeout(() => render(false), 180) : 0
    return () => {
      active = false
      gdEl.removeEventListener('pointerdown', onDown)
      gdEl.removeEventListener('click', domClick)
      window.clearTimeout(t1)
    }
  }, [data, layout, height])

  // 导出 PNG：文件名取图表标题（清理非法字符），2 倍分辨率
  const exportPng = async () => {
    const surface = surfaceRef.current
    if (!surface?.active) return
    let raw = ''
    const t = layout?.title
    if (typeof t === 'string') raw = t
    else if (t && typeof t === 'object' && typeof (t as { text?: unknown }).text === 'string') {
      raw = (t as { text: string }).text
    }
    const name =
      raw
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '') || 'signals-lab'
    try {
      setExporting(true)
      setExportError(false)
      await runPlotOperation(surface, () => Plotly.downloadImage(surface.node as never, { format: 'png', filename: name, scale: 2 }))
    } catch {
      if (surface.active) setExportError(true)
    } finally {
      if (surface.active) setExporting(false)
    }
  }

  return (
    <div className="plot-wrap" style={{ width: '100%', height, ...style }}>
      <div ref={ref} style={{ width: '100%', height: '100%' }} className={className} />
      <button type="button" className="plot-export" title={t('ui.exportPng')} aria-label={t('ui.exportPng')} disabled={exporting} onClick={() => void exportPng()}>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1v9m-3-3 3 3 3-3M2 11v3h12v-3" /></svg> PNG
      </button>
      {exportError && <span className="plot-export-error" role="alert">{t('ui.exportPngFail')}</span>}
    </div>
  )
}
