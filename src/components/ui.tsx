import { useEffect, useRef, useState, type ReactNode } from 'react'
import { decodeSnapshot, encodeSnapshot } from '../lib/snapshot'
import { useI18n } from '../i18n'

/** 左侧/通用卡片容器 */
export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{title}</span>
        {right}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  fmt,
  unit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  fmt?: (v: number) => string
  unit?: string
}) {
  return (
    <div className="slider-row">
      <span className="slider-label">
        {label} {unit ? <span className="slider-unit">{unit}</span> : null}
      </span>
      <input
        type="range"
        aria-label={unit ? `${label} (${unit})` : label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-value">{fmt ? fmt(value) : value.toFixed(2)}</span>
    </div>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  step = 0.5,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div className="num-field">
      <span className="num-label">{label}</span>
      <input
        type="number"
        aria-label={label}
        value={value}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (isFinite(v)) onChange(v)
        }}
      />
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono = true,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      type="text"
      className={mono ? 'text-input mono' : 'text-input'}
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function SegBtns<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} className={o.value === value ? 'seg-btn active' : 'seg-btn'} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Btn({
  children,
  onClick,
  active = false,
  tone = 'default',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  active?: boolean
  tone?: 'default' | 'accent' | 'ghost'
  title?: string
}) {
  return (
    <button className={`btn btn-${tone} ${active ? 'active' : ''}`} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      <span>{label}</span>
    </label>
  )
}

export function Badge({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'err'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="note">{children}</div>
}

/**
 * 视图配置（参数预设）JSON 导入/导出。
 * build() 返回当前视图的可序列化状态；apply(data) 接收已校验的数据对象。
 * 导出 = 下载 .json 文件并同时复制到剪贴板；导入 = 文件选择器（.json）。
 */
export function SnapshotIO({
  view,
  build,
  apply,
}: {
  view: string
  build: () => Record<string, unknown>
  apply: (data: Record<string, unknown>) => void
}) {
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const timerRef = useRef<number>(0)
  const { t } = useI18n()

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const show = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m)
    setTone(t)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setMsg(''), 2600)
  }

  const doExport = () => {
    try {
      const json = encodeSnapshot(view, build())
      // 尽力复制到剪贴板（非安全上下文/拒绝授权时静默跳过，文件下载不受影响）
      try {
        void navigator.clipboard?.writeText(json).catch(() => undefined)
      } catch {
        /* 忽略剪贴板错误 */
      }
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `signals-lab-${view}.json`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      show(t('ui.ioExported'))
    } catch {
      show(t('ui.ioExportFail'), 'err')
    }
  }

  const doImport = (file: File) => {
    file
      .text()
      .then((txt) => {
        const data = decodeSnapshot(txt, view)
        if (!data) {
          show(t('ui.ioImportFailFile'), 'err')
          return
        }
        try {
          apply(data)
          show(t('ui.ioImported'))
        } catch {
          show(t('ui.ioImportFail'), 'err')
        }
      })
      .catch(() => show(t('ui.ioReadFail'), 'err'))
  }

  return (
    <div className="snapshot-io">
      <div className="btn-row">
        <Btn onClick={doExport} title={t('ui.ioExportTitle')}>
          {t('ui.ioExport')}
        </Btn>
        <Btn onClick={() => fileRef.current?.click()} title={t('ui.ioImportTitle')}>
          {t('ui.ioImport')}
        </Btn>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) doImport(f)
          e.target.value = ''
        }}
      />
      <span role="status" className={`snapshot-msg snapshot-${tone}`}>{msg}</span>
    </div>
  )
}
