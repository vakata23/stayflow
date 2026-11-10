import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { startDomTranslation } from './i18n/domTranslator'
import { setupPwa } from './pwa'

// Речникът за гръцки/македонски (ако е избран) се чака преди първото изобразяване — без миг на български.
// При грешка (напр. няма мрежа за речника) приложението тръгва на български.
startDomTranslation()
  .catch(() => {})
  .finally(() => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })

// Service worker: регистрация и проверка за нова версия след пълното зареждане
if (document.readyState === 'complete') setupPwa()
else window.addEventListener('load', setupPwa, { once: true })
