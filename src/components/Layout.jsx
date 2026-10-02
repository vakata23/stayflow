import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  DoorOpen,
  TrendingUp,
  ClipboardCheck,
  StickyNote,
  CalendarDays,
  BadgePercent,
  BookMarked,
  Inbox,
  MapPin,
  KeyRound,
  FileText,
  Building2,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Waves,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const dashboardNav = [
  { to: '/', label: 'Настанявания/Напускания', icon: DoorOpen },
  { to: '/earnings', label: 'Приходи', icon: TrendingUp },
  { to: '/cleaning-tasks', label: 'Камериерски задачи', icon: ClipboardCheck },
  { to: '/cleaning-notes', label: 'Забележки от почистване', icon: StickyNote },
  { to: '/calendar', label: 'Календар', icon: CalendarDays },
  { to: '/pricing', label: 'Ценови планове', icon: BadgePercent },
  { to: '/bookings', label: 'Резервации', icon: BookMarked },
  { to: '/booking-requests', label: 'Заявки', icon: Inbox },
  { to: '/guest-cards', label: 'Адресни карти', icon: MapPin },
  { to: '/access-codes', label: 'Кодове за достъп', icon: KeyRound },
  { to: '/invoicing', label: 'Издаване на фактура към гост', icon: FileText },
]

const settingsNav = [
  { to: '/properties', label: 'Поддръжка на имоти', icon: Building2 },
]

function NavSection({ title, items, onNavigate, badges }) {
  return (
    <div>
      <p className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map(({ to, label, icon: Icon }) => {
          const badge = badges?.[to]
          return (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 leading-tight">{label}</span>
                {badge > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">
                    {badge}
                  </span>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Sidebar({ onNavigate, badges }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">
          <Waves className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-base font-bold leading-none tracking-tight">StayFlow</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-slate-400">
            Property Management
          </p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        <NavSection title="Табло за управление" items={dashboardNav} onNavigate={onNavigate} badges={badges} />
        <NavSection title="Настройки" items={settingsNav} onNavigate={onNavigate} />
      </nav>
    </div>
  )
}

export default function Layout() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingRequests, setPendingRequests] = useState(0)
  const menuRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Презарежда се при всяка смяна на страница — лека заявка, пресен брой
  // след всяко приемане/отказ на заявка от собственика.
  useEffect(() => {
    supabase
      .from('booking_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingRequests(count ?? 0))
  }, [location.pathname])

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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <Sidebar badges={{ '/booking-requests': pendingRequests }} />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Затвори менюто"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} badges={{ '/booking-requests': pendingRequests }} />
          </aside>
        </div>
      )}

      {/* Top bar */}
      <header className="fixed left-0 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:left-64 lg:px-8">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Отвори менюто"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden lg:block" />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              {initials}
            </span>
            <span className="hidden max-w-40 truncate sm:block">{displayName}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Изход
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="pt-16 lg:pl-64">
        <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
