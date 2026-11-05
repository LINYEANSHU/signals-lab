import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/700.css'
import '@fontsource/noto-sans-sc/900.css'
import '@fontsource/archivo-black/400.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import 'katex/dist/katex.min.css'
import './styles.css'
import App from './App'
import { I18nProvider } from './i18n'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
)

// 开发模式下运行数学自检（浏览器控制台查看）
if (import.meta.env.DEV) {
  import('./lib/devtests').then((m) => m.runDevTests())
}
