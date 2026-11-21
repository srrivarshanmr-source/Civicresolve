import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth'
import type { User, Auth } from 'firebase/auth'

const {
  VITE_FIREBASE_API_KEY: apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: authDomain,
  VITE_FIREBASE_PROJECT_ID: projectId,
} = import.meta.env

export const auth: Auth | null = apiKey && authDomain && projectId
  ? getAuth(initializeApp({ apiKey, authDomain, projectId }))
  : null

type AuthContextType = {
  user: User | null
  loading: boolean
  signing: boolean
  error: string
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: Boolean(auth),
  signing: false,
  error: '',
  signIn: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(auth))
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    const unsubscribe = onAuthStateChanged(auth, current => {
      setUser(current)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  async function signIn() {
    if (!auth) return
    setSigning(true)
    setError('')
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch {
      setError('signInFailed')
    } finally {
      setSigning(false)
    }
  }

  async function signOut() {
    if (!auth) return
    setError('')
    try {
      await fbSignOut(auth)
      setUser(null)
    } catch {
      setError('staffFailed')
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signing, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
