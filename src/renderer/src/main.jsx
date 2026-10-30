import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { browserApi } from './browserApi'

if (typeof window !== 'undefined' && !window.electronAPI) {
  window.electronAPI = browserApi
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
