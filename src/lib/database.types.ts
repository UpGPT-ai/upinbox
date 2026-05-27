/**
 * Supabase Database type stubs for UpInbox.
 *
 * These mirror the schema in supabase/migrations/001_upinbox_core.sql.
 * Generated types from `supabase gen types typescript` would replace this file
 * in a live project — this stub satisfies TypeScript without requiring a
 * running Supabase instance.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  upinbox: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          email_address: string;
          display_name: string | null;
          provider_type: 'jmap' | 'imap';
          encrypted_credentials: string;
          jmap_session_url: string | null;
          is_primary: boolean;
          sync_enabled: boolean;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['upinbox']['Tables']['accounts']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['upinbox']['Tables']['accounts']['Insert']>;
      };

      mailboxes: {
        Row: {
          id: string;
          account_id: string;
          user_id: string;
          provider_mailbox_id: string;
          name: string;
          role: string | null;
          sort_order: number;
          total_emails: number;
          unread_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['upinbox']['Tables']['mailboxes']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['upinbox']['Tables']['mailboxes']['Insert']>;
      };

      triage_results: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          email_id: string;
          thread_id: string | null;
          category: 'ACTION_REQUIRED' | 'FYI' | 'NEWSLETTER' | 'PROMOTION' | 'RECEIPT' | 'EXPIRED' | 'SOCIAL' | 'AUTOMATED';
          confidence: number;
          signals: string[];
          classifier_version: string;
          classified_at: string;
          created_at: string;
        };
        Insert: Omit<Database['upinbox']['Tables']['triage_results']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['upinbox']['Tables']['triage_results']['Insert']>;
      };

      scheduled_sends: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          draft_id: string | null;
          send_at: string;
          status: 'pending' | 'sent' | 'failed' | 'cancelled';
          retry_count: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['upinbox']['Tables']['scheduled_sends']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['upinbox']['Tables']['scheduled_sends']['Insert']>;
      };

      mcp_tokens: {
        Row: {
          id: string;
          user_id: string;
          token_hash: string;
          description: string | null;
          scopes: string[];
          last_used_at: string | null;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['upinbox']['Tables']['mcp_tokens']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['upinbox']['Tables']['mcp_tokens']['Insert']>;
      };

      ai_config: {
        Row: {
          id: string;
          user_id: string;
          byok_provider: 'anthropic' | 'openai' | 'google' | null;
          byok_model: string | null;
          // Note: byok_api_key is NEVER stored — browser only
          use_uplink: boolean;
          uplink_endpoint: string | null;
          intelligence_api_enabled: boolean;
          intelligence_license_jwt: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['upinbox']['Tables']['ai_config']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['upinbox']['Tables']['ai_config']['Insert']>;
      };

      usx_cache: {
        Row: {
          id: string;
          domain: string;
          endpoint: string;
          fingerprint: string;
          ttl: number;
          fetched_at: string;
          created_at: string;
        };
        Insert: Omit<Database['upinbox']['Tables']['usx_cache']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['upinbox']['Tables']['usx_cache']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
