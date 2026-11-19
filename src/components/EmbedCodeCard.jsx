import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { Card, Button, Alert, Textarea } from './ui'
import { appOrigin } from '../lib/appUrl'

/** Кодът, който се слага в чужд сайт: рамка със страницата за резервации и (по желание) скрипт, който нагласява височината. */
export function embedSnippet(origin, slug, withResize = true) {
  const src = `${origin}/embed/${slug}`
  const frame = `<iframe src="${src}" title="Reservations" width="100%" height="760" style="border:0;max-width:100%" loading="lazy"></iframe>`
  const script = `<script>window.addEventListener('message',function(e){if(e.data&&e.data.type==='stayflow-height'){var f=document.querySelector('iframe[src^="${src}"]');if(f)f.style.height=e.data.height+'px'}})</script>`
  return withResize ? `${frame}\n${script}` : frame
}

/**
 * „Вградете в сайта си“ — календарът с наличност, цената и заявката на имота в рамка за собствен сайт или блог.
 * Показва се само за публикуван имот. Резервациите идват като заявки, без комисиона.
 */
export default function EmbedCodeCard({ property }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  if (!property.is_listed || !property.slug) return null

  const origin = appOrigin()
  const code = embedSnippet(origin, property.slug)
  const link = `${origin}/embed/${property.slug}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Не успях да копирам. Маркирайте кода ръчно.')
    }
  }

  return (
    <Card className="p-6">
      <h2 className="type-heading">Вградете в сайта си</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Поставете този код там, където искате да се появи календарът. Гостът избира дати, вижда цената и ви праща заявка — без комисиона.
      </p>
      <div className="mt-4 space-y-3">
        {error && <Alert>{error}</Alert>}
        <label className="block">
          <span className="sr-only">Код за вграждане</span>
          <Textarea readOnly rows={5} value={code} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={copy}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? 'Копирано' : 'Копирай кода'}
          </Button>
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Отвори и виж как изглежда
          </a>
        </div>
        <p className="text-xs text-ink-muted">Езикът се избира по браузъра на госта. За фиксиран език добавете ?lang=el (или en, mk, sr, ro) в края на адреса. Скриптът по желание нагласява височината на рамката.</p>
      </div>
    </Card>
  )
}
