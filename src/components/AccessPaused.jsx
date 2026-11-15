import { Link } from 'react-router-dom'
import { LogOut, MessageCircle, Phone } from 'lucide-react'
import AuthLayout from './AuthLayout'
import { useAuth } from '../context/AuthContext'
import { viberUrl, telUrl, contactPhone } from '../lib/contact'

const TEXT = {
  pending: {
    title: 'Профилът ви чака активиране',
    body: 'Достъпът до StayFlow се отваря ръчно. Щом го активираме, приложението се отключва само — не е нужно да правите нищо повече.',
  },
  expired: {
    title: 'Достъпът ви е на пауза',
    body: 'Срокът на достъпа е изтекъл. Данните и резервациите ви са запазени — щом го подновим, всичко е на мястото си.',
  },
  suspended: {
    title: 'Достъпът ви е спрян',
    body: 'Данните и резервациите ви са запазени. Свържете се с нас и ще го възстановим.',
  },
}

/** Екранът, който вижда собственик без активен достъп: спокойно обяснение + как да се свърже с нас. */
export default function AccessPaused({ state }) {
  const { signOut, user } = useAuth()
  const t = TEXT[state] ?? TEXT.pending
  return (
    <AuthLayout title={t.title} subtitle={user?.email}>
      <p className="text-ink-soft">{t.body}</p>

      <div className="mt-6 grid gap-3">
        {viberUrl && (
          <a href={viberUrl} className="btn btn-lg btn-block">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            Пишете ни във Viber
          </a>
        )}
        {telUrl && (
          <a href={telUrl} className="btn btn-secondary btn-lg btn-block">
            <Phone className="h-5 w-5" aria-hidden="true" />
            {contactPhone}
          </a>
        )}
        {state === 'pending' && (
          <p className="text-center text-sm text-ink-soft">
            Още не сте заявили достъп?{' '}
            <Link to="/access" className="font-semibold text-accent-ink underline">
              Заявете го тук
            </Link>
          </p>
        )}
        <button type="button" onClick={signOut} className="mx-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Изход
        </button>
      </div>
    </AuthLayout>
  )
}
