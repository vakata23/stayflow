import { Globe, ChevronDown } from 'lucide-react'
import { LANGUAGES, useStayLang } from './i18n'

/**
 * Избор на език за госта. Истинският <select> лежи невидим върху чипа: пръстът и клавиатурата
 * ползват родното меню на устройството (достъпно и познато), а чипът показва избрания език.
 */
export default function LangSwitch() {
  const { lang, setLang, t } = useStayLang()
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]
  return (
    <label className="stay-chip stay-lang">
      <Globe className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      <span aria-hidden="true">{current.name}</span>
      <ChevronDown className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('language')}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.html}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  )
}
