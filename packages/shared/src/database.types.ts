export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      event_teams: {
        Row: {
          created_at: string
          event_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_teams_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          ends_at: string | null
          event_key: string
          id: string
          name: string
          organization_id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          tba_etag: string | null
          tba_last_synced_at: string | null
          tba_matches_etag: string | null
          tba_practice_matches_etag: string | null
          tba_team_remaps_etag: string | null
          tba_team_remaps: Json | null
          tba_teams_etag: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          event_key: string
          id?: string
          name: string
          organization_id: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          tba_etag?: string | null
          tba_last_synced_at?: string | null
          tba_matches_etag?: string | null
          tba_practice_matches_etag?: string | null
          tba_team_remaps_etag?: string | null
          tba_team_remaps?: Json | null
          tba_teams_etag?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          event_key?: string
          id?: string
          name?: string
          organization_id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          tba_etag?: string | null
          tba_last_synced_at?: string | null
          tba_matches_etag?: string | null
          tba_practice_matches_etag?: string | null
          tba_team_remaps_etag?: string | null
          tba_team_remaps?: Json | null
          tba_teams_etag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_definitions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          schema_json: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          schema_json: Json
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          schema_json?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      match_submissions: {
        Row: {
          assignment_id: string
          created_at: string
          event_id: string
          form_version: number
          id: string
          match_id: string
          payload: Json
          revision: number
          scout_user_id: string
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          event_id: string
          form_version: number
          id: string
          match_id: string
          payload?: Json
          revision?: number
          scout_user_id: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          event_id?: string
          form_version?: number
          id?: string
          match_id?: string
          payload?: Json
          revision?: number
          scout_user_id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "scouting_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_submissions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_submissions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_submissions_scout_user_id_fkey"
            columns: ["scout_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          blue_teams: string[]
          created_at: string
          event_id: string
          id: string
          match_number: number
          match_type: Database["public"]["Enums"]["match_type"]
          red_teams: string[]
          scheduled_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          tba_match_key: string
          updated_at: string
        }
        Insert: {
          blue_teams?: string[]
          created_at?: string
          event_id: string
          id?: string
          match_number: number
          match_type?: Database["public"]["Enums"]["match_type"]
          red_teams?: string[]
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          tba_match_key: string
          updated_at?: string
        }
        Update: {
          blue_teams?: string[]
          created_at?: string
          event_id?: string
          id?: string
          match_number?: number
          match_type?: Database["public"]["Enums"]["match_type"]
          red_teams?: string[]
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          tba_match_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scouting_assignments: {
        Row: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          completed_at: string | null
          created_at: string
          id: string
          match_id: string
          scout_user_id: string
          status: Database["public"]["Enums"]["assignment_status"]
          team_id: string
        }
        Insert: {
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          completed_at?: string | null
          created_at?: string
          id?: string
          match_id: string
          scout_user_id: string
          status?: Database["public"]["Enums"]["assignment_status"]
          team_id: string
        }
        Update: {
          assignment_type?: Database["public"]["Enums"]["assignment_type"]
          completed_at?: string | null
          created_at?: string
          id?: string
          match_id?: string
          scout_user_id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scouting_assignments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_assignments_scout_user_id_fkey"
            columns: ["scout_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_photos: {
        Row: {
          captured_at: string | null
          created_at: string
          id: string
          storage_path: string
          submission_id: string
          uploaded_at: string
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          id?: string
          storage_path: string
          submission_id: string
          uploaded_at?: string
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          id?: string
          storage_path?: string
          submission_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_photos_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "match_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          team_number: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          team_number: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          team_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      assignment_status: "pending" | "in_progress" | "complete" | "skipped"
      assignment_type: "objective" | "subjective" | "pit" | "strategist"
      event_status: "draft" | "upcoming" | "active" | "completed" | "archived"
      match_status:
        | "scheduled"
        | "in_progress"
        | "complete"
        | "played"
        | "cancelled"
      match_type: "qualification" | "playoff" | "practice"
      organization_role:
        | "admin"
        | "scout"
        | "strategist"
        | "master"
        | "developer"
        | "global_scout"
      submission_status: "draft" | "submitted" | "corrected" | "invalid"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      assignment_status: ["pending", "in_progress", "complete", "skipped"],
      assignment_type: ["objective", "subjective", "pit", "strategist"],
      event_status: ["draft", "upcoming", "active", "completed", "archived"],
      match_status: [
        "scheduled",
        "in_progress",
        "complete",
        "played",
        "cancelled",
      ],
      match_type: ["qualification", "playoff", "practice"],
      organization_role: [
        "admin",
        "scout",
        "strategist",
        "master",
        "developer",
        "global_scout",
      ],
      submission_status: ["draft", "submitted", "corrected", "invalid"],
    },
  },
} as const
