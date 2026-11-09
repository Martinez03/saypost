// Hand-written from supabase/migrations/ (init, workspaces, invites) (only the tables the web reads or writes).
// Insert/Update list only the columns the `authenticated` role is granted, so a forbidden write fails to compile.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Tone = "friendly" | "professional" | "fun" | "elegant";
export type BusinessLanguage = "es" | "en";
export type WhatsappStatus = "inactive" | "pending" | "active";
export type ApprovalMode = "owner_whatsapp" | "agency_dashboard";
export type ActionKind = "publish" | "reply_review" | "reply_comment" | "reply_dm" | "cancel_post" | "boost";
export type ActionStatus = "pending" | "approved" | "rejected" | "done" | "failed" | "superseded";
export type MessageKind = "text" | "audio" | "image" | "video" | "system";
export type WorkspaceKind = "business" | "agency";
export type WorkspaceRole = "owner" | "member";

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          owner_id: string;
          workspace_id: string;
          approval_mode: ApprovalMode;
          name: string;
          category: string | null;
          city: string | null;
          description: string | null;
          tone: Tone;
          language: BusinessLanguage;
          timezone: string;
          notes: string;
          owner_phone: string | null;
          whatsapp_status: WhatsappStatus;
          whatsapp_conversation_id: string | null;
          whatsapp_account_id: string | null;
          whatsapp_last_inbound_at: string | null;
          zernio_profile_id: string | null;
          notify_comments: boolean;
          notify_reviews: boolean;
          notify_dms: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          workspace_id?: string;
          approval_mode?: ApprovalMode;
          name: string;
          category?: string | null;
          city?: string | null;
          description?: string | null;
          tone?: Tone;
          language?: BusinessLanguage;
          timezone?: string;
        };
        Update: {
          name?: string;
          category?: string | null;
          city?: string | null;
          description?: string | null;
          tone?: Tone;
          language?: BusinessLanguage;
          timezone?: string;
          notes?: string;
          notify_comments?: boolean;
          notify_reviews?: boolean;
          notify_dms?: boolean;
          approval_mode?: ApprovalMode;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          kind: WorkspaceKind;
          brand_name: string | null;
          logo_url: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        // Owners only (RLS). The dashboard goes through PATCH /api/workspace, which also validates.
        Update: {
          brand_name?: string | null;
          logo_url?: string | null;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      invites: {
        // token_hash is not granted to the web.
        Row: {
          id: string;
          business_id: string;
          created_by: string | null;
          expires_at: string;
          revoked_at: string | null;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      social_accounts: {
        Row: {
          id: string;
          business_id: string;
          zernio_account_id: string;
          platform: string;
          username: string | null;
          display_name: string | null;
          profile_picture: string | null;
          status: "connected" | "disconnected";
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      messages: {
        Row: {
          id: number;
          business_id: string;
          direction: "in" | "out";
          kind: MessageKind;
          body: string;
          media_url: string | null;
          zernio_message_id: string | null;
          /** Where it came in or was answered: the owner's WhatsApp or the dashboard chat. */
          channel: "whatsapp" | "web";
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      actions: {
        Row: {
          id: string;
          business_id: string;
          kind: ActionKind;
          status: ActionStatus;
          title: string;
          preview: string;
          payload: Json;
          context: Json | null;
          source: "whatsapp" | "webhook" | "dashboard";
          result: Json | null;
          error: string | null;
          decided_via: "whatsapp" | "dashboard" | null;
          created_at: string;
          decided_at: string | null;
          executed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      events: {
        Row: {
          id: number;
          business_id: string;
          type: string;
          title: string;
          data: Json | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type Tables = Database["public"]["Tables"];
export type Business = Tables["businesses"]["Row"];
export type Workspace = Tables["workspaces"]["Row"];
export type SocialAccount = Tables["social_accounts"]["Row"];
export type Message = Tables["messages"]["Row"];
export type Action = Tables["actions"]["Row"];
export type EventRow = Tables["events"]["Row"];
