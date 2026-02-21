'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Baby, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const sleepMethods = [
  { value: '', label: 'Select a method (optional)' },
  { value: 'Taking Cara Babies', label: 'Taking Cara Babies' },
  { value: 'Ferber', label: 'Ferber Method' },
  { value: 'Chair Method', label: 'Chair Method' },
  { value: 'Pick Up Put Down', label: 'Pick Up Put Down' },
  { value: 'Cry It Out', label: 'Cry It Out' },
  { value: 'No Formal Training', label: 'No Formal Training' },
  { value: 'Other', label: 'Other' },
]

type Step = 'choice' | 'create' | 'join'

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('choice')
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [sleepMethod, setSleepMethod] = useState('')
  const [patternNotes, setPatternNotes] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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

    const { data: baby, error: babyError } = await supabase
      .from('babies')
      .insert({
        name,
        birth_date: birthDate,
        sleep_training_method: sleepMethod || null,
        pattern_notes: patternNotes || null,
      })
      .select()
      .single()

    if (babyError) {
      setError(babyError.message)
      setLoading(false)
      return
    }

    const { error: linkError } = await supabase
      .from('family_members')
      .insert({
        user_id: user.id,
        baby_id: baby.id,
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <Image
                src="/nappster.png"
                alt="Nappster Logo"
                width={80}
                height={80}
              />
            </div>
            <CardTitle className="text-2xl">Welcome to Nappster</CardTitle>
            <CardDescription>
              How would you like to get started?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full h-20 justify-start gap-4 px-4"
              onClick={() => setStep("create")}
            >
              <Baby className="h-8 w-8 shrink-0" />
              <div className="text-left">
                <div className="font-semibold">Add a new baby</div>
                <div className="text-sm text-muted-foreground font-normal">
                  Set up a new profile for your baby
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full h-20 justify-start gap-4 px-4"
              onClick={() => setStep("join")}
            >
              <Users className="h-8 w-8 shrink-0" />
              <div className="text-left">
                <div className="font-semibold">I am family</div>
                <div className="text-sm text-muted-foreground font-normal">
                  Enter an invite code from your partner
                </div>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'join') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <button
              onClick={handleBack}
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </button>
            <CardTitle className="text-2xl">I`&apos;`m family</CardTitle>
            <CardDescription>
              Enter the 6-digit invite code from your partner
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleJoinSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="code">Invite code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={inviteCode}
                  onChange={(e) =>
                    setInviteCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                type="submit"
                className="w-full"
                disabled={loading || inviteCode.length !== 6}
              >
                {loading ? "Joining..." : "Join"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  // step === 'create'
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </button>
          <CardTitle className="text-2xl">Set up your baby&apos;s profile</CardTitle>
          <CardDescription>
            This helps us give you personalized sleep recommendations
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleCreateSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Baby&apos;s name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Luna"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthDate">Birth date</Label>
              <Input
                id="birthDate"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sleepMethod">Sleep training method</Label>
              <select
                id="sleepMethod"
                value={sleepMethod}
                onChange={(e) => setSleepMethod(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {sleepMethods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="patternNotes">Known patterns (optional)</Label>
              <textarea
                id="patternNotes"
                placeholder="e.g., 30-minute naps are normal for this baby, doesn't do well with early bedtime"
                value={patternNotes}
                onChange={(e) => setPatternNotes(e.target.value)}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">
                Include any patterns the AI should know about
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting up...' : 'Continue'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
