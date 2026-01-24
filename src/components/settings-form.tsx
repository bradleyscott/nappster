'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Baby } from '@/types/database'
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

interface SettingsFormProps {
  baby: Baby
}

export function SettingsForm({ baby }: SettingsFormProps) {
  const [name, setName] = useState(baby.name)
  const [birthDate, setBirthDate] = useState(baby.birth_date)
  const [sleepMethod, setSleepMethod] = useState(baby.sleep_training_method || '')
  const [patternNotes, setPatternNotes] = useState(baby.pattern_notes || '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('babies')
      .update({
        name,
        birth_date: birthDate,
        sleep_training_method: sleepMethod || null,
        pattern_notes: patternNotes || null,
      })
      .eq('id', baby.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to dashboard
          </Link>
          <CardTitle className="text-2xl">Edit {baby.name}&apos;s profile</CardTitle>
          <CardDescription>
            Update sleep training details and patterns
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
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
                className="flex min-h-60 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">
                Include any patterns the AI should know about
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Save changes'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
