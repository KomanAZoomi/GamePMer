import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base.css'
import './styles/shell.css'
import './styles/home.css'
import './styles/gantt.css'
import './styles/schedule.css'
import './styles/feedback.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
