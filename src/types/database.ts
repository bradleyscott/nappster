export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      babies: {
        Row: {
          id: string
          name: string
          birth_date: string
          sleep_training_method: string | null
          pattern_notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          birth_date: string
          sleep_training_method?: string | null
          pattern_notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          birth_date?: string
          sleep_training_method?: string | null
          pattern_notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          id: string
          user_id: string
          baby_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          baby_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          baby_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          }
        ]
      }
      sleep_events: {
        Row: {
          id: string
          baby_id: string
          event_type: string
          event_time: string
          end_time: string | null
          context: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          baby_id: string
          event_type: string
          event_time: string
          end_time?: string | null
          context?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          baby_id?: string
          event_type?: string
          event_time?: string
          end_time?: string | null
          context?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sleep_events_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          }
        ]
      }
      chat_messages: {
        Row: {
          id: string
          baby_id: string
          message_id: string
          role: string
          parts: Json
          created_at: string
        }
        Insert: {
          id?: string
          baby_id: string
          message_id: string
          role: string
          parts: Json
          created_at?: string
        }
        Update: {
          id?: string
          baby_id?: string
          message_id?: string
          role?: string
          parts?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience types
export type Baby = Database['public']['Tables']['babies']['Row']
export type FamilyMember = Database['public']['Tables']['family_members']['Row']
export type SleepEvent = Database['public']['Tables']['sleep_events']['Row']
export type EventType = 'wake' | 'nap_start' | 'nap_end' | 'bedtime' | 'night_wake'
export type Context = 'home' | 'daycare' | 'travel' | null

// Session types for paired event editing
export type SessionType = 'nap' | 'overnight'

// Sleep plan current state values
export const CURRENT_STATE_VALUES = [
  'overnight_sleep',
  'nighttime_wake',
  'daytime_napping',
  'daytime_awake',
] as const

export type CurrentState = typeof CURRENT_STATE_VALUES[number]

export interface SleepSession {
  type: SessionType
  startEvent: SleepEvent           // nap_start or bedtime
  endEvent: SleepEvent | null      // nap_end or wake (null if in-progress)
  durationMinutes: number | null
}

export type TimelineItem =
  | { kind: 'session'; session: SleepSession }
  | { kind: 'standalone'; event: SleepEvent }

// Chat message types
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row']

// Chat history for AI context
export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  text: string
  created_at: string
}
