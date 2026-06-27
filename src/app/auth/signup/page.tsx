'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setMessage('Check your email for the confirmation link!')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
      <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] text-4xl shadow-[0_8px_24px_rgba(124,77,255,0.3)]">
        🌙
      </div>

      <div className="mt-6 w-full max-w-xs rounded-[24px] bg-white p-6 shadow-[var(--shadow-md)]">
        <h1 className="text-center text-2xl font-black text-[var(--text)]">Create account</h1>
        <p className="mt-1 text-center text-sm font-bold text-[var(--text-secondary)]">
          Start tracking your baby&apos;s sleep
        </p>

        <form onSubmit={handleSignup} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-[var(--rose-bg)] px-3 py-2.5 text-sm font-bold text-[var(--rose)]">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-xl bg-[var(--mint-bg)] px-3 py-2.5 text-sm font-bold text-[var(--mint)]">
              {message}
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
              minLength={6}
              className="w-full rounded-xl border-2 border-[#EEE] px-4 py-3 text-sm font-bold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.4px] text-[var(--text-secondary)]">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border-2 border-[#EEE] px-4 py-3 text-sm font-bold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(124,77,255,0.25)] transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>
      </div>

      <p className="mt-5 text-sm font-bold text-[var(--text-secondary)]">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-[var(--lavender)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
