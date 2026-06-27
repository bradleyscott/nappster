'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createBaby } from '@/lib/services/babies'
import { createFamilyMember } from '@/lib/services/family-members'

type Step = 'choice' | 'create' | 'join'

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('choice')
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [patternNotes, setPatternNotes] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustTextareaHeight = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    adjustTextareaHeight()
  }, [patternNotes])

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in')
      setLoading(false)
      return
    }

    const babyId = crypto.randomUUID()

    const { error: babyError } = await createBaby(supabase, {
      id: babyId,
      name,
      birth_date: birthDate,
      pattern_notes: patternNotes || null,
    })

    if (babyError) {
      setError(babyError.message)
      setLoading(false)
      return
    }

    const { error: linkError } = await createFamilyMember(supabase, {
      user_id: user.id,
      baby_id: babyId,
      role: 'parent',
    })

    if (linkError) {
      setError(linkError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/invite/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to redeem invite code')
        setLoading(false)
        return
      }

      router.push('/')
      router.refresh()
    } catch {
      setError('Failed to redeem invite code')
      setLoading(false)
    }
  }

  const handleBack = () => {
    setStep('choice')
    setError(null)
  }

  if (step === 'choice') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] text-4xl shadow-[0_8px_24px_rgba(124,77,255,0.3)]">
          🌙
        </div>
        <h1 className="mt-6 text-2xl font-black text-[var(--text)]">Welcome to Nappster</h1>
        <p className="mt-1 text-center text-sm font-bold text-[var(--text-secondary)]">
          How would you like to get started?
        </p>

        <div className="mt-6 w-full max-w-xs space-y-3">
          <button
            onClick={() => setStep('create')}
            className="flex w-full items-center gap-4 rounded-2xl border-2 border-[var(--lavender-light)] bg-white p-4 text-left shadow-[var(--shadow-sm)] transition-colors active:bg-[var(--lavender-bg)]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--lavender-bg)] text-2xl">
              👶
            </span>
            <div>
              <div className="text-sm font-extrabold text-[var(--text)]">Add a new baby</div>
              <div className="text-xs font-bold text-[var(--text-secondary)]">Set up a new profile</div>
            </div>
          </button>

          <button
            onClick={() => setStep('join')}
            className="flex w-full items-center gap-4 rounded-2xl border-2 border-[var(--lavender-light)] bg-white p-4 text-left shadow-[var(--shadow-sm)] transition-colors active:bg-[var(--lavender-bg)]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--peach-bg)] text-2xl">
              👨‍👩‍👧
            </span>
            <div>
              <div className="text-sm font-extrabold text-[var(--text)]">I am family</div>
              <div className="text-xs font-bold text-[var(--text-secondary)]">Enter an invite code</div>
            </div>
          </button>
        </div>
      </div>
    )
  }

  if (step === 'join') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
        <button
          onClick={handleBack}
          className="mb-4 flex items-center gap-1 text-sm font-extrabold text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
        >
          ← Back
        </button>

        <div className="w-full max-w-xs rounded-[24px] bg-white p-6 shadow-[var(--shadow-md)]">
          <h1 className="text-center text-2xl font-black text-[var(--text)]">I&apos;m family</h1>
          <p className="mt-1 text-center text-sm font-bold text-[var(--text-secondary)]">
            Enter the 6-digit invite code from your partner
          </p>

          <form onSubmit={handleJoinSubmit} className="mt-5 space-y-4">
            {error && (
              <div className="rounded-xl bg-[var(--rose-bg)] px-3 py-2.5 text-sm font-bold text-[var(--rose)]">
                {error}
              </div>
            )}

            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              className="w-full rounded-xl border-2 border-[#EEE] px-4 py-4 text-center font-mono text-2xl font-bold tracking-[0.5em] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
            />

            <button
              type="submit"
              disabled={loading || inviteCode.length !== 6}
              className="w-full rounded-2xl bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(124,77,255,0.25)] transition-all active:scale-[0.97] disabled:opacity-60"
            >
              {loading ? 'Joining...' : 'Join'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // step === 'create'
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
      <button
        onClick={handleBack}
        className="mb-4 flex items-center gap-1 text-sm font-extrabold text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
      >
        ← Back
      </button>

      <div className="w-full max-w-xs rounded-[24px] bg-white p-6 shadow-[var(--shadow-md)]">
        <h1 className="text-center text-2xl font-black text-[var(--text)]">Set up profile</h1>
        <p className="mt-1 text-center text-sm font-bold text-[var(--text-secondary)]">
          This helps us give personalized sleep recommendations
        </p>

        <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-[var(--rose-bg)] px-3 py-2.5 text-sm font-bold text-[var(--rose)]">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.4px] text-[var(--text-secondary)]">
              Baby&apos;s name
            </label>
            <input
              id="name"
              type="text"
              placeholder="Luna"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-xl border-2 border-[#EEE] px-4 py-3 text-sm font-bold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.4px] text-[var(--text-secondary)]">
              Birth date
            </label>
            <input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              className="w-full rounded-xl border-2 border-[#EEE] px-4 py-3 text-sm font-bold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.4px] text-[var(--text-secondary)]">
              Known patterns (optional)
            </label>
            <textarea
              ref={textareaRef}
              id="patternNotes"
              rows={1}
              placeholder="e.g., 30-minute naps are normal, doesn't do well with early bedtime"
              value={patternNotes}
              onChange={(e) => setPatternNotes(e.target.value)}
              className="min-h-[80px] w-full resize-none overflow-hidden rounded-xl border-2 border-[#EEE] px-4 py-3 text-sm font-semibold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
            />
            <p className="mt-1.5 text-xs font-semibold text-[var(--text-muted)] leading-tight">
              Include any patterns the AI should know about
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(124,77,255,0.25)] transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {loading ? 'Setting up...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
