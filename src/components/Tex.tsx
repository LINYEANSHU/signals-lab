import katex from 'katex'
import type { ReactNode } from 'react'

export function Tex({ tex, block = false }: { tex: string; block?: boolean }) {
  let html = ''
  try {
    html = katex.renderToString(tex, { throwOnError: false, displayMode: block, output: 'html' })
  } catch {
    html = tex
  }
  return <span className={block ? 'tex-block' : 'tex-inline'} dangerouslySetInnerHTML={{ __html: html }} />
}

/** 底部解释区：三段式布局 */
export function Explanation({ children }: { children: ReactNode }) {
  return <div className="explanation">{children}</div>
}

export function ExpSection({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`exp-sec ${className}`}>
      <div className="exp-title">{title}</div>
      <div className="exp-body">{children}</div>
    </div>
  )
}

export function KV({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className={`kv ${tone ?? ''}`}>
      <span className="kv-k">{k}</span>
      <span className="kv-v">{v}</span>
    </div>
  )
}
