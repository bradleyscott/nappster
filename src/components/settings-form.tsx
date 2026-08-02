'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Cake, Check, Clock, Copy, FileText, KeyRound, RefreshCw, Save, Sparkles, Star, User, UserPlus, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Baby, type FamilyMemberWithIdentity } from '@/types/database'
import { updateBaby } from '@/lib/services/babies'
import { PageHeader } from '@/components/sleep/page-header'

interface SettingsFormProps {
  baby: Baby
  familyMembers: FamilyMemberWithIdentity[]
  familyMembersError?: Error | null
}

export function SettingsForm({ baby, familyMembers, familyMembersError }: SettingsFormProps) {
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
  const [isSigningOut, setIsSigningOut] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const patternTextareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustPatternHeight = () => {
    const el = patternTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    adjustPatternHeight()
  }, [patternNotes])

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

  const handleSignOut = async () => {
    setIsSigningOut(true)
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
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
    <div className="h-dvh flex flex-col bg-[var(--bg)]">
      <PageHeader
        title="Settings"
        onBack={handleBackClick}
        isNavigatingBack={isNavigatingBack}
      />

      <div className="flex-1 overflow-y-auto min-h-0">
      <div className="mx-auto max-w-md px-4 pt-2 pb-6 md:max-w-xl lg:max-w-2xl">
        {/* ===== PROFILE CARD ===== */}
        <div className="card-rise mb-4 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--card-surface)] shadow-[var(--shadow-sm)]">
          <div className="h-1 bg-[var(--lavender)]" />
          <div className="px-5 pb-5 pt-6">
          {error && (
            <div className="mb-4 rounded-xl bg-[var(--rose-bg)] px-4 py-3 text-sm font-bold text-[var(--rose)]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div className="form-field-in mb-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
                <User size={14} strokeWidth={2.5} />
                Baby&apos;s name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border-2 border-[var(--line-soft)] bg-[var(--card-surface)] px-4 py-3.5 text-sm font-bold text-[var(--text)] outline-none transition-colors focus:border-[var(--lavender)]"
                placeholder="Luna"
              />
            </div>

            {/* Birth date */}
            <div className="form-field-in mb-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
                <Cake size={14} strokeWidth={2.5} />
                Birth date
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
                className="w-full rounded-xl border-2 border-[var(--line-soft)] bg-[var(--card-surface)] px-4 py-3.5 text-sm font-bold text-[var(--text)] outline-none transition-colors focus:border-[var(--lavender)]"
              />
            </div>

            {/* Pattern notes */}
            <div className="form-field-in mb-5">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.4px]">
                <FileText size={14} strokeWidth={2.5} />
                Known patterns
              </label>
              <textarea
                ref={patternTextareaRef}
                value={patternNotes}
                onChange={(e) => {
                  setPatternNotes(e.target.value)
                  adjustPatternHeight()
                }}
                placeholder="e.g., 30-minute naps are normal, doesn't do well with early bedtime"
                rows={1}
                className="min-h-[88px] w-full resize-none overflow-hidden rounded-xl border-2 border-[var(--line-soft)] bg-[var(--card-surface)] px-4 py-3.5 text-sm font-semibold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)]"
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
                'action-entrance btn-solid w-full',
                loading && 'opacity-70'
              )}
            >
              <Save size={16} strokeWidth={2.5} />
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
          </div>
        </div>

        {/* ===== FAMILY CARD ===== */}
        <div className="card-rise mb-4 rounded-[var(--radius-lg)] bg-[var(--card-surface)] px-5 pb-5 pt-6 shadow-[var(--shadow-sm)]" style={{ animationDelay: '0.12s' }}>
          {/* Header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lavender-bg)] text-[var(--lavender)]">
              <Users size={20} strokeWidth={2} />
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
            {familyMembersError && (
              <div className="rounded-xl bg-[var(--rose-bg)] px-4 py-3 text-xs font-bold text-[var(--rose)]">
                Couldn&apos;t load caregivers: {familyMembersError.message}
              </div>
            )}
            {familyMembers.length === 0 && (
              <div className="rounded-xl bg-[var(--card-surface)]/70 px-4 py-3 text-center text-sm font-semibold text-[var(--text-muted)]">
                No family members yet
              </div>
            )}
            {familyMembers.map((member, i) => (
              <div
                key={member.id}
                className="member-row-in flex items-center gap-3 rounded-xl bg-[var(--card-surface)] px-4 py-3 shadow-sm"
                style={{ animationDelay: `${0.1 + i * 0.08}s` }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender-bg)] text-[var(--lavender)]">
                  {member.is_you ? <Star size={16} strokeWidth={2} /> : member.role === 'parent' ? <User size={16} strokeWidth={2} /> : <Users size={16} strokeWidth={2} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-bold text-[var(--text)]">
                    {member.is_you ? 'You' : (member.email || 'Caregiver')}
                  </div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                    {member.role}
                  </div>
                </div>
                <span className="rounded-md bg-[var(--mint-bg)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--mint)]">
                  {member.is_you ? 'You' : 'Connected'}
                </span>
              </div>
            ))}
          </div>

          <div className="mb-4 h-px bg-[var(--line-soft)]" />

          {/* Invite section */}
          <div className="text-center">
            <div className="mb-3 flex items-center justify-center gap-1.5 text-sm font-bold text-[var(--text)]">
              <UserPlus size={16} strokeWidth={2.5} />
              Invite a caregiver
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
                    'btn-solid w-full text-sm',
                    inviteLoading && 'opacity-70'
                  )}
                >
                  <Sparkles size={15} strokeWidth={2.5} />
                  {inviteLoading ? 'Generating...' : 'Generate Invite Code'}
                </button>
                <p className="mt-2 text-xs font-semibold text-[var(--text-muted)] leading-tight">
                  Share this code with anyone who helps care for {baby.name}. They&apos;ll enter it during sign-up.
                </p>
              </>
            ) : (
              <div className="invite-reveal rounded-2xl border-2 border-dashed border-[var(--lavender-light)] bg-[var(--lavender-bg)] px-4 py-5">
                <div className="mb-2 flex justify-center">
                  <KeyRound size={26} strokeWidth={2} className="text-[var(--lavender-deep)]" />
                </div>
                <div className="code-pop mb-1 text-center text-2xl font-black tracking-[0.15em] text-[var(--lavender-deep)]">
                  {inviteCode}
                </div>
                <div className="mb-3 flex items-center justify-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                  <Clock size={12} strokeWidth={2.5} />
                  Expires in 24 hours · One-time use
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateCode}
                    disabled={inviteLoading}
                    className="flex-1 rounded-xl border-2 border-[var(--lavender-light)] bg-[var(--card-surface)] py-2.5 text-xs font-bold text-[var(--text-secondary)] transition-colors duration-100 active:bg-[var(--lavender-bg)]"
                  >
                    <RefreshCw size={13} strokeWidth={2.5} className="mr-1 inline-block align-[-2px]" />
                    New Code
                  </button>
                  <button
                    onClick={handleCopyCode}
                    className={cn(
                      'btn-solid flex-1 py-2.5 text-xs',
                      inviteCopied ? 'btn-solid--mint' : ''
                    )}
                  >
                    {inviteCopied ? <Check size={14} strokeWidth={3} /> : <Copy size={14} strokeWidth={2.5} />}
                    {inviteCopied ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== DANGER ZONE ===== */}
        <div className="rounded-[var(--radius-lg)] border-[1.5px] border-[var(--rose-light)] bg-[var(--card-surface)] px-5 pb-5 pt-4 shadow-[var(--shadow-sm)]">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle size={17} strokeWidth={2.25} className="text-[var(--rose)]" />
            <span className="text-sm font-extrabold text-[var(--rose)]">Danger Zone</span>
          </div>
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="mb-3 flex w-full items-center justify-center rounded-xl border-2 border-[var(--line-soft)] bg-[var(--card-surface)] py-3 text-sm font-bold text-[var(--text-secondary)] transition-colors active:bg-[var(--bg)] disabled:opacity-60"
          >
            {isSigningOut ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--lavender)] border-t-transparent" />
            ) : (
              'Sign Out'
            )}
          </button>
          <button
            onClick={() => alert('Delete confirmation flow')}
            className="w-full rounded-xl border-2 border-[var(--rose-light)] bg-[var(--rose-bg)] py-3 text-sm font-bold text-[var(--rose)] transition-colors active:bg-[var(--rose-light)]"
          >
            Delete {baby.name}&apos;s Data
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
