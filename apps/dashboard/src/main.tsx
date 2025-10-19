import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { configureMuiLicense } from './utils/muiLicense'

// Configure MUI Pro license
configureMuiLicense()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)