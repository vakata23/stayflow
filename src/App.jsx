import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ConfigNotice from './components/ConfigNotice'
import Layout from './components/Layout'

// Auth страниците остават eager — малки са и трябват веднага при първо зареждане.
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import ResetPassword from './pages/auth/ResetPassword'
import UpdatePassword from './pages/auth/UpdatePassword'

// Останалите модули се зареждат при нужда (route-based code splitting).
const Dashboard = lazy(() => import('./pages/Dashboard'))
const PropertiesList = lazy(() => import('./pages/properties/PropertiesList'))
const PropertyNew = lazy(() => import('./pages/properties/PropertyNew'))
const PropertyDetail = lazy(() => import('./pages/properties/PropertyDetail'))
const ListingSetup = lazy(() => import('./pages/properties/ListingSetup'))
const ListingPreview = lazy(() => import('./pages/stay/ListingPreview'))
const AccessCodes = lazy(() => import('./pages/AccessCodes'))
const Calendar = lazy(() => import('./pages/Calendar'))
const BookingsList = lazy(() => import('./pages/bookings/BookingsList'))
const CleaningTasks = lazy(() => import('./pages/cleaning/CleaningTasks'))
const CleaningNotes = lazy(() => import('./pages/cleaning/CleaningNotes'))
const Pricing = lazy(() => import('./pages/pricing/Pricing'))
const GuestCards = lazy(() => import('./pages/GuestCards'))
const GuestCard = lazy(() => import('./pages/guest/GuestCard'))
const Invoicing = lazy(() => import('./pages/invoicing/Invoicing'))
const Earnings = lazy(() => import('./pages/earnings/Earnings'))
const BookingRequests = lazy(() => import('./pages/BookingRequests'))
const Notifications = lazy(() => import('./pages/Notifications'))
const PublicStay = lazy(() => import('./pages/stay/PublicStay'))

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigNotice />

  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />

            {/* Публична гост карта — без login */}
            <Route path="/guest/:id" element={<GuestCard />} />

            {/* Публична страница за резервации — без login */}
            <Route path="/stay/:slug" element={<PublicStay />} />

            {/* „Преглед като гост“ на собственика — без менюто, но само за логнат */}
            <Route
              path="/properties/:id/preview"
              element={
                <ProtectedRoute>
                  <ListingPreview />
                </ProtectedRoute>
              }
            />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="/cleaning-tasks" element={<CleaningTasks />} />
              <Route path="/cleaning-notes" element={<CleaningNotes />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/bookings" element={<BookingsList />} />
              <Route path="/guest-cards" element={<GuestCards />} />
              <Route path="/access-codes" element={<AccessCodes />} />
              <Route path="/invoicing" element={<Invoicing />} />
              <Route path="/earnings" element={<Earnings />} />
              <Route path="/booking-requests" element={<BookingRequests />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/properties" element={<PropertiesList />} />
              <Route path="/properties/new" element={<PropertyNew />} />
              <Route path="/properties/:id" element={<PropertyDetail />} />
              <Route path="/properties/:id/setup" element={<ListingSetup />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <p className="mt-3 text-lg font-semibold text-slate-800">Страницата не е намерена</p>
      <a href="/" className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700">
        ← Към таблото
      </a>
    </div>
  )
}
