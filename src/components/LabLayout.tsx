import { Component, type ReactNode } from 'react'
import { useI18n } from '../i18n'

/** 工作台三区布局：左侧控制 / 中央图表 / 底部解释 */
export function LabLayout({ aside, main, explanation }: { aside: ReactNode; main: ReactNode; explanation: ReactNode }) {
  return (
    <>
      <aside className="side">{aside}</aside>
      <section className="main">{main}</section>
      <section className="explanation-wrap">{explanation}</section>
    </>
  )
}

type EBState = { error: Error | null }

function ErrorFallback({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="error-boundary">
      <h3>{t('ui.ebTitle')}</h3>
      <pre>{message}</pre>
      <button className="btn btn-accent" onClick={onRetry}>
        {t('ui.retry')}
      </button>
    </div>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null }

  static getDerivedStateFromError(error: Error): EBState {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[SignalsLab] render error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          message={String(this.state.error?.message ?? this.state.error)}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}
