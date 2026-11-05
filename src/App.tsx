import { useEffect, useState } from 'react'
import { ErrorBoundary } from './components/LabLayout'
import { useI18n } from './i18n'
import FourierLab from './views/FourierLab'
import LaplaceLab from './views/LaplaceLab'
import FourierAnimation from './views/FourierAnimation'
import SamplingLab from './views/SamplingLab'
import PropertiesLab from './views/PropertiesLab'
import ConvolutionLab from './views/ConvolutionLab'
import SystemLab from './views/SystemLab'

const TABS = [
  { id: 'fourier', key: 'fourier' },
  { id: 'laplace', key: 'laplace' },
  { id: 'anim', key: 'anim' },
  { id: 'sampling', key: 'sampling' },
  { id: 'props', key: 'props' },
  { id: 'conv', key: 'conv' },
  { id: 'sys', key: 'sys' },
] as const

type TabId = (typeof TABS)[number]['id']

function currentTab(): TabId {
  const h = window.location.hash.replace('#', '')
  return (TABS.find((t) => t.id === h)?.id ?? 'fourier') as TabId
}

export default function App() {
  const [tab, setTab] = useState<TabId>(currentTab)
  const { lang, setLang, t } = useI18n()

  useEffect(() => {
    const onHash = () => setTab(currentTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 数字键 1-7 快速切换模块（输入框/文本域聚焦或按修饰键时不劫持）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return
      }
      const idx = '1234567'.indexOf(e.key)
      if (idx >= 0 && idx < TABS.length) {
        const id = TABS[idx].id
        setTab(id)
        window.location.hash = id
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function select(id: TabId) {
    setTab(id)
    window.location.hash = id
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 30 30">
              <rect width="30" height="30" fill="#1c4a3e" />
              <line x1="0" y1="15" x2="30" y2="15" stroke="#c4b795" strokeWidth="1" />
              <polyline
                points="1,15 4,15 7,5 10,25 13,8 16,22 19,11 22,19 25,14 29,15"
                fill="none" stroke="#d4451f" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"
              />
            </svg>
          </span>
          <div className="brand-text">
            <div className="brand-name">{t('brand.name')}</div>
            <div className="brand-sub">{t('brand.sub')}</div>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((tabDef, i) => {
            const label = lang === 'zh' ? t(`tabs.${tabDef.key}.zh`) : t(`tabs.${tabDef.key}.en`)
            const sub = lang === 'zh' ? t(`tabs.${tabDef.key}.en`) : t(`tabs.${tabDef.key}.zh`)
            return (
              <button
                key={tabDef.id}
                className={tabDef.id === tab ? 'tab active' : 'tab'}
                onClick={() => select(tabDef.id)}
                title={t('brand.shortcut', { n: i + 1 })}
              >
                <span className="tab-label">{label}</span>
                <span className="tab-sub">{sub}</span>
              </button>
            )
          })}
        </nav>
        <div className="lang-switch" role="group" aria-label={t('brand.langTitle')}>
          <span className="lang-globe" aria-hidden="true">🌐</span>
          <button
            className={lang === 'zh' ? 'lang-btn active' : 'lang-btn'}
            onClick={() => setLang('zh')}
            title="中文"
            aria-pressed={lang === 'zh'}
          >
            中
          </button>
          <button
            className={lang === 'en' ? 'lang-btn active' : 'lang-btn'}
            onClick={() => setLang('en')}
            title="English"
            aria-pressed={lang === 'en'}
          >
            EN
          </button>
        </div>
      </header>
      <div className="lab">
        <ErrorBoundary key={tab}>
          {tab === 'fourier' && <FourierLab />}
          {tab === 'laplace' && <LaplaceLab />}
          {tab === 'anim' && <FourierAnimation />}
          {tab === 'sampling' && <SamplingLab />}
          {tab === 'props' && <PropertiesLab />}
          {tab === 'conv' && <ConvolutionLab />}
          {tab === 'sys' && <SystemLab />}
        </ErrorBoundary>
      </div>
    </div>
  )
}
