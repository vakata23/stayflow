import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Инсталирано приложение (PWA на телефона, Capacitor): там е собственикът, а не нов посетител. */
function isInstalledApp() {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      Boolean(window.Capacitor?.isNativePlatform?.())
    )
  } catch {
    return false
  }
}

/**
 * guest — по избор: какво да видят НЕвлезли посетители на „/“ (началната страница с демото).
 * На всички други адреси, както и в инсталираното приложение, невлезлият отива на вход.
 */
export default function ProtectedRoute({ children, guest = null }) {
  const location = useLocation()
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!session) {
    if (guest && location.pathname === '/' && !isInstalledApp()) return guest
    return <Navigate to="/login" replace />
  }

  return children
}
