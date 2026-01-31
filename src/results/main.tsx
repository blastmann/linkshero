import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '../shared/theme.css'
import './App.css'

import { I18nProvider } from '../shared/i18n-provider'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
)

