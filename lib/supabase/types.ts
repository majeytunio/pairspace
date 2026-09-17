/**
 * Author: Ali Quraishi
 *
 * Hand-written types matching supabase/schema.sql. If you change the
 * schema, regenerate with:
 *   supabase gen types typescript --project-id <ref> > lib/supabase/types.ts
 */
export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          language: string;
          created_at: string;
          last_active_at: string;
          status: "active" | "archived";
        };
        Insert: {
          id?: string;
          name?: string;
          owner_id: string;
          language?: string;
          created_at?: string;
          last_active_at?: string;
          status?: "active" | "archived";
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
      };
      session_participants: {
        Row: {
          session_id: string;
          user_id: string;
          role: "owner" | "editor" | "viewer";
          joined_at: string;
        };
        Insert: {
          session_id: string;
          user_id: string;
          role?: "owner" | "editor" | "viewer";
          joined_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_participants"]["Insert"]>;
      };
      doc_snapshots: {
        Row: {
          session_id: string;
          doc_id: string;
          state: string; // bytea comes back base64/hex-encoded over the JS client
          version: number;
          updated_at: string;
        };
        Insert: {
          session_id: string;
          doc_id?: string;
          state: string;
          version?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["doc_snapshots"]["Insert"]>;
      };
      whiteboard_snapshots: {
        Row: {
          session_id: string;
          state: string;
          version: number;
          updated_at: string;
        };
        Insert: {
          session_id: string;
          state: string;
          version?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["whiteboard_snapshots"]["Insert"]>;
      };
      sandbox_runs: {
        Row: {
          id: string;
          session_id: string;
          doc_id: string;
          triggered_by: string;
          language: string;
          stdout: string | null;
          stderr: string | null;
          exit_code: number | null;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          doc_id?: string;
          triggered_by: string;
          language: string;
          stdout?: string | null;
          stderr?: string | null;
          exit_code?: number | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sandbox_runs"]["Insert"]>;
      };
    };
  };
}
