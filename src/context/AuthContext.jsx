import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { accessState } from '../lib/accessLogic'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)
  // Платен достъп (миграция 016). `accessFor` е потребителят, за когото е известно състоянието: докато не съвпада със
  // сесията, достъпът се смята за „още се зарежда“ (иначе за миг се показва приложението и на клиент на пауза).
  // При липсваща функция/грешка — „активен“: по-добре отворено, отколкото заключен платен клиент, докато миграцията не е пусната.
  const [access, setAccess] = useState(null)
  const [accessFor, setAccessFor] = useState(null)
  const accessLoading = !!session?.user && accessFor !== session.user.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setProfileLoading(false)
      return
    }

    let cancelled = false
    setProfileLoading(true)

    supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setProfile(data)
        setProfileLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  const loadAccess = async (userId = session?.user?.id) => {
    if (!userId) return
    const { data, error } = await supabase.rpc('my_access')
    const row = !error && Array.isArray(data) ? data[0] : null
    setAccess({ ...accessState(row), plan: row?.plan ?? null, activeUntil: row?.active_until ?? null, isAdmin: !!row?.is_admin, known: !!row })
    setAccessFor(userId)
  }

  useEffect(() => {
    if (!session?.user) {
      setAccess(null)
      setAccessFor(null)
      return
    }
    loadAccess(session.user.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  /** Записва името/фирмата/телефона на собственика и обновява профила в паметта. Връща { error }. */
  const updateProfile = async (values) => {
    if (!profile?.id) return { error: new Error('Профилът не е зареден.') }
    const { data, error } = await supabase.from('profiles').update(values).eq('id', profile.id).select().maybeSingle()
    if (error) return { error }
    setProfile(data ?? { ...profile, ...values })
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        profileLoading,
        access,
        accessLoading,
        refreshAccess: loadAccess,
        signOut,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth трябва да се използва вътре в AuthProvider')
  return ctx
}
