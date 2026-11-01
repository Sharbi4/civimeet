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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_memory: {
        Row: {
          agent_id: string
          content: string
          expires_at: string | null
          id: string
          kind: string
          memory_key: string
          organization_id: string
          source_url: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          content: string
          expires_at?: string | null
          id?: string
          kind: string
          memory_key: string
          organization_id: string
          source_url?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          content?: string
          expires_at?: string | null
          id?: string
          kind?: string
          memory_key?: string
          organization_id?: string
          source_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_organization_id_agent_id_fkey"
            columns: ["organization_id", "agent_id"]
            isOneToOne: false
            referencedRelation: "platform_agents"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agent_plans: {
        Row: {
          created_at: string
          created_by: string
          goal: string
          id: string
          organization_id: string
          source_run: string | null
          status: string
          thread_key: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          goal: string
          id?: string
          organization_id: string
          source_run?: string | null
          status?: string
          thread_key?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          goal?: string
          id?: string
          organization_id?: string
          source_run?: string | null
          status?: string
          thread_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent: string
          attempts: number
          depends_on: number[]
          detail: string
          finished_at: string | null
          id: string
          input: Json
          kind: string
          lease_id: string | null
          lease_until: string | null
          level: string
          organization_id: string
          plan_id: string
          position: number
          result: Json | null
          started_at: string | null
          status: string
          status_detail: string
          title: string
          updated_at: string
        }
        Insert: {
          agent: string
          attempts?: number
          depends_on?: number[]
          detail?: string
          finished_at?: string | null
          id?: string
          input?: Json
          kind: string
          lease_id?: string | null
          lease_until?: string | null
          level: string
          organization_id: string
          plan_id: string
          position: number
          result?: Json | null
          started_at?: string | null
          status?: string
          status_detail?: string
          title: string
          updated_at?: string
        }
        Update: {
          agent?: string
          attempts?: number
          depends_on?: number[]
          detail?: string
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: string
          lease_id?: string | null
          lease_until?: string | null
          level?: string
          organization_id?: string
          plan_id?: string
          position?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          status_detail?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_organization_id_plan_id_fkey"
            columns: ["organization_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "agent_plans"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agent_work_items: {
        Row: {
          agent_id: string
          attempts: number
          created_at: string
          created_by: string
          due_at: string
          id: string
          lease_id: string | null
          lease_until: string | null
          objective: string
          organization_id: string
          result: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          attempts?: number
          created_at?: string
          created_by: string
          due_at?: string
          id?: string
          lease_id?: string | null
          lease_until?: string | null
          objective: string
          organization_id: string
          result?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          attempts?: number
          created_at?: string
          created_by?: string
          due_at?: string
          id?: string
          lease_id?: string | null
          lease_until?: string | null
          objective?: string
          organization_id?: string
          result?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_work_items_organization_id_agent_id_fkey"
            columns: ["organization_id", "agent_id"]
            isOneToOne: false
            referencedRelation: "platform_agents"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      browser_actions: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          finished_at: string | null
          id: string
          organization_id: string
          outcome: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          finished_at?: string | null
          id: string
          organization_id: string
          outcome?: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          organization_id?: string
          outcome?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_actions_organization_id_workspace_id_fkey"
            columns: ["organization_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "browser_workspaces"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      browser_agent_events: {
        Row: {
          created_at: string
          detail: Json
          id: string
          kind: string
          organization_id: string
          run_id: string
          step: number
          summary: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          kind: string
          organization_id: string
          run_id: string
          step?: number
          summary: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          organization_id?: string
          run_id?: string
          step?: number
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_agent_events_organization_id_run_id_fkey"
            columns: ["organization_id", "run_id"]
            isOneToOne: false
            referencedRelation: "browser_agent_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      browser_agent_runs: {
        Row: {
          agent: string
          chat_action_id: string | null
          connector: string
          created_at: string
          created_by: string
          current_action: string
          current_url: string
          finished_at: string | null
          id: string
          max_steps: number
          mode: string
          model: string
          objective: string
          organization_id: string
          plan_task_id: string | null
          result: Json | null
          status: string
          status_detail: string
          step_count: number
          updated_at: string
          usage: Json
        }
        Insert: {
          agent?: string
          chat_action_id?: string | null
          connector: string
          created_at?: string
          created_by: string
          current_action?: string
          current_url?: string
          finished_at?: string | null
          id?: string
          max_steps?: number
          mode?: string
          model: string
          objective: string
          organization_id: string
          plan_task_id?: string | null
          result?: Json | null
          status?: string
          status_detail?: string
          step_count?: number
          updated_at?: string
          usage?: Json
        }
        Update: {
          agent?: string
          chat_action_id?: string | null
          connector?: string
          created_at?: string
          created_by?: string
          current_action?: string
          current_url?: string
          finished_at?: string | null
          id?: string
          max_steps?: number
          mode?: string
          model?: string
          objective?: string
          organization_id?: string
          plan_task_id?: string | null
          result?: Json | null
          status?: string
          status_detail?: string
          step_count?: number
          updated_at?: string
          usage?: Json
        }
        Relationships: [
          {
            foreignKeyName: "browser_agent_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      browser_sites: {
        Row: {
          approved_by: string
          created_at: string
          organization_id: string
          origin: string
        }
        Insert: {
          approved_by: string
          created_at?: string
          organization_id: string
          origin: string
        }
        Update: {
          approved_by?: string
          created_at?: string
          organization_id?: string
          origin?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_sites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      browser_workspaces: {
        Row: {
          agent_id: string
          current_origin: string
          expires_at: string | null
          human_actor: string | null
          id: string
          organization_id: string
          state: string
          task: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          current_origin?: string
          expires_at?: string | null
          human_actor?: string | null
          id?: string
          organization_id: string
          state?: string
          task?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          current_origin?: string
          expires_at?: string | null
          human_actor?: string | null
          id?: string
          organization_id?: string
          state?: string
          task?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_workspaces_organization_id_agent_id_fkey"
            columns: ["organization_id", "agent_id"]
            isOneToOne: false
            referencedRelation: "platform_agents"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "browser_workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      community_events: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          budget_cents: number
          created_at: string
          created_by: string
          event_date: string
          geographic_area: string
          id: string
          organization_id: string
          outcome: string
          plan_id: string | null
          purpose: string
          revision: number
          status: string
          title: string
          updated_at: string
          venue: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          budget_cents: number
          created_at?: string
          created_by: string
          event_date: string
          geographic_area?: string
          id?: string
          organization_id: string
          outcome?: string
          plan_id?: string | null
          purpose: string
          revision?: number
          status?: string
          title: string
          updated_at?: string
          venue?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          budget_cents?: number
          created_at?: string
          created_by?: string
          event_date?: string
          geographic_area?: string
          id?: string
          organization_id?: string
          outcome?: string
          plan_id?: string | null
          purpose?: string
          revision?: number
          status?: string
          title?: string
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_events_organization_id_plan_id_fkey"
            columns: ["organization_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "steward_plans"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      community_needs: {
        Row: {
          created_at: string
          created_by: string
          detail: string
          id: string
          kind: string
          organization_id: string
          priority: string
          source_url: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          detail?: string
          id?: string
          kind: string
          organization_id: string
          priority: string
          source_url?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          detail?: string
          id?: string
          kind?: string
          organization_id?: string
          priority?: string
          source_url?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_needs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_events: {
        Row: {
          action: string
          actor_id: string | null
          connector: string
          created_at: string
          id: string
          message: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          connector: string
          created_at?: string
          id?: string
          message?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          connector?: string
          created_at?: string
          id?: string
          message?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_events_organization_id_connector_fkey"
            columns: ["organization_id", "connector"]
            isOneToOne: false
            referencedRelation: "organization_connectors"
            referencedColumns: ["organization_id", "connector"]
          },
        ]
      }
      demo_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          organization: string
          organization_type: string
          source: string
          submission_key: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message?: string
          name: string
          organization: string
          organization_type: string
          source: string
          submission_key: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          organization?: string
          organization_type?: string
          source?: string
          submission_key?: string
        }
        Relationships: []
      }
      event_payment_requests: {
        Row: {
          amount_cents: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          currency: string
          description: string
          event_id: string
          event_revision: number
          id: string
          organization_id: string
          quote_url: string
          status: string
          vendor_id: string
        }
        Insert: {
          amount_cents: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description: string
          event_id: string
          event_revision: number
          id?: string
          organization_id: string
          quote_url: string
          status?: string
          vendor_id: string
        }
        Update: {
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string
          event_id?: string
          event_revision?: number
          id?: string
          organization_id?: string
          quote_url?: string
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_payment_requests_organization_id_event_id_fkey"
            columns: ["organization_id", "event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "event_payment_requests_organization_id_vendor_id_fkey"
            columns: ["organization_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_briefs: {
        Row: {
          area: string
          coordinator: string
          event_goal: string
          mission: string
          organization_id: string
          platform_actions: Json
          updated_at: string
          voice: string
        }
        Insert: {
          area: string
          coordinator: string
          event_goal?: string
          mission: string
          organization_id: string
          platform_actions?: Json
          updated_at?: string
          voice: string
        }
        Update: {
          area?: string
          coordinator?: string
          event_goal?: string
          mission?: string
          organization_id?: string
          platform_actions?: Json
          updated_at?: string
          voice?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_briefs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_connectors: {
        Row: {
          account_label: string
          connected_at: string | null
          connected_by: string | null
          connector: string
          detail: string
          last_checked_at: string | null
          method: string
          organization_id: string
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          account_label?: string
          connected_at?: string | null
          connected_by?: string | null
          connector: string
          detail?: string
          last_checked_at?: string | null
          method?: string
          organization_id: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          account_label?: string
          connected_at?: string | null
          connected_by?: string | null
          connector?: string
          detail?: string
          last_checked_at?: string | null
          method?: string
          organization_id?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_connectors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_knowledge: {
        Row: {
          content: string
          created_by: string
          id: string
          organization_id: string
          source_url: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_by: string
          id?: string
          organization_id: string
          source_url?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_by?: string
          id?: string
          organization_id?: string
          source_url?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_knowledge_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          organization_id?: string
          role?: string
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
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      organizer_approval_history: {
        Row: {
          action: string
          actor_id: string
          approval_id: string
          created_at: string
          id: string
          organization_id: string
          snapshot: Json
        }
        Insert: {
          action: string
          actor_id: string
          approval_id: string
          created_at?: string
          id?: string
          organization_id: string
          snapshot: Json
        }
        Update: {
          action?: string
          actor_id?: string
          approval_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "organizer_approval_history_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "organizer_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_approval_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_approvals: {
        Row: {
          content: string
          created_at: string
          created_by: string
          destination: string
          id: string
          kind: string
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          destination: string
          id?: string
          kind: string
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          destination?: string
          id?: string
          kind?: string
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_chat_actions: {
        Row: {
          action: Json
          actor_id: string
          created_at: string
          id: string
          message: string
          organization_id: string
          reply: string
          resume_goal: string
          status: string
          thread_key: string
          updated_at: string
        }
        Insert: {
          action: Json
          actor_id: string
          created_at?: string
          id?: string
          message: string
          organization_id: string
          reply?: string
          resume_goal?: string
          status?: string
          thread_key: string
          updated_at?: string
        }
        Update: {
          action?: Json
          actor_id?: string
          created_at?: string
          id?: string
          message?: string
          organization_id?: string
          reply?: string
          resume_goal?: string
          status?: string
          thread_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_chat_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_agents: {
        Row: {
          created_at: string
          id: string
          instructions: string
          last_collection_at: string | null
          name: string
          organization_id: string
          paused: boolean
          platform: string
          selected: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string
          last_collection_at?: string | null
          name: string
          organization_id: string
          paused?: boolean
          platform: string
          selected?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          last_collection_at?: string | null
          name?: string
          organization_id?: string
          paused?: boolean
          platform?: string
          selected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "platform_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      steward_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_revision: number | null
          connection: string
          contribution: string
          created_at: string
          created_by: string
          follow_up: string
          follow_up_on: string
          gathering: string
          id: string
          need_id: string | null
          organization_id: string
          outcome: string
          revision: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_revision?: number | null
          connection?: string
          contribution: string
          created_at?: string
          created_by: string
          follow_up: string
          follow_up_on: string
          gathering?: string
          id?: string
          need_id?: string | null
          organization_id: string
          outcome?: string
          revision?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_revision?: number | null
          connection?: string
          contribution?: string
          created_at?: string
          created_by?: string
          follow_up?: string
          follow_up_on?: string
          gathering?: string
          id?: string
          need_id?: string | null
          organization_id?: string
          outcome?: string
          revision?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "steward_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steward_plans_organization_id_need_id_fkey"
            columns: ["organization_id", "need_id"]
            isOneToOne: false
            referencedRelation: "community_needs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      steward_research_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          organization_id: string
          plan_id: string | null
          request_id: string
          requested_by: string
          result: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input: Json
          organization_id: string
          plan_id?: string | null
          request_id: string
          requested_by: string
          result?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          organization_id?: string
          plan_id?: string | null
          request_id?: string
          requested_by?: string
          result?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "steward_research_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steward_research_runs_organization_id_plan_id_fkey"
            columns: ["organization_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "steward_plans"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      vendor_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          organization_id: string
          vendor_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          vendor_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_activity_organization_id_vendor_id_fkey"
            columns: ["organization_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      vendor_discoveries: {
        Row: {
          agent_id: string
          details: Json
          discovered_at: string
          id: string
          idempotency_key: string
          organization_id: string
          recorded_by: string | null
          recorded_via: string
          source_excerpt: string
          source_url: string
          vendor_id: string
        }
        Insert: {
          agent_id: string
          details: Json
          discovered_at?: string
          id?: string
          idempotency_key: string
          organization_id: string
          recorded_by?: string | null
          recorded_via: string
          source_excerpt?: string
          source_url: string
          vendor_id: string
        }
        Update: {
          agent_id?: string
          details?: Json
          discovered_at?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          recorded_by?: string | null
          recorded_via?: string
          source_excerpt?: string
          source_url?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_discoveries_organization_id_agent_id_fkey"
            columns: ["organization_id", "agent_id"]
            isOneToOne: false
            referencedRelation: "platform_agents"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "vendor_discoveries_organization_id_vendor_id_fkey"
            columns: ["organization_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      vendor_links: {
        Row: {
          id: string
          identity_key: string
          organization_id: string
          platform: string
          url: string
          vendor_id: string
        }
        Insert: {
          id?: string
          identity_key: string
          organization_id: string
          platform: string
          url: string
          vendor_id: string
        }
        Update: {
          id?: string
          identity_key?: string
          organization_id?: string
          platform?: string
          url?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_links_organization_id_vendor_id_fkey"
            columns: ["organization_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      vendors: {
        Row: {
          category: string
          contact_name: string
          created_at: string
          email: string
          id: string
          name: string
          notes: string
          organization_id: string
          phone: string
          service_areas: string[]
          status: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          category?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          name: string
          notes?: string
          organization_id: string
          phone?: string
          service_areas?: string[]
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          category?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string
          organization_id?: string
          phone?: string
          service_areas?: string[]
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_organization_id_fkey"
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
      begin_connector_oauth: {
        Args: {
          actor: string
          callback: string
          oauth_state: string
          target: string
          verifier: string
          workspace: string
        }
        Returns: undefined
      }
      claim_agent_task: {
        Args: { actor: string; target_plan: string; workspace: string }
        Returns: Json
      }
      claim_agent_work: { Args: { agent_token: string }; Returns: Json }
      claim_browser_agent_run: {
        Args: {
          actor: string
          lease_seconds?: number
          target_run: string
          workspace: string
        }
        Returns: Json
      }
      claim_browser_operation: {
        Args: {
          actor: string
          operation: string
          request_key: string
          target_agent: string
          workspace: string
        }
        Returns: Json
      }
      claim_connector_operation: {
        Args: {
          actor: string
          lease_seconds?: number
          operation: string
          target: string
          workspace: string
        }
        Returns: Json
      }
      collect_agent_vendor: {
        Args: { agent_token: string; discovery: Json }
        Returns: Json
      }
      configure_platform_agent: {
        Args: {
          agent_instructions: string
          agent_name: string
          is_paused: boolean
          target_agent: string
        }
        Returns: undefined
      }
      connector_browser_profile: {
        Args: { target: string; workspace: string }
        Returns: Json
      }
      control_agent_plan: {
        Args: { action: string; target_plan: string }
        Returns: undefined
      }
      create_agent_plan: {
        Args: {
          actor: string
          plan: Json
          source?: string
          thread?: string
          workspace: string
        }
        Returns: string
      }
      create_vendor_workspace: {
        Args: { workspace_name: string }
        Returns: string
      }
      enqueue_agent_work: {
        Args: {
          scheduled_for?: string
          target_agent: string
          task_objective: string
        }
        Returns: string
      }
      finish_agent_task: {
        Args: { lease: string; outcome: Json; target_task: string }
        Returns: undefined
      }
      finish_agent_work: {
        Args: {
          agent_token: string
          outcome: string
          succeeded: boolean
          task_id: string
          task_lease: string
        }
        Returns: undefined
      }
      finish_browser_agent_step: {
        Args: {
          events?: Json
          lease: string
          outcome: Json
          target_run: string
        }
        Returns: undefined
      }
      finish_browser_operation: {
        Args: { request_key: string; result: Json; success: boolean }
        Returns: undefined
      }
      finish_connector_operation: {
        Args: { actor: string; result: Json; target: string; workspace: string }
        Returns: undefined
      }
      finish_steward_discovery: {
        Args: { failure?: string; research_result: Json; target_run: string }
        Returns: Json
      }
      finish_steward_research: {
        Args: { failure?: string; research_result?: Json; target_run: string }
        Returns: undefined
      }
      forget_connector: {
        Args: { target: string; workspace: string }
        Returns: string
      }
      log_chat_action: {
        Args: {
          chat_action: Json
          chat_message: string
          goal?: string
          outcome: string
          outcome_reply: string
          thread: string
          workspace: string
        }
        Returns: string
      }
      propose_event_payment: {
        Args: {
          amount: number
          payment_description: string
          quote_source: string
          target_event: string
          target_vendor: string
        }
        Returns: string
      }
      read_connector_secret: {
        Args: { target: string; workspace: string }
        Returns: string
      }
      recall_agent_context: {
        Args: {
          agent_token: string
          page_offset?: number
          search_text?: string
        }
        Returns: Json
      }
      record_community_need: {
        Args: {
          need_detail: string
          need_kind: string
          need_title: string
          source?: string
          urgency?: string
          workspace: string
        }
        Returns: string
      }
      remember_agent: {
        Args: {
          agent_token: string
          entry_content: string
          entry_key: string
          entry_kind: string
          entry_source?: string
          expiry?: string
        }
        Returns: string
      }
      reserve_steward_research: {
        Args: {
          actor: string
          request_key: string
          research_input: Json
          target_plan?: string
          workspace: string
        }
        Returns: Json
      }
      resolve_community_need: {
        Args: { resolved: boolean; target_need: string }
        Returns: undefined
      }
      retry_agent_task: { Args: { target_task: string }; Returns: undefined }
      review_community_event: {
        Args: {
          decision: string
          expected_revision: number
          result_note?: string
          target_event: string
        }
        Returns: undefined
      }
      review_event_payment: {
        Args: { decision: string; target_payment: string }
        Returns: undefined
      }
      review_organizer_approval: {
        Args: { decision: string; expected_revision: number; target: string }
        Returns: undefined
      }
      review_steward_plan: {
        Args: {
          decision: string
          expected_revision: number
          result_note?: string
          target_plan: string
        }
        Returns: undefined
      }
      review_vendor: {
        Args: { details: Json; review_status: string; target_vendor: string }
        Returns: undefined
      }
      rotate_platform_agent_token: {
        Args: { target_agent: string }
        Returns: string
      }
      save_community_event: {
        Args: {
          event_data: Json
          expected_revision?: number
          target_event?: string
          workspace: string
        }
        Returns: string
      }
      save_connector_settings: {
        Args: { next_settings: Json; target: string; workspace: string }
        Returns: Json
      }
      save_organization_brief: {
        Args: { brief: Json; workspace: string }
        Returns: undefined
      }
      save_organization_knowledge: {
        Args: {
          entry_content: string
          entry_source?: string
          entry_title: string
          workspace: string
        }
        Returns: string
      }
      save_organizer_approval: {
        Args: {
          draft: Json
          expected_revision?: number
          target?: string
          workspace: string
        }
        Returns: string
      }
      save_steward_plan: {
        Args: {
          expected_revision?: number
          plan: Json
          target_plan?: string
          workspace: string
        }
        Returns: string
      }
      save_vendor_discovery: {
        Args: { agent_id: string; discovery: Json }
        Returns: Json
      }
      search_agent_vendors: {
        Args: {
          agent_token: string
          page_offset?: number
          search_text?: string
          service_area?: string
        }
        Returns: Json
      }
      search_vendor_directory: {
        Args: {
          page_offset?: number
          page_size?: number
          review_status?: string
          search_text?: string
          service_area?: string
          workspace: string
        }
        Returns: Json
      }
      select_organization_platform: {
        Args: { is_selected: boolean; target_agent: string }
        Returns: undefined
      }
      start_browser_agent_run: {
        Args: {
          actor: string
          chat_action?: string
          run_model: string
          run_objective: string
          steps?: number
          target: string
          task?: string
          workspace: string
        }
        Returns: string
      }
      store_connector_secret: {
        Args: { sealed: string; target: string; workspace: string }
        Returns: undefined
      }
      take_connector_oauth: { Args: { oauth_state: string }; Returns: Json }
      update_chat_action: {
        Args: { outcome: string; outcome_reply: string; target: string }
        Returns: undefined
      }
      update_waiting_agent_task: {
        Args: { outcome: Json; target_task: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
