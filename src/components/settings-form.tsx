'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Baby, type FamilyMember } from '@/types/database'
import { updateBaby } from '@/lib/services/babies'

interface SettingsFormProps {
  baby: Baby
  familyMembers: FamilyMember[]
}

export function SettingsForm({ baby, familyMembers }: SettingsFormProps) {
  const [name, setName] = useState(baby.name)
  const [birthDate, setBirthDate] = useState(baby.birth_date)
  const [patternNotes, setPatternNotes] = useState(baby.pattern_notes || '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isNavigatingBack, setIsNavigatingBack] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: updateError } = await updateBaby(supabase, baby.id, {
      name,
      birth_date: birthDate,
      pattern_notes: patternNotes || null,
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsNavigatingBack(true)
    router.push('/')
  }

  const handleGenerateCode = async () => {
    setInviteLoading(true)
    setInviteError(null)

    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ babyId: baby.id }),
      })

      const data = await res.json()

      if (res.ok) {
        setInviteCode(data.code)
      } else {
        setInviteError(data.error || 'Failed to generate invite code')
      }
    } catch {
      setInviteError('Failed to generate invite code')
    }

    setInviteLoading(false)
  }

  const handleCopyCode = async () => {
    if (!inviteCode) return
    await navigator.clipboard.writeText(inviteCode)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

  return (
    <div className="min-h-dvh bg-[var(--bg)] pb-6">
      {/* Page header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={handleBackClick}
          disabled={isNavigatingBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#EEE] bg-white active:scale-90 transition-transform"
        >
          {isNavigatingBack ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--lavender)] border-t-transparent" />
          ) : (
            <span>←</span>
          )}
        </button>
        <div className="text-lg font-extrabold text-[var(--text)]">Profile &amp; Family</div>
      </div>

      <div className="mx-auto max-w-md px-4">
        {/* ===== PROFILE CARD ===== */}
        <div className="mb-4 rounded-[var(--radius-lg)] bg-white px-5 pb-5 pt-6 shadow-[var(--shadow-sm)]">
          {/* Avatar */}
          <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-[var(--peach)] bg-gradient-to-br from-[var(--peach-light)] to-[var(--peach-bg)] text-3xl">
            👶
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-[var(--rose-bg)] px-4 py-3 text-sm font-bold text-[var(--rose)]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div className="mb-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
                👤 Baby&apos;s name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border-2 border-[#EEE] px-4 py-3.5 text-sm font-bold text-[var(--text)] outline-none transition-colors focus:border-[var(--lavender)]"
                placeholder="Luna"
              />
            </div>

            {/* Birth date */}
            <div className="mb-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
                🎂 Birth date
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
                className="w-full rounded-xl border-2 border-[#EEE] px-4 py-3.5 text-sm font-bold text-[var(--text)] outline-none transition-colors focus:border-[var(--lavender)]"
              />
            </div>

            {/* Pattern notes */}
            <div className="mb-5">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
                📝 Known patterns
              </label>
              <textarea
                value={patternNotes}
                onChange={(e) => setPatternNotes(e.target.value)}
                placeholder="e.g., 30-minute naps are normal, doesn't do well with early bedtime"
                rows={3}
                className="w-full resize-none rounded-xl border-2 border-[#EEE] px-4 py-3.5 text-sm font-semibold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
              />
              <p className="mt-1.5 text-xs font-semibold text-[var(--text-muted)] leading-tight">
                The AI coach uses these notes for personalised recommendations
              </p>
            </div>

            {/* Save button */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full rounded-2xl bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] py-4 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(124,77,255,0.25)] transition-all active:scale-[0.97]',
                loading && 'opacity-70'
              )}
            >
              {loading ? '💾 Saving...' : '💾 Save Changes'}
            </button>
          </form>
        </div>

        {/* ===== FAMILY CARD ===== */}
        <div className="mb-4 rounded-[var(--radius-lg)] border-[1.5px] border-[var(--lavender-light)] bg-gradient-to-br from-white to-[var(--lavender-bg)] px-5 pb-5 pt-4 shadow-[var(--shadow-sm)]">
          {/* Header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lavender-bg)] text-xl">
              👨‍👩‍👧‍👧
            </div>
            <div>
              <div className="text-base font-extrabold text-[var(--text)]">Family</div>
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Caregivers who help track {baby.name}&apos;s sleep
              </div>
            </div>
          </div>

          {/* Current members */}
          <div className="mb-4 flex flex-col gap-2">
            {familyMembers.length === 0 && (
              <div className="rounded-xl bg-white/70 px-4 py-3 text-center text-sm font-semibold text-[var(--text-muted)]">
                No family members yet
              </div>
            )}
            {familyMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender-bg)] text-sm font-extrabold text-[var(--lavender)]">
                  {member.role === 'parent' ? '👤' : '👤'}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-[var(--text)]">
                    {member.role === 'parent' ? 'You' : 'Caregiver'}
                  </div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                    {member.role}
                  </div>
                </div>
                <span className="rounded-md bg-[var(--mint-bg)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--mint)]">
                  {member.role === 'parent' ? 'You' : 'Connected'}
                </span>
              </div>
            ))}
          </div>

          <div className="mb-4 h-px bg-gradient-to-r from-[var(--lavender-light)] to-transparent" />

          {/* Invite section */}
          <div className="text-center">
            <div className="mb-3 flex items-center justify-center gap-1.5 text-sm font-bold text-[var(--text)]">
              🤝 Invite a caregiver
            </div>

            {inviteError && (
              <div className="mb-3 rounded-xl bg-[var(--rose-bg)] px-4 py-2.5 text-xs font-bold text-[var(--rose)]">
                {inviteError}
              </div>
            )}

            {!inviteCode ? (
              <>
                <button
                  onClick={handleGenerateCode}
                  disabled={inviteLoading}
                  className={cn(
                    'w-full rounded-2xl bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(124,77,255,0.2)] transition-all active:scale-[0.97]',
                    inviteLoading && 'opacity-70'
                  )}
                >
                  {inviteLoading ? '✨ Generating...' : '✨ Generate Invite Code'}
                </button>
                <p className="mt-2 text-xs font-semibold text-[var(--text-muted)] leading-tight">
                  Share this code with anyone who helps care for {baby.name}. They&apos;ll enter it during sign-up.
                </p>
              </>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-[var(--lavender-light)] bg-gradient-to-br from-[var(--lavender-bg)] to-[#F0EAFF] px-4 py-5">
                <div className="mb-2 text-2xl">🔑</div>
                <div className="mb-1 text-2xl font-black tracking-[0.15em] text-[#5B2ED9]">
                  {inviteCode}
                </div>
                <div className="mb-3 text-[11px] font-semibold text-[var(--text-secondary)]">
                  ⏰ Expires in 24 hours · One-time use
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateCode}
                    disabled={inviteLoading}
                    className="flex-1 rounded-xl border-2 border-[var(--lavender-light)] bg-white py-2.5 text-xs font-bold text-[var(--text-secondary)] active:bg-[var(--lavender-bg)] transition-colors"
                  >
                    ↻ New Code
                  </button>
                  <button
                    onClick={handleCopyCode}
                    className={cn(
                      'flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition-all active:scale-[0.97]',
                      inviteCopied
                        ? 'bg-gradient-to-br from-[var(--mint)] to-[#4CAF74] shadow-[0_4px_12px_rgba(111,207,151,0.2)]'
                        : 'bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] shadow-[0_4px_12px_rgba(124,77,255,0.2)]'
                    )}
                  >
                    {inviteCopied ? '✅ Copied!' : '📋 Copy Code'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== DANGER ZONE ===== */}
        <div className="rounded-[var(--radius-lg)] border-[1.5px] border-[var(--rose-light)] bg-white px-5 pb-5 pt-4 shadow-[var(--shadow-sm)]">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span className="text-sm font-extrabold text-[var(--rose)]">Danger Zone</span>
          </div>
          <p className="mb-3 text-xs font-semibold text-[var(--text-muted)] leading-tight">
            Delete all sleep data for {baby.name}. This action cannot be undone.
          </p>
          <button
            onClick={() => alert('Delete confirmation flow')}
            className="w-full rounded-xl border-2 border-[var(--rose-light)] bg-[var(--rose-bg)] py-3 text-sm font-bold text-[var(--rose)] transition-colors active:bg-[var(--rose-light)]"
          >
            Delete {baby.name}&apos;s Data
          </button>
        </div>
      </div>
    </div>
  )
}
