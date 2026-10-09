import { Suspense, useState, useEffect } from 'react'
import { NavLink, Link, Outlet, useNavigate, useLocation, useNavigationType } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  ClipboardCheck,
  StickyNote,
  CalendarDays,
  BadgePercent,
  BookMarked,
  Inbox,
  Bell,
  MapPin,
  KeyRound,
  FileText,
  Building2,
  ScrollText,
  LogOut,
  Waves,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal, PageSkeleton } from './ui'
import BottomNav from './BottomNav'

/* Пет места в долната лента на телефон; всичко останало е в листа „Още“. */
const tabs = [
  { key: 'dashboard', to: '/', label: 'Табло', icon: LayoutDashboard, match: (p) => p === '/' },
  { key: 'calendar', to: '/calendar', label: 'Календар', icon: CalendarDays, match: (p) => p.startsWith('/calendar') },
  { key: 'bookings', to: '/bookings', label: 'Резервации', icon: BookMarked, match: (p) => p.startsWith('/bookings') },
  { key: 'earnings', to: '/earnings', label: 'Приходи', icon: TrendingUp, match: (p) => p.startsWith('/earnings') && !p.startsWith('/earnings/rules') },
]
const activeTabKey = (path) => tabs.find((t) => t.match(path))?.key ?? 'more'

/* Странична лента (голям екран) и лист „Още“ ползват едни и същи места. */
const requests = { to: '/booking-requests', label: 'Заявки', icon: Inbox }
const manageNav = [
  { to: '/', label: 'Табло', icon: LayoutDashboard },
  { to: '/calendar', label: 'Календар', icon: CalendarDays },
  { to: '/bookings', label: 'Резервации', icon: BookMarked },
  requests,
  { to: '/earnings', label: 'Приходи', icon: TrendingUp },
]
const workNav = [
  { to: '/cleaning-tasks', label: 'Камериерски задачи', icon: ClipboardCheck },
  { to: '/cleaning-notes', label: 'Бележки от почистване', icon: StickyNote },
  { to: '/pricing', label: 'Ценови планове', icon: BadgePercent },
  { to: '/guest-cards', label: 'Адресни карти', icon: MapPin },
  { to: '/access-codes', label: 'Кодове за достъп', icon: KeyRound },
  { to: '/invoicing', label: 'Фактури към гост', icon: FileText },
]
const settingsNav = [
  { to: '/properties', label: 'Имоти', icon: Building2 },
  { to: '/notifications', label: 'Известия', icon: Bell },
  { to: '/earnings/rules', label: 'Правила', icon: ScrollText },
]
/* Листът „Още“ на телефон: първо най-честото, после работните инструменти */
const moreOften = [requests, settingsNav[0], settingsNav[1], settingsNav[2]]

const exactPaths = new Set(['/', '/earnings'])

