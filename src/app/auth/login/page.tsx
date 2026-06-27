'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NappsterLogo } from '@/components/nappster-logo'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
      <NappsterLogo size={100} />

      <div className="mt-6 w-full max-w-xs rounded-[24px] bg-white p-6 shadow-[var(--shadow-md)]">
        <h1 className="text-center text-2xl font-black text-[var(--text)]">Welcome back</h1>
        <p className="mt-1 text-center text-sm font-bold text-[var(--text-secondary)]">
          Sign in to track your baby&apos;s sleep
        </p>

        <form onSubmit={handleLogin} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-[var(--rose-bg)] px-3 py-2.5 text-sm font-bold text-[var(--rose)]">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.4px] text-[var(--text-secondary)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border-2 border-[#EEE] px-4 py-3 text-sm font-bold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.4px] text-[var(--text-secondary)]">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border-2 border-[#EEE] px-4 py-3 text-sm font-bold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(124,77,255,0.25)] transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="mt-5 text-sm font-bold text-[var(--text-secondary)]">
        Don&apos;t have an account?{' '}
        <Link href="/auth/signup" className="text-[var(--lavender)] hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  )
}
