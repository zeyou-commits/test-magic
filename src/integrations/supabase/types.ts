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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_demo: boolean
          logo_url: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name: string
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      departures: {
        Row: {
          arrival_at: string | null
          company_id: string
          created_at: string
          departure_at: string
          duration_minutes: number | null
          id: string
          is_demo: boolean
          last_verified_at: string | null
          notes: string | null
          reliability: Database["public"]["Enums"]["reliability_status"]
          route_id: string
          schedule_id: string | null
          source_name: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["departure_status"]
          updated_at: string
          verified_by: string | null
          vessel_id: string | null
        }
        Insert: {
          arrival_at?: string | null
          company_id: string
          created_at?: string
          departure_at: string
          duration_minutes?: number | null
          id?: string
          is_demo?: boolean
          last_verified_at?: string | null
          notes?: string | null
          reliability?: Database["public"]["Enums"]["reliability_status"]
          route_id: string
          schedule_id?: string | null
          source_name?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["departure_status"]
          updated_at?: string
          verified_by?: string | null
          vessel_id?: string | null
        }
        Update: {
          arrival_at?: string | null
          company_id?: string
          created_at?: string
          departure_at?: string
          duration_minutes?: number | null
          id?: string
          is_demo?: boolean
          last_verified_at?: string | null
          notes?: string | null
          reliability?: Database["public"]["Enums"]["reliability_status"]
          route_id?: string
          schedule_id?: string | null
          source_name?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["departure_status"]
          updated_at?: string
          verified_by?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departures_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departures_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departures_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_log: {
        Row: {
          action: string
          admin_id: string | null
          comment: string | null
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      port_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          port_id: string
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          port_id: string
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          port_id?: string
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "port_reviews_port_id_fkey"
            columns: ["port_id"]
            isOneToOne: false
            referencedRelation: "ports"
            referencedColumns: ["id"]
          },
        ]
      }
      ports: {
        Row: {
          city: string | null
          country_code: string
          country_name: string
          created_at: string
          facilities: Json
          id: string
          info_source: string | null
          info_source_url: string | null
          info_verified_at: string | null
          is_demo: boolean
          label_anchor: Database["public"]["Enums"]["label_anchor"]
          label_offset_x: number
          label_offset_y: number
          latitude: number
          longitude: number
          name: string
          notes: string | null
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          city?: string | null
          country_code: string
          country_name: string
          created_at?: string
          facilities?: Json
          id?: string
          info_source?: string | null
          info_source_url?: string | null
          info_verified_at?: string | null
          is_demo?: boolean
          label_anchor?: Database["public"]["Enums"]["label_anchor"]
          label_offset_x?: number
          label_offset_y?: number
          latitude: number
          longitude: number
          name: string
          notes?: string | null
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          city?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          facilities?: Json
          id?: string
          info_source?: string | null
          info_source_url?: string | null
          info_verified_at?: string | null
          is_demo?: boolean
          label_anchor?: Database["public"]["Enums"]["label_anchor"]
          label_offset_x?: number
          label_offset_y?: number
          latitude?: number
          longitude?: number
          name?: string
          notes?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rating_criteria: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label: string
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["entity_status"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          label: string
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string | null
          reason: string
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          reason: string
          reporter_id: string
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          reason?: string
          reporter_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_ratings: {
        Row: {
          created_at: string
          criterion_id: string
          id: string
          review_id: string
          score: number
        }
        Insert: {
          created_at?: string
          criterion_id: string
          id?: string
          review_id: string
          score: number
        }
        Update: {
          created_at?: string
          criterion_id?: string
          id?: string
          review_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_ratings_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "rating_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_ratings_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "port_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      route_operators: {
        Row: {
          company_id: string
          created_at: string
          id: string
          route_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          route_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_operators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_operators_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          arrival_port_id: string
          created_at: string
          departure_port_id: string
          distance_km: number | null
          id: string
          is_demo: boolean
          notes: string | null
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          typical_duration_minutes: number | null
          updated_at: string
        }
        Insert: {
          arrival_port_id: string
          created_at?: string
          departure_port_id: string
          distance_km?: number | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          typical_duration_minutes?: number | null
          updated_at?: string
        }
        Update: {
          arrival_port_id?: string
          created_at?: string
          departure_port_id?: string
          distance_km?: number | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          typical_duration_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_arrival_port_id_fkey"
            columns: ["arrival_port_id"]
            isOneToOne: false
            referencedRelation: "ports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_departure_port_id_fkey"
            columns: ["departure_port_id"]
            isOneToOne: false
            referencedRelation: "ports"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_exceptions: {
        Row: {
          created_at: string
          exception_date: string
          exception_type: Database["public"]["Enums"]["exception_type"]
          id: string
          new_departure_time: string | null
          new_vessel_id: string | null
          reason: string | null
          schedule_id: string
        }
        Insert: {
          created_at?: string
          exception_date: string
          exception_type: Database["public"]["Enums"]["exception_type"]
          id?: string
          new_departure_time?: string | null
          new_vessel_id?: string | null
          reason?: string | null
          schedule_id: string
        }
        Update: {
          created_at?: string
          exception_date?: string
          exception_type?: Database["public"]["Enums"]["exception_type"]
          id?: string
          new_departure_time?: string | null
          new_vessel_id?: string | null
          reason?: string | null
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_exceptions_new_vessel_id_fkey"
            columns: ["new_vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_exceptions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          company_id: string
          created_at: string
          default_vessel_id: string | null
          departure_time: string
          duration_minutes: number
          id: string
          is_demo: boolean
          last_verified_at: string | null
          notes: string | null
          reliability: Database["public"]["Enums"]["reliability_status"]
          route_id: string
          source_name: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          valid_from: string
          valid_to: string | null
          verified_by: string | null
          weekdays: number[]
        }
        Insert: {
          company_id: string
          created_at?: string
          default_vessel_id?: string | null
          departure_time: string
          duration_minutes: number
          id?: string
          is_demo?: boolean
          last_verified_at?: string | null
          notes?: string | null
          reliability?: Database["public"]["Enums"]["reliability_status"]
          route_id: string
          source_name?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          valid_from: string
          valid_to?: string | null
          verified_by?: string | null
          weekdays?: number[]
        }
        Update: {
          company_id?: string
          created_at?: string
          default_vessel_id?: string | null
          departure_time?: string
          duration_minutes?: number
          id?: string
          is_demo?: boolean
          last_verified_at?: string | null
          notes?: string | null
          reliability?: Database["public"]["Enums"]["reliability_status"]
          route_id?: string
          source_name?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          verified_by?: string | null
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_default_vessel_id_fkey"
            columns: ["default_vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
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
      vessels: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          is_demo: boolean
          name: string
          photo_url: string | null
          slug: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          vessel_type: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          name: string
          photo_url?: string | null
          slug: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          vessel_type?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          photo_url?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          vessel_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vessels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      app_role: "user" | "admin"
      departure_status: "scheduled" | "modified" | "cancelled"
      entity_status: "active" | "inactive" | "draft"
      exception_type: "cancellation" | "time_change" | "vessel_change"
      label_anchor: "left" | "right" | "top" | "bottom"
      reliability_status: "verified" | "to_verify" | "possibly_outdated"
      report_status: "new" | "in_progress" | "resolved" | "rejected"
      review_status:
        | "pending"
        | "approved"
        | "published"
        | "rejected"
        | "hidden"
        | "deleted"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["user", "admin"],
      departure_status: ["scheduled", "modified", "cancelled"],
      entity_status: ["active", "inactive", "draft"],
      exception_type: ["cancellation", "time_change", "vessel_change"],
      label_anchor: ["left", "right", "top", "bottom"],
      reliability_status: ["verified", "to_verify", "possibly_outdated"],
      report_status: ["new", "in_progress", "resolved", "rejected"],
      review_status: [
        "pending",
        "approved",
        "published",
        "rejected",
        "hidden",
        "deleted",
      ],
    },
  },
} as const