function NavGroup({ title, items, onNavigate, badges }) {
  return (
    <div>
      <p className="px-3.5 pb-1.5 pt-5 font-display text-[0.9375rem] font-medium italic text-ink-muted">{title}</p>
      <ul className="space-y-0.5">
        {items.map(({ to, label, icon: Icon }) => {
          const badge = badges?.[to]
          return (
            <li key={to}>
              <NavLink
                to={to}
                end={exactPaths.has(to)}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group flex min-h-11 items-center gap-3 rounded-[0.8125rem] px-3.5 text-[0.9375rem] transition-colors [@media(hover:hover)_and_(pointer:fine)]:min-h-10 ${
                    isActive ? 'bg-accent-soft font-semibold text-accent-ink' : 'font-medium text-ink-soft hover:bg-sunken hover:text-ink'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`h-[1.125rem] w-[1.125rem] shrink-0 ${isActive ? 'text-accent' : 'text-ink-muted'}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {badge > 0 && (
                      <span className="grid h-[1.375rem] min-w-[1.375rem] place-items-center rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent">
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Brand({ className = '' }) {
  return (
    <Link to="/" className={`flex items-center gap-3 ${className}`} aria-label="StayFlow — към таблото">
      <span className="grid h-10 w-10 place-items-center rounded-[0.8125rem] bg-accent text-on-accent shadow-accent">
        <Waves className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="font-display text-2xl font-bold tracking-tight text-ink">StayFlow</span>
    </Link>
  )
}

function Avatar({ initials, className = '' }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-ink ${className}`} aria-hidden="true">
      {initials}
    </span>
  )
}

export default function Layout() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  const [moreOpen, setMoreOpen] = useState(false)
  const [pendingRequests, setPendingRequests] = useState(0)

  // Презарежда се при всяка смяна на страница — лека заявка, пресен брой
  // след всяко приемане/отказ на заявка от собственика.
  useEffect(() => {
    supabase
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingRequests(count ?? 0))
  }, [location.pathname])

  // Листът се затваря при всяка смяна на страница; новият екран започва отгоре
  // (при „назад“ на браузъра скролът не се пипа).
  useEffect(() => {
    setMoreOpen(false)
    if (navType !== 'POP') window.scrollTo(0, 0)
  }, [location.pathname, navType])

  const displayName = profile?.full_name?.trim() || user?.email || ''
  const initials = (profile?.full_name?.trim() || user?.email || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const badges = { [requests.to]: pendingRequests }

  return (
    <div className="min-h-dvh bg-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-card"
      >
        Към съдържанието
      </a>

      {/* Голям екран: светла странична лента в крем */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17.25rem] flex-col border-r border-line bg-surface px-5 pb-5 pt-8 lg:flex">
        <Brand className="px-3 pb-3" />
        <nav aria-label="Основно меню" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <NavGroup title="Управление" items={manageNav} badges={badges} />
          <NavGroup title="Работа" items={workNav} />
          <NavGroup title="Настройки" items={settingsNav} />
        </nav>
        <div className="mt-3 flex items-center gap-3 border-t border-line px-3 pt-4">
          <Avatar initials={initials} className="h-10 w-10 text-[0.9375rem]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-semibold leading-tight">{displayName}</p>
            {user?.email && displayName !== user.email && <p className="truncate text-[0.8125rem] leading-tight text-ink-muted">{user.email}</p>}
          </div>
          <button type="button" onClick={handleSignOut} className="icon-btn shrink-0" aria-label="Изход" title="Изход">
            <LogOut className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
          </button>
        </div>
      </aside>

      {/* Телефон: кратка марка горе; навигацията е плаващата лента долу */}
      <header className="flex h-14 items-center px-4 sm:px-6 lg:hidden">
        <Brand />
      </header>

      <main id="main" tabIndex={-1} className="outline-none lg:pl-[17.25rem]">
        <div className="mx-auto max-w-[72rem] px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 lg:px-12 lg:pb-20 lg:pt-12">
          {/* Екраните се зареждат при нужда; докато идват, лентата и менюто остават, а на мястото на екрана има скелет */}
          <Suspense fallback={<PageSkeleton />}>
            <div key={location.pathname} className="page-in">
              <Outlet />
            </div>
          </Suspense>
        </div>
      </main>

      <div className="lg:hidden">
        <BottomNav tabs={tabs} activeKey={activeTabKey(location.pathname)} pending={pendingRequests} moreOpen={moreOpen} onMore={() => setMoreOpen(true)} />
      </div>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Още" variant="sheet">
        <nav aria-label="Още" className="-mx-1">
          <MoreList items={moreOften} badges={badges} />
          <p className="px-2 pb-2 pt-4 font-display text-[0.9375rem] font-medium italic text-ink-muted">Работа</p>
          <MoreList items={workNav} grid />
        </nav>
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
          <Avatar initials={initials} className="h-11 w-11 text-[0.9375rem]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-semibold leading-tight">{displayName}</p>
            {user?.email && displayName !== user.email && <p className="truncate text-[0.8125rem] leading-tight text-ink-muted">{user.email}</p>}
          </div>
          <button type="button" onClick={handleSignOut} className="btn btn-secondary">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Изход
          </button>
        </div>
      </Modal>
    </div>
  )
}

function MoreList({ items, badges, grid }) {
  return (
    <ul className={grid ? 'grid grid-cols-2 gap-1' : undefined}>
      {items.map(({ to, label, icon: Icon }) => {
        const badge = badges?.[to]
        return (
          <li key={to}>
            <Link
              to={to}
              className={`flex items-center gap-3 rounded-2xl px-2 font-medium text-ink transition-colors active:bg-sunken ${grid ? 'min-h-[3.75rem] text-[0.9375rem] leading-tight' : 'min-h-14 gap-3.5 text-base'}`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className={`min-w-0 flex-1 ${grid ? '' : 'truncate'}`}>{label}</span>
              {badge > 0 && (
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent px-2 text-xs font-bold text-on-accent" aria-label={`чакащи: ${badge}`}>
                  {badge}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
