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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_commentary: {
        Row: {
          commentary: string
          context_type: string
          created_at: string
          id: string
          post_id: string | null
          round_id: string | null
          user_id: string | null
        }
        Insert: {
          commentary: string
          context_type?: string
          created_at?: string
          id?: string
          post_id?: string | null
          round_id?: string | null
          user_id?: string | null
        }
        Update: {
          commentary?: string
          context_type?: string
          created_at?: string
          id?: string
          post_id?: string | null
          round_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_commentary_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_commentary_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          accepted_at: string | null
          id: string
          requested_at: string
          status: string
          user_id_a: string
          user_id_b: string
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          requested_at?: string
          status?: string
          user_id_a: string
          user_id_b: string
        }
        Update: {
          accepted_at?: string | null
          id?: string
          requested_at?: string
          status?: string
          user_id_a?: string
          user_id_b?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          invite_code: string
          name: string
          privacy_level: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          invite_code?: string
          name: string
          privacy_level?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          invite_code?: string
          name?: string
          privacy_level?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          content: string
          created_at: string
          group_id: string | null
          id: string
          post_type: string
          round_id: string | null
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          post_type?: string
          round_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          post_type?: string
          round_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          first_name: string
          ghin: string | null
          ghin_verified: boolean | null
          handicap: number | null
          handicap_visible_to_friends: boolean
          home_course: string | null
          id: string
          last_name: string
          profile_completed: boolean
          rounds_visible_to_friends: boolean
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          first_name?: string
          ghin?: string | null
          ghin_verified?: boolean | null
          handicap?: number | null
          handicap_visible_to_friends?: boolean
          home_course?: string | null
          id?: string
          last_name?: string
          profile_completed?: boolean
          rounds_visible_to_friends?: boolean
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          first_name?: string
          ghin?: string | null
          ghin_verified?: boolean | null
          handicap?: number | null
          handicap_visible_to_friends?: boolean
          home_course?: string | null
          id?: string
          last_name?: string
          profile_completed?: boolean
          rounds_visible_to_friends?: boolean
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      round_event_reactions: {
        Row: {
          created_at: string
          event_id: string
          id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_event_reactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "round_events"
            referencedColumns: ["id"]
          },
        ]
      }
      round_events: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          gross_score: number | null
          hole_number: number
          id: string
          par: number | null
          round_id: string
          round_player_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          gross_score?: number | null
          hole_number: number
          id?: string
          par?: number | null
          round_id: string
          round_player_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          gross_score?: number | null
          hole_number?: number
          id?: string
          par?: number | null
          round_id?: string
          round_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_events_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_events_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      round_followers: {
        Row: {
          created_at: string
          id: string
          round_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          round_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          round_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_followers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_players: {
        Row: {
          created_at: string
          guest_name: string | null
          hole_scores: Json | null
          id: string
          is_scorekeeper: boolean | null
          round_id: string
          total_score: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          guest_name?: string | null
          hole_scores?: Json | null
          id?: string
          is_scorekeeper?: boolean | null
          round_id: string
          total_score?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          guest_name?: string | null
          hole_scores?: Json | null
          id?: string
          is_scorekeeper?: boolean | null
          round_id?: string
          total_score?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_players_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_settlements: {
        Row: {
          amount: number
          created_at: string
          guest_name: string | null
          id: string
          is_manual_adjustment: boolean
          notes: string | null
          round_id: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          guest_name?: string | null
          id?: string
          is_manual_adjustment?: boolean
          notes?: string | null
          round_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          guest_name?: string | null
          id?: string
          is_manual_adjustment?: boolean
          notes?: string | null
          round_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_settlements_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          course: string
          course_details: Json | null
          created_at: string
          created_by: string
          game_type: string
          group_id: string | null
          id: string
          is_broadcast: boolean
          needs_final_photo: boolean
          scorekeeper_mode: boolean
          stakes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          course?: string
          course_details?: Json | null
          created_at?: string
          created_by: string
          game_type?: string
          group_id?: string | null
          id?: string
          is_broadcast?: boolean
          needs_final_photo?: boolean
          scorekeeper_mode?: boolean
          stakes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          course?: string
          course_details?: Json | null
          created_at?: string
          created_by?: string
          game_type?: string
          group_id?: string | null
          id?: string
          is_broadcast?: boolean
          needs_final_photo?: boolean
          scorekeeper_mode?: boolean
          stakes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_courses: {
        Row: {
          city: string
          created_at: string
          created_by: string
          id: string
          name: string
          state: string
        }
        Insert: {
          city?: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          state?: string
        }
        Update: {
          city?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          state?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_profile: {
        Args: { _target_user_id: string; _viewer_id: string }
        Returns: boolean
      }
      find_users_by_emails: {
        Args: { _emails: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          email: string
          handicap: number
          home_course: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_owner_or_admin: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_round_broadcast_friend: {
        Args: { _round_id: string; _user_id: string }
        Returns: boolean
      }
      is_round_creator: {
        Args: { _round_id: string; _user_id: string }
        Returns: boolean
      }
      is_round_follower: {
        Args: { _round_id: string; _user_id: string }
        Returns: boolean
      }
      is_round_participant: {
        Args: { _round_id: string; _user_id: string }
        Returns: boolean
      }
      lookup_group_by_invite: {
        Args: { _code: string }
        Returns: {
          avatar_url: string
          created_at: string
          created_by: string
          description: string
          id: string
          invite_code: string
          name: string
          privacy_level: string
          updated_at: string
        }[]
      }
      search_users_by_name: {
        Args: { _query: string }
        Returns: {
          avatar_url: string
          display_name: string
          first_name: string
          ghin: string
          handicap: number
          home_course: string
          last_name: string
          state: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
