import { Globe } from 'lucide-react'
import { APP_LANGUAGES, useAppLang } from './appLang'

/**
 * Избор на език на приложението (български / гръцки / македонски). Имената на езиците са на самите езици
 * и не се превеждат (translate="no"). Смяната е мигновена — речникът се зарежда веднъж и всичко се превежда на място.
 */
export default function AppLangSwitch({ className = '' }) {
  const { lang, setLang } = useAppLang()
  return (
    <label className={`flex items-center gap-2.5 text-ink-muted ${className}`}>
      <Globe className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
      <select
        aria-label="Език"
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="control h-10 min-w-0 flex-1 py-0 text-[0.9375rem]"
      >
        {APP_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.html} translate="no">
            {l.name}
          </option>
        ))}
      </select>
    </label>
  )
}
