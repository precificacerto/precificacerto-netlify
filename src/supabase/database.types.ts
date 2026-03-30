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
      ai_agent_config: {
        Row: {
          id: string
          knowledge_base_ref: string | null
          model_config: Json | null
          persona: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          knowledge_base_ref?: string | null
          model_config?: Json | null
          persona?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          knowledge_base_ref?: string | null
          model_config?: Json | null
          persona?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      allocations: {
        Row: {
          created_at: string
          id: string
          order_id: string
          quantity_reserved: number
          status: Database["public"]["Enums"]["allocation_status"] | null
          stock_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          quantity_reserved: number
          status?: Database["public"]["Enums"]["allocation_status"] | null
          stock_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          quantity_reserved?: number
          status?: Database["public"]["Enums"]["allocation_status"] | null
          stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stock"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          entity_id: string | null
          executed_at: string
          id: string
          result: string | null
          rule_id: string | null
        }
        Insert: {
          entity_id?: string | null
          executed_at?: string
          id?: string
          result?: string | null
          rule_id?: string | null
        }
        Update: {
          entity_id?: string | null
          executed_at?: string
          id?: string
          result?: string | null
          rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_type: Database["public"]["Enums"]["automation_action"]
          condition: Json | null
          created_at: string
          id: string
          is_active: boolean | null
          template_id: string | null
          tenant_id: string
          trigger_event: Database["public"]["Enums"]["automation_trigger"]
        }
        Insert: {
          action_type: Database["public"]["Enums"]["automation_action"]
          condition?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          template_id?: string | null
          tenant_id: string
          trigger_event: Database["public"]["Enums"]["automation_trigger"]
        }
        Update: {
          action_type?: Database["public"]["Enums"]["automation_action"]
          condition?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          template_id?: string | null
          tenant_id?: string
          trigger_event?: Database["public"]["Enums"]["automation_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      brazilian_states: {
        Row: {
          code: string
          created_at: string | null
          icms_internal_rate: number
          id: number
          name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          icms_internal_rate?: number
          id?: number
          name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          icms_internal_rate?: number
          id?: number
          name?: string
        }
        Relationships: []
      }
      budget_items: {
        Row: {
          budget_id: string
          created_at: string
          discount: number | null
          id: string
          product_id: string
          quantity: number | null
          unit_price: number | null
        }
        Insert: {
          budget_id: string
          created_at?: string
          discount?: number | null
          id?: string
          product_id: string
          quantity?: number | null
          unit_price?: number | null
        }
        Update: {
          budget_id?: string
          created_at?: string
          discount?: number | null
          id?: string
          product_id?: string
          quantity?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          expiration_date: string | null
          id: string
          installments: number | null
          notes: string | null
          paid_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          sale_id: string | null
          status: Database["public"]["Enums"]["budget_status"] | null
          tenant_id: string
          total_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expiration_date?: string | null
          id?: string
          installments?: number | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["budget_status"] | null
          tenant_id: string
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expiration_date?: string | null
          id?: string
          installments?: number | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["budget_status"] | null
          tenant_id?: string
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          created_at: string
          customer_id: string | null
          description: string | null
          end_time: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          start_time: string
          status: Database["public"]["Enums"]["event_status"] | null
          tenant_id: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_time: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          start_time: string
          status?: Database["public"]["Enums"]["event_status"] | null
          tenant_id: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_time?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["event_status"] | null
          tenant_id?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_entries: {
        Row: {
          amount: number
          cashier_month_id: string | null
          category_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          origin_id: string | null
          origin_type: string | null
          paid_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          tenant_id: string
          type: Database["public"]["Enums"]["cash_direction"]
        }
        Insert: {
          amount: number
          cashier_month_id?: string | null
          category_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          origin_id?: string | null
          origin_type?: string | null
          paid_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          tenant_id: string
          type: Database["public"]["Enums"]["cash_direction"]
        }
        Update: {
          amount?: number
          cashier_month_id?: string | null
          category_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          origin_id?: string | null
          origin_type?: string | null
          paid_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["cash_direction"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_entries_cashier_month_id_fkey"
            columns: ["cashier_month_id"]
            isOneToOne: false
            referencedRelation: "cashier_months"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "cashier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashier_categories: {
        Row: {
          created_at: string
          id: string
          is_calculable_in_dre: boolean | null
          name: string
          tenant_id: string
          type: Database["public"]["Enums"]["cash_category_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_calculable_in_dre?: boolean | null
          name: string
          tenant_id: string
          type: Database["public"]["Enums"]["cash_category_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_calculable_in_dre?: boolean | null
          name?: string
          tenant_id?: string
          type?: Database["public"]["Enums"]["cash_category_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cashier_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashier_months: {
        Row: {
          balance: number | null
          created_at: string
          created_by: string | null
          id: string
          month_year: string
          tenant_id: string
          total_in: number | null
          total_out: number | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          month_year: string
          tenant_id: string
          total_in?: number | null
          total_out?: number | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          month_year?: string
          tenant_id?: string
          total_in?: number | null
          total_out?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashier_months_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          birth_date: string | null
          cep: string | null
          city: string | null
          complement: string | null
          created_at: string
          customer_type: string | null
          document: string | null
          email: string | null
          id: string
          ie: string | null
          is_icms_contributor: boolean | null
          is_pj: boolean | null
          name: string
          neighborhood: string | null
          notes: string | null
          number: string | null
          owner_id: string | null
          phone: string | null
          segment: string | null
          state_code: string | null
          status: string | null
          street: string | null
          tenant_id: string
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          customer_type?: string | null
          document?: string | null
          email?: string | null
          id?: string
          ie?: string | null
          is_icms_contributor?: boolean | null
          is_pj?: boolean | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          owner_id?: string | null
          phone?: string | null
          segment?: string | null
          state_code?: string | null
          status?: string | null
          street?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          customer_type?: string | null
          document?: string | null
          email?: string | null
          id?: string
          ie?: string | null
          is_icms_contributor?: boolean | null
          is_pj?: boolean | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          owner_id?: string | null
          phone?: string | null
          segment?: string | null
          state_code?: string | null
          status?: string | null
          street?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_yearly: {
        Row: {
          data_json: Json | null
          id: string
          net_profit: number | null
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          data_json?: Json | null
          id?: string
          net_profit?: number | null
          tenant_id: string
          updated_at?: string
          year: number
        }
        Update: {
          data_json?: Json | null
          id?: string
          net_profit?: number | null
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "dre_yearly_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          document: string | null
          email: string | null
          hire_date: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          position: string | null
          role: string | null
          salary: number | null
          status: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
          work_days_per_month: number | null
          work_hours_per_day: number | null
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          role?: string | null
          salary?: number | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          user_id?: string | null
          work_days_per_month?: number | null
          work_hours_per_day?: number | null
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          role?: string | null
          salary?: number | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          work_days_per_month?: number | null
          work_hours_per_day?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string | null
          description: string
          due_day: number
          id: string
          is_active: boolean | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string | null
          description: string
          due_day: number
          id?: string
          is_active?: boolean | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string | null
          description?: string
          due_day?: number
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "cashier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      icms_interstate_rates: {
        Row: {
          destination_state: string
          id: number
          is_imported: boolean | null
          origin_state: string
          rate_percent: number
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          destination_state: string
          id?: number
          is_imported?: boolean | null
          origin_state: string
          rate_percent?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          destination_state?: string
          id?: number
          is_imported?: boolean | null
          origin_state?: string
          rate_percent?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      item_tax_credits: {
        Row: {
          created_at: string | null
          credit_value: number | null
          id: string
          is_active: boolean | null
          is_highlighted: boolean | null
          item_id: string
          rate_percent: number | null
          source: string | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credit_value?: number | null
          id?: string
          is_active?: boolean | null
          is_highlighted?: boolean | null
          item_id: string
          rate_percent?: number | null
          source?: string | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credit_value?: number | null
          id?: string
          is_active?: boolean | null
          is_highlighted?: boolean | null
          item_id?: string
          rate_percent?: number | null
          source?: string | null
          tax_type?: Database["public"]["Enums"]["tax_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_tax_credits_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_tax_details: {
        Row: {
          created_at: string
          id: string
          is_credit: boolean | null
          item_id: string
          rate_percent: number | null
          tax_type: Database["public"]["Enums"]["tax_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_credit?: boolean | null
          item_id: string
          rate_percent?: number | null
          tax_type: Database["public"]["Enums"]["tax_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_credit?: boolean | null
          item_id?: string
          rate_percent?: number | null
          tax_type?: Database["public"]["Enums"]["tax_type"]
        }
        Relationships: [
          {
            foreignKeyName: "item_tax_details_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          base_unit: Database["public"]["Enums"]["unit_measure"] | null
          c_class_trib: string | null
          code: string | null
          cost_gross: number | null
          cost_net: number | null
          cost_per_base_unit: number | null
          cost_price: number
          created_at: string
          has_st: boolean | null
          id: string
          is_monofasico: boolean | null
          item_type: Database["public"]["Enums"]["item_type"] | null
          name: string
          nbs_code: string | null
          ncm_code: string | null
          observation: string | null
          quantity: number | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_state: string | null
          tenant_id: string
          unit: Database["public"]["Enums"]["unit_measure"] | null
          updated_at: string
        }
        Insert: {
          base_unit?: Database["public"]["Enums"]["unit_measure"] | null
          c_class_trib?: string | null
          code?: string | null
          cost_gross?: number | null
          cost_net?: number | null
          cost_per_base_unit?: number | null
          cost_price?: number
          created_at?: string
          has_st?: boolean | null
          id?: string
          is_monofasico?: boolean | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          name: string
          nbs_code?: string | null
          ncm_code?: string | null
          observation?: string | null
          quantity?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_state?: string | null
          tenant_id: string
          unit?: Database["public"]["Enums"]["unit_measure"] | null
          updated_at?: string
        }
        Update: {
          base_unit?: Database["public"]["Enums"]["unit_measure"] | null
          c_class_trib?: string | null
          code?: string | null
          cost_gross?: number | null
          cost_net?: number | null
          cost_per_base_unit?: number | null
          cost_price?: number
          created_at?: string
          has_st?: boolean | null
          id?: string
          is_monofasico?: boolean | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          name?: string
          nbs_code?: string | null
          ncm_code?: string | null
          observation?: string | null
          quantity?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_state?: string | null
          tenant_id?: string
          unit?: Database["public"]["Enums"]["unit_measure"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_costs: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          gross_value: number | null
          id: string
          labor_type: string
          net_value: number | null
          pis_cofins_credit_active: boolean | null
          pis_cofins_credit_rate: number | null
          pis_cofins_credit_value: number | null
          product_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          gross_value?: number | null
          id?: string
          labor_type?: string
          net_value?: number | null
          pis_cofins_credit_active?: boolean | null
          pis_cofins_credit_rate?: number | null
          pis_cofins_credit_value?: number | null
          product_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          gross_value?: number | null
          id?: string
          labor_type?: string
          net_value?: number | null
          pis_cofins_credit_active?: boolean | null
          pis_cofins_credit_rate?: number | null
          pis_cofins_credit_value?: number | null
          product_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labor_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lucro_presumido_rates: {
        Row: {
          activity_type: string
          cofins_rate: number | null
          csll_presumption_percent: number
          csll_rate: number | null
          id: number
          irpj_additional_rate: number | null
          irpj_additional_threshold: number | null
          irpj_presumption_percent: number
          irpj_rate: number | null
          pis_rate: number | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          activity_type: string
          cofins_rate?: number | null
          csll_presumption_percent: number
          csll_rate?: number | null
          id?: number
          irpj_additional_rate?: number | null
          irpj_additional_threshold?: number | null
          irpj_presumption_percent: number
          irpj_rate?: number | null
          pis_rate?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          activity_type?: string
          cofins_rate?: number | null
          csll_presumption_percent?: number
          csll_rate?: number | null
          id?: number
          irpj_additional_rate?: number | null
          irpj_additional_threshold?: number | null
          irpj_presumption_percent?: number
          irpj_rate?: number | null
          pis_rate?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      lucro_real_params: {
        Row: {
          cofins_rate: number | null
          csll_rate: number | null
          id: number
          irpj_additional_annual_threshold: number | null
          irpj_additional_rate: number | null
          irpj_rate: number | null
          pis_rate: number | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          cofins_rate?: number | null
          csll_rate?: number | null
          id?: number
          irpj_additional_annual_threshold?: number | null
          irpj_additional_rate?: number | null
          irpj_rate?: number | null
          pis_rate?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          cofins_rate?: number | null
          csll_rate?: number | null
          id?: number
          irpj_additional_annual_threshold?: number | null
          irpj_additional_rate?: number | null
          irpj_rate?: number | null
          pis_rate?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body_text: string
          created_at: string
          id: string
          tenant_id: string
          title: string
          variables_schema: Json | null
        }
        Insert: {
          body_text: string
          created_at?: string
          id?: string
          tenant_id: string
          title: string
          variables_schema?: Json | null
        }
        Update: {
          body_text?: string
          created_at?: string
          id?: string
          tenant_id?: string
          title?: string
          variables_schema?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_sync_config: {
        Row: {
          config_key: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          metadata: Json | null
          sync_interval_hours: number | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          config_key: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          metadata?: Json | null
          sync_interval_hours?: number | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          config_key?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          metadata?: Json | null
          sync_interval_hours?: number | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      nbs_codes: {
        Row: {
          code: string
          description: string | null
          id: number
          iss_rate_default: number | null
          iss_rate_max: number | null
          iss_rate_min: number | null
          updated_at: string | null
        }
        Insert: {
          code: string
          description?: string | null
          id?: number
          iss_rate_default?: number | null
          iss_rate_max?: number | null
          iss_rate_min?: number | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          description?: string | null
          id?: number
          iss_rate_default?: number | null
          iss_rate_max?: number | null
          iss_rate_min?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ncm_codes: {
        Row: {
          cbs_rate: number | null
          chapter: string | null
          code: string
          cofins_rate_cumulativo: number | null
          cofins_rate_nao_cumulativo: number | null
          description: string | null
          has_icms_st: boolean | null
          ibs_rate: number | null
          id: number
          ipi_rate: number | null
          ipi_treatment: Database["public"]["Enums"]["ipi_treatment"] | null
          mva_percent: number | null
          pis_cofins_regime:
            | Database["public"]["Enums"]["pis_cofins_regime"]
            | null
          pis_rate_cumulativo: number | null
          pis_rate_nao_cumulativo: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          cbs_rate?: number | null
          chapter?: string | null
          code: string
          cofins_rate_cumulativo?: number | null
          cofins_rate_nao_cumulativo?: number | null
          description?: string | null
          has_icms_st?: boolean | null
          ibs_rate?: number | null
          id?: number
          ipi_rate?: number | null
          ipi_treatment?: Database["public"]["Enums"]["ipi_treatment"] | null
          mva_percent?: number | null
          pis_cofins_regime?:
            | Database["public"]["Enums"]["pis_cofins_regime"]
            | null
          pis_rate_cumulativo?: number | null
          pis_rate_nao_cumulativo?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          cbs_rate?: number | null
          chapter?: string | null
          code?: string
          cofins_rate_cumulativo?: number | null
          cofins_rate_nao_cumulativo?: number | null
          description?: string | null
          has_icms_st?: boolean | null
          ibs_rate?: number | null
          id?: number
          ipi_rate?: number | null
          ipi_treatment?: Database["public"]["Enums"]["ipi_treatment"] | null
          mva_percent?: number | null
          pis_cofins_regime?:
            | Database["public"]["Enums"]["pis_cofins_regime"]
            | null
          pis_rate_cumulativo?: number | null
          pis_rate_nao_cumulativo?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          budget_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivery_date: string | null
          id: string
          status: Database["public"]["Enums"]["order_status"] | null
          tenant_id: string
          total_value: number | null
          updated_at: string
        }
        Insert: {
          budget_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivery_date?: string | null
          id?: string
          status?: Database["public"]["Enums"]["order_status"] | null
          tenant_id: string
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          budget_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivery_date?: string | null
          id?: string
          status?: Database["public"]["Enums"]["order_status"] | null
          tenant_id?: string
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean | null
          created_at: string
          days_to_receive: number | null
          id: string
          name: string
          tax_percent: number | null
          tenant_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          days_to_receive?: number | null
          id?: string
          name: string
          tax_percent?: number | null
          tenant_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          days_to_receive?: number | null
          id?: string
          name?: string
          tax_percent?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          description: string | null
          id: string
          module: Database["public"]["Enums"]["permission_module"]
        }
        Insert: {
          code: string
          description?: string | null
          id?: string
          module: Database["public"]["Enums"]["permission_module"]
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
          module?: Database["public"]["Enums"]["permission_module"]
        }
        Relationships: []
      }
      pricing_calculations: {
        Row: {
          buyer_type: Database["public"]["Enums"]["buyer_type_enum"] | null
          calc_type: Database["public"]["Enums"]["calc_type"]
          calculated_at: string | null
          cbs_active: boolean | null
          cbs_debit_value: number | null
          cbs_rate: number | null
          cbs_to_collect: number | null
          cmv: number | null
          coefficient: number | null
          created_at: string | null
          destination_state: string | null
          difal_value: number | null
          ibs_active: boolean | null
          ibs_debit_value: number | null
          ibs_rate: number | null
          ibs_to_collect: number | null
          icms_active: boolean | null
          icms_rate_applied: number | null
          icms_sale_rate: number | null
          id: string
          ipi_output_active: boolean | null
          ipi_output_rate: number | null
          ipi_output_value: number | null
          is_monofasico_applied: boolean | null
          is_st_applied: boolean | null
          iss_active: boolean | null
          iss_sale_rate: number | null
          pct_commission: number | null
          pct_csll: number | null
          pct_financial_expense: number | null
          pct_fixed_expense: number | null
          pct_icms: number | null
          pct_indirect_labor: number | null
          pct_irpj: number | null
          pct_irpj_additional: number | null
          pct_iss: number | null
          pct_labor_cost: number | null
          pct_material_cost: number | null
          pct_pis_cofins: number | null
          pct_profit_margin: number | null
          pct_taxable_regime: number | null
          pct_variable_expense: number | null
          pis_cofins_active: boolean | null
          pis_cofins_sale_rate: number | null
          product_id: string
          product_workload: number | null
          product_workload_price: number | null
          recalculated: boolean | null
          sale_price_internal: number | null
          sale_price_per_unit: number | null
          sale_price_total: number | null
          sale_scope: Database["public"]["Enums"]["sale_scope"] | null
          service_price: number | null
          service_product_price: number | null
          tax_reduction_factor: number | null
          tax_regime: Database["public"]["Enums"]["tax_regime"]
          tenant_id: string
          total_credit_cbs: number | null
          total_credit_ibs: number | null
          total_credit_icms: number | null
          total_credit_ipi: number | null
          total_credit_pis_cofins: number | null
          total_labor_gross: number | null
          total_labor_net: number | null
          total_material_cost_gross: number | null
          total_material_cost_net: number | null
          total_material_ipi_cost: number | null
          updated_at: string | null
          val_commission: number | null
          val_csll: number | null
          val_financial_expense: number | null
          val_fixed_expense: number | null
          val_icms: number | null
          val_indirect_labor: number | null
          val_irpj: number | null
          val_irpj_additional: number | null
          val_iss: number | null
          val_pis_cofins: number | null
          val_profit: number | null
          val_taxable_regime: number | null
          val_variable_expense: number | null
          version: number | null
        }
        Insert: {
          buyer_type?: Database["public"]["Enums"]["buyer_type_enum"] | null
          calc_type: Database["public"]["Enums"]["calc_type"]
          calculated_at?: string | null
          cbs_active?: boolean | null
          cbs_debit_value?: number | null
          cbs_rate?: number | null
          cbs_to_collect?: number | null
          cmv?: number | null
          coefficient?: number | null
          created_at?: string | null
          destination_state?: string | null
          difal_value?: number | null
          ibs_active?: boolean | null
          ibs_debit_value?: number | null
          ibs_rate?: number | null
          ibs_to_collect?: number | null
          icms_active?: boolean | null
          icms_rate_applied?: number | null
          icms_sale_rate?: number | null
          id?: string
          ipi_output_active?: boolean | null
          ipi_output_rate?: number | null
          ipi_output_value?: number | null
          is_monofasico_applied?: boolean | null
          is_st_applied?: boolean | null
          iss_active?: boolean | null
          iss_sale_rate?: number | null
          pct_commission?: number | null
          pct_csll?: number | null
          pct_financial_expense?: number | null
          pct_fixed_expense?: number | null
          pct_icms?: number | null
          pct_indirect_labor?: number | null
          pct_irpj?: number | null
          pct_irpj_additional?: number | null
          pct_iss?: number | null
          pct_labor_cost?: number | null
          pct_material_cost?: number | null
          pct_pis_cofins?: number | null
          pct_profit_margin?: number | null
          pct_taxable_regime?: number | null
          pct_variable_expense?: number | null
          pis_cofins_active?: boolean | null
          pis_cofins_sale_rate?: number | null
          product_id: string
          product_workload?: number | null
          product_workload_price?: number | null
          recalculated?: boolean | null
          sale_price_internal?: number | null
          sale_price_per_unit?: number | null
          sale_price_total?: number | null
          sale_scope?: Database["public"]["Enums"]["sale_scope"] | null
          service_price?: number | null
          service_product_price?: number | null
          tax_reduction_factor?: number | null
          tax_regime: Database["public"]["Enums"]["tax_regime"]
          tenant_id: string
          total_credit_cbs?: number | null
          total_credit_ibs?: number | null
          total_credit_icms?: number | null
          total_credit_ipi?: number | null
          total_credit_pis_cofins?: number | null
          total_labor_gross?: number | null
          total_labor_net?: number | null
          total_material_cost_gross?: number | null
          total_material_cost_net?: number | null
          total_material_ipi_cost?: number | null
          updated_at?: string | null
          val_commission?: number | null
          val_csll?: number | null
          val_financial_expense?: number | null
          val_fixed_expense?: number | null
          val_icms?: number | null
          val_indirect_labor?: number | null
          val_irpj?: number | null
          val_irpj_additional?: number | null
          val_iss?: number | null
          val_pis_cofins?: number | null
          val_profit?: number | null
          val_taxable_regime?: number | null
          val_variable_expense?: number | null
          version?: number | null
        }
        Update: {
          buyer_type?: Database["public"]["Enums"]["buyer_type_enum"] | null
          calc_type?: Database["public"]["Enums"]["calc_type"]
          calculated_at?: string | null
          cbs_active?: boolean | null
          cbs_debit_value?: number | null
          cbs_rate?: number | null
          cbs_to_collect?: number | null
          cmv?: number | null
          coefficient?: number | null
          created_at?: string | null
          destination_state?: string | null
          difal_value?: number | null
          ibs_active?: boolean | null
          ibs_debit_value?: number | null
          ibs_rate?: number | null
          ibs_to_collect?: number | null
          icms_active?: boolean | null
          icms_rate_applied?: number | null
          icms_sale_rate?: number | null
          id?: string
          ipi_output_active?: boolean | null
          ipi_output_rate?: number | null
          ipi_output_value?: number | null
          is_monofasico_applied?: boolean | null
          is_st_applied?: boolean | null
          iss_active?: boolean | null
          iss_sale_rate?: number | null
          pct_commission?: number | null
          pct_csll?: number | null
          pct_financial_expense?: number | null
          pct_fixed_expense?: number | null
          pct_icms?: number | null
          pct_indirect_labor?: number | null
          pct_irpj?: number | null
          pct_irpj_additional?: number | null
          pct_iss?: number | null
          pct_labor_cost?: number | null
          pct_material_cost?: number | null
          pct_pis_cofins?: number | null
          pct_profit_margin?: number | null
          pct_taxable_regime?: number | null
          pct_variable_expense?: number | null
          pis_cofins_active?: boolean | null
          pis_cofins_sale_rate?: number | null
          product_id?: string
          product_workload?: number | null
          product_workload_price?: number | null
          recalculated?: boolean | null
          sale_price_internal?: number | null
          sale_price_per_unit?: number | null
          sale_price_total?: number | null
          sale_scope?: Database["public"]["Enums"]["sale_scope"] | null
          service_price?: number | null
          service_product_price?: number | null
          tax_reduction_factor?: number | null
          tax_regime?: Database["public"]["Enums"]["tax_regime"]
          tenant_id?: string
          total_credit_cbs?: number | null
          total_credit_ibs?: number | null
          total_credit_icms?: number | null
          total_credit_ipi?: number | null
          total_credit_pis_cofins?: number | null
          total_labor_gross?: number | null
          total_labor_net?: number | null
          total_material_cost_gross?: number | null
          total_material_cost_net?: number | null
          total_material_ipi_cost?: number | null
          updated_at?: string | null
          val_commission?: number | null
          val_csll?: number | null
          val_financial_expense?: number | null
          val_fixed_expense?: number | null
          val_icms?: number | null
          val_indirect_labor?: number | null
          val_irpj?: number | null
          val_irpj_additional?: number | null
          val_iss?: number | null
          val_pis_cofins?: number | null
          val_profit?: number | null
          val_taxable_regime?: number | null
          val_variable_expense?: number | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_calculations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_calculations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_history: {
        Row: {
          cmv: number
          coefficient: number
          created_at: string | null
          id: string
          pricing_calculation_id: string | null
          product_id: string
          sale_price_total: number
          snapshot_json: Json | null
          tax_regime: Database["public"]["Enums"]["tax_regime"]
          tenant_id: string
        }
        Insert: {
          cmv: number
          coefficient: number
          created_at?: string | null
          id?: string
          pricing_calculation_id?: string | null
          product_id: string
          sale_price_total: number
          snapshot_json?: Json | null
          tax_regime: Database["public"]["Enums"]["tax_regime"]
          tenant_id: string
        }
        Update: {
          cmv?: number
          coefficient?: number
          created_at?: string | null
          id?: string
          pricing_calculation_id?: string | null
          product_id?: string
          sale_price_total?: number
          snapshot_json?: Json | null
          tax_regime?: Database["public"]["Enums"]["tax_regime"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_history_pricing_calculation_id_fkey"
            columns: ["pricing_calculation_id"]
            isOneToOne: false
            referencedRelation: "pricing_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_items: {
        Row: {
          created_at: string
          credit_cbs: number | null
          credit_ibs: number | null
          credit_icms: number | null
          credit_ipi: number | null
          credit_pis_cofins: number | null
          id: string
          item_cost_gross: number | null
          item_cost_net: number | null
          item_id: string
          product_id: string
          quantity_needed: number
          total_credits: number | null
        }
        Insert: {
          created_at?: string
          credit_cbs?: number | null
          credit_ibs?: number | null
          credit_icms?: number | null
          credit_ipi?: number | null
          credit_pis_cofins?: number | null
          id?: string
          item_cost_gross?: number | null
          item_cost_net?: number | null
          item_id: string
          product_id: string
          quantity_needed?: number
          total_credits?: number | null
        }
        Update: {
          created_at?: string
          credit_cbs?: number | null
          credit_ibs?: number | null
          credit_icms?: number | null
          credit_ipi?: number | null
          credit_pis_cofins?: number | null
          id?: string
          item_cost_gross?: number | null
          item_cost_net?: number | null
          item_id?: string
          product_id?: string
          quantity_needed?: number
          total_credits?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_items: {
        Row: {
          id: string
          item_id: string
          production_id: string
          quantity_used: number
          unit: string | null
        }
        Insert: {
          id?: string
          item_id: string
          production_id: string
          quantity_used: number
          unit?: string | null
        }
        Update: {
          id?: string
          item_id?: string
          production_id?: string
          quantity_used?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_items_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      productions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_item_id: string | null
          code: string | null
          cost_total: number | null
          created_at: string
          description: string | null
          id: string
          name: string
          nbs_code: string | null
          ncm_code: string | null
          price_table_a: number | null
          price_table_b: number | null
          price_table_c: number | null
          price_table_d: number | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          sale_price: number
          sku: string | null
          tenant_id: string
          unit: Database["public"]["Enums"]["unit_measure"] | null
          updated_at: string
          yield_quantity: number | null
          yield_unit: Database["public"]["Enums"]["unit_measure"] | null
        }
        Insert: {
          base_item_id?: string | null
          code?: string | null
          cost_total?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          nbs_code?: string | null
          ncm_code?: string | null
          price_table_a?: number | null
          price_table_b?: number | null
          price_table_c?: number | null
          price_table_d?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          sale_price?: number
          sku?: string | null
          tenant_id: string
          unit?: Database["public"]["Enums"]["unit_measure"] | null
          updated_at?: string
          yield_quantity?: number | null
          yield_unit?: Database["public"]["Enums"]["unit_measure"] | null
        }
        Update: {
          base_item_id?: string | null
          code?: string | null
          cost_total?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          nbs_code?: string | null
          ncm_code?: string | null
          price_table_a?: number | null
          price_table_b?: number | null
          price_table_c?: number | null
          price_table_d?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          sale_price?: number
          sku?: string | null
          tenant_id?: string
          unit?: Database["public"]["Enums"]["unit_measure"] | null
          updated_at?: string
          yield_quantity?: number | null
          yield_unit?: Database["public"]["Enums"]["unit_measure"] | null
        }
        Relationships: [
          {
            foreignKeyName: "products_base_item_id_fkey"
            columns: ["base_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          created_by: string | null
          data_blob: Json | null
          file_url: string | null
          filters_used: Json | null
          generated_at: string
          id: string
          report_type: string
          tenant_id: string
        }
        Insert: {
          created_by?: string | null
          data_blob?: Json | null
          file_url?: string | null
          filters_used?: Json | null
          generated_at?: string
          id?: string
          report_type: string
          tenant_id: string
        }
        Update: {
          created_by?: string | null
          data_blob?: Json | null
          file_url?: string | null
          filters_used?: Json | null
          generated_at?: string
          id?: string
          report_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string | null
          description: string | null
          discount: number | null
          id: string
          product_id: string | null
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount?: number | null
          id?: string
          product_id?: string | null
          quantity?: number
          sale_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount?: number | null
          id?: string
          product_id?: string | null
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          budget_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          final_value: number
          id: string
          installments: number | null
          invoice_number: string | null
          order_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          product_id: string | null
          quantity: number | null
          sale_date: string
          sale_type: string | null
          status: string | null
          tenant_id: string
          unit_price: number | null
        }
        Insert: {
          budget_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          final_value: number
          id?: string
          installments?: number | null
          invoice_number?: string | null
          order_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          product_id?: string | null
          quantity?: number | null
          sale_date?: string
          sale_type?: string | null
          status?: string | null
          tenant_id: string
          unit_price?: number | null
        }
        Update: {
          budget_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          final_value?: number
          id?: string
          installments?: number | null
          invoice_number?: string | null
          order_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          product_id?: string | null
          quantity?: number | null
          sale_date?: string
          sale_type?: string | null
          status?: string | null
          tenant_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      simples_nacional_brackets: {
        Row: {
          anexo: string
          bracket_order: number
          cofins_percent: number | null
          cpp_percent: number | null
          csll_percent: number | null
          deduction: number
          icms_percent: number | null
          id: number
          ipi_percent: number | null
          irpj_percent: number | null
          iss_percent: number | null
          nominal_rate: number
          pis_percent: number | null
          revenue_max: number
          revenue_min: number
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          anexo: string
          bracket_order: number
          cofins_percent?: number | null
          cpp_percent?: number | null
          csll_percent?: number | null
          deduction?: number
          icms_percent?: number | null
          id?: number
          ipi_percent?: number | null
          irpj_percent?: number | null
          iss_percent?: number | null
          nominal_rate: number
          pis_percent?: number | null
          revenue_max: number
          revenue_min: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          anexo?: string
          bracket_order?: number
          cofins_percent?: number | null
          cpp_percent?: number | null
          csll_percent?: number | null
          deduction?: number
          icms_percent?: number | null
          id?: number
          ipi_percent?: number | null
          irpj_percent?: number | null
          iss_percent?: number | null
          nominal_rate?: number
          pis_percent?: number | null
          revenue_max?: number
          revenue_min?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      stock: {
        Row: {
          created_at: string | null
          id: string
          item_id: string | null
          min_limit: number | null
          product_id: string | null
          quantity_current: number | null
          stock_type: Database["public"]["Enums"]["stock_type"] | null
          tenant_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id?: string | null
          min_limit?: number | null
          product_id?: string | null
          quantity_current?: number | null
          stock_type?: Database["public"]["Enums"]["stock_type"] | null
          tenant_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string | null
          min_limit?: number | null
          product_id?: string | null
          quantity_current?: number | null
          stock_type?: Database["public"]["Enums"]["stock_type"] | null
          tenant_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta_quantity: number
          id: string
          reason: string | null
          stock_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta_quantity: number
          id?: string
          reason?: string | null
          stock_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta_quantity?: number
          id?: string
          reason?: string | null
          stock_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stock"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          cnpj_cpf: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          observation: string | null
          phone: string | null
          state_code: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          cnpj_cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          observation?: string | null
          phone?: string | null
          state_code?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          cnpj_cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          observation?: string | null
          phone?: string | null
          state_code?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_update_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          payload: Json | null
          records_updated: number | null
          source: string
          started_at: string | null
          status: Database["public"]["Enums"]["tax_update_status"] | null
          table_affected: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          records_updated?: number | null
          source: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["tax_update_status"] | null
          table_affected: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          records_updated?: number | null
          source?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["tax_update_status"] | null
          table_affected?: string
        }
        Relationships: []
      }
      tenant_expense_config: {
        Row: {
          commission_percent: number | null
          financial_expense_percent: number | null
          fixed_expense_percent: number | null
          id: string
          indirect_labor_percent: number | null
          production_labor_cost: number | null
          production_labor_percent: number | null
          profit_margin_percent: number | null
          taxable_regime_percent: number | null
          tenant_id: string
          updated_at: string | null
          variable_expense_percent: number | null
        }
        Insert: {
          commission_percent?: number | null
          financial_expense_percent?: number | null
          fixed_expense_percent?: number | null
          id?: string
          indirect_labor_percent?: number | null
          production_labor_cost?: number | null
          production_labor_percent?: number | null
          profit_margin_percent?: number | null
          taxable_regime_percent?: number | null
          tenant_id: string
          updated_at?: string | null
          variable_expense_percent?: number | null
        }
        Update: {
          commission_percent?: number | null
          financial_expense_percent?: number | null
          fixed_expense_percent?: number | null
          id?: string
          indirect_labor_percent?: number | null
          production_labor_cost?: number | null
          production_labor_percent?: number | null
          profit_margin_percent?: number | null
          taxable_regime_percent?: number | null
          tenant_id?: string
          updated_at?: string | null
          variable_expense_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_expense_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          buyer_type: string | null
          calc_type: Database["public"]["Enums"]["calc_type"] | null
          cnae_allows_ipi_credit: boolean | null
          cnae_code: string | null
          created_at: string
          currency: string | null
          icms_contribuinte: boolean | null
          id: string
          ie_state_code: string | null
          inscricao_estadual: string | null
          iss_municipality_rate: number | null
          logo_url: string | null
          lucro_presumido_activity: string | null
          monthly_workload: number | null
          n8n_webhook_url: string | null
          administrative_monthly_workload: number | null
          num_administrative_employees: number | null
          num_commercial_employees: number | null
          num_productive_employees: number | null
          onboarding_mirrored_to_cashflow: boolean | null
          sales_scope: string | null
          simples_anexo: string | null
          simples_revenue_12m: number | null
          state_code: string | null
          tax_reduction_factor: number | null
          tax_regime: Database["public"]["Enums"]["tax_regime"] | null
          tenant_id: string
          updated_at: string
          whatsapp_connected: boolean | null
          whatsapp_phone: string | null
          workload_unit: Database["public"]["Enums"]["workload_unit"] | null
        }
        Insert: {
          buyer_type?: string | null
          calc_type?: Database["public"]["Enums"]["calc_type"] | null
          cnae_allows_ipi_credit?: boolean | null
          cnae_code?: string | null
          created_at?: string
          currency?: string | null
          icms_contribuinte?: boolean | null
          id?: string
          ie_state_code?: string | null
          inscricao_estadual?: string | null
          iss_municipality_rate?: number | null
          logo_url?: string | null
          lucro_presumido_activity?: string | null
          monthly_workload?: number | null
          n8n_webhook_url?: string | null
          administrative_monthly_workload?: number | null
          num_administrative_employees?: number | null
          num_commercial_employees?: number | null
          num_productive_employees?: number | null
          onboarding_mirrored_to_cashflow?: boolean | null
          sales_scope?: string | null
          simples_anexo?: string | null
          simples_revenue_12m?: number | null
          state_code?: string | null
          tax_reduction_factor?: number | null
          tax_regime?: Database["public"]["Enums"]["tax_regime"] | null
          tenant_id: string
          updated_at?: string
          whatsapp_connected?: boolean | null
          whatsapp_phone?: string | null
          workload_unit?: Database["public"]["Enums"]["workload_unit"] | null
        }
        Update: {
          buyer_type?: string | null
          calc_type?: Database["public"]["Enums"]["calc_type"] | null
          cnae_allows_ipi_credit?: boolean | null
          cnae_code?: string | null
          created_at?: string
          currency?: string | null
          icms_contribuinte?: boolean | null
          id?: string
          ie_state_code?: string | null
          inscricao_estadual?: string | null
          iss_municipality_rate?: number | null
          logo_url?: string | null
          lucro_presumido_activity?: string | null
          monthly_workload?: number | null
          n8n_webhook_url?: string | null
          administrative_monthly_workload?: number | null
          num_administrative_employees?: number | null
          num_commercial_employees?: number | null
          num_productive_employees?: number | null
          onboarding_mirrored_to_cashflow?: boolean | null
          sales_scope?: string | null
          simples_anexo?: string | null
          simples_revenue_12m?: number | null
          state_code?: string | null
          tax_reduction_factor?: number | null
          tax_regime?: Database["public"]["Enums"]["tax_regime"] | null
          tenant_id?: string
          updated_at?: string
          whatsapp_connected?: boolean | null
          whatsapp_phone?: string | null
          workload_unit?: Database["public"]["Enums"]["workload_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          cep: string | null
          city: string | null
          cnpj_cpf: string | null
          complement: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          neighborhood: string | null
          number: string | null
          phone: string | null
          plan_status: Database["public"]["Enums"]["plan_status"] | null
          segment: string | null
          state_code: string | null
          street: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          city?: string | null
          cnpj_cpf?: string | null
          complement?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          neighborhood?: string | null
          number?: string | null
          phone?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"] | null
          segment?: string | null
          state_code?: string | null
          street?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          city?: string | null
          cnpj_cpf?: string | null
          complement?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          neighborhood?: string | null
          number?: string | null
          phone?: string | null
          plan_status?: Database["public"]["Enums"]["plan_status"] | null
          segment?: string | null
          state_code?: string | null
          street?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_item_access: {
        Row: {
          access_all_items: boolean | null
          created_at: string | null
          granted_by: string
          id: string
          item_id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          access_all_items?: boolean | null
          created_at?: string | null
          granted_by: string
          id?: string
          item_id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          access_all_items?: boolean | null
          created_at?: string | null
          granted_by?: string
          id?: string
          item_id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_item_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_item_access_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_item_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_item_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_permissions: {
        Row: {
          can_edit: boolean | null
          can_view: boolean | null
          created_at: string | null
          granted_by: string
          id: string
          module: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          granted_by: string
          id?: string
          module: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          granted_by?: string
          id?: string
          module?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          granted_at: string
          id: string
          permission_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          permission_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          permission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_price_table_access: {
        Row: {
          created_at: string
          id: string
          max_discount_percent: number | null
          price_table: Database["public"]["Enums"]["price_table_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_discount_percent?: number | null
          price_table: Database["public"]["Enums"]["price_table_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_discount_percent?: number | null
          price_table?: Database["public"]["Enums"]["price_table_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_price_table_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          device_info: string | null
          id: string
          ip_address: string | null
          login_at: string
          user_id: string
        }
        Insert: {
          device_info?: string | null
          id?: string
          ip_address?: string | null
          login_at?: string
          user_id: string
        }
        Update: {
          device_info?: string | null
          id?: string
          ip_address?: string | null
          login_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          can_give_discount: boolean | null
          cpf: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean | null
          is_super_admin: boolean | null
          max_discount_percent: number | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string
          updated_at: string
          whatsapp_connected: boolean | null
          work_schedule: Json | null
        }
        Insert: {
          avatar_url?: string | null
          can_give_discount?: boolean | null
          cpf?: string | null
          created_at?: string
          email: string
          id: string
          is_active?: boolean | null
          is_super_admin?: boolean | null
          max_discount_percent?: number | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id: string
          updated_at?: string
          whatsapp_connected?: boolean | null
          work_schedule?: Json | null
        }
        Update: {
          avatar_url?: string | null
          can_give_discount?: boolean | null
          cpf?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean | null
          is_super_admin?: boolean | null
          max_discount_percent?: number | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          tenant_id?: string
          updated_at?: string
          whatsapp_connected?: boolean | null
          work_schedule?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_dispatches: {
        Row: {
          budget_id: string | null
          calendar_event_id: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          message_body: string | null
          phone: string
          read_at: string | null
          sent_at: string | null
          sent_by: string
          status: Database["public"]["Enums"]["dispatch_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["dispatch_type"]
        }
        Insert: {
          budget_id?: string | null
          calendar_event_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_body?: string | null
          phone: string
          read_at?: string | null
          sent_at?: string | null
          sent_by: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          tenant_id: string
          type?: Database["public"]["Enums"]["dispatch_type"]
        }
        Update: {
          budget_id?: string | null
          calendar_event_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_body?: string | null
          phone?: string
          read_at?: string | null
          sent_at?: string | null
          sent_by?: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          tenant_id?: string
          type?: Database["public"]["Enums"]["dispatch_type"]
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_dispatches_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_dispatches_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_dispatches_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_dispatches_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_dispatches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calc_irpj_csll_equiv: {
        Args: { p_profit_value: number; p_sale_price: number }
        Returns: {
          pct_csll: number
          pct_irpj: number
          pct_irpj_add: number
        }[]
      }
      calc_item_net_cost: { Args: { p_item_id: string }; Returns: number }
      calc_simples_effective_rate: {
        Args: { p_anexo: string; p_revenue_12m: number }
        Returns: number
      }
      get_auth_tenant_id: { Args: never; Returns: string }
      get_my_tenant_id: { Args: never; Returns: string }
      invite_user_to_tenant: {
        Args: {
          p_email: string
          p_role?: Database["public"]["Enums"]["user_role"]
        }
        Returns: string
      }
      is_admin_or_manager: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      allocation_status: "RESERVED" | "PICKED" | "CANCELLED"
      automation_action: "SEND_EMAIL" | "SEND_WHATSAPP" | "CREATE_TASK"
      automation_trigger:
        | "BUDGET_EXPIRED"
        | "BUDGET_CREATED"
        | "SALE_COMPLETED"
        | "STOCK_LOW"
      budget_status:
        | "DRAFT"
        | "AWAITING_PAYMENT"
        | "SENT"
        | "APPROVED"
        | "EXPIRED"
        | "REJECTED"
        | "PAID"
      buyer_type_enum: "CONSUMIDOR_FINAL" | "CONTRIBUINTE_PJ"
      calc_type: "INDUSTRIALIZACAO" | "SERVICO" | "REVENDA"
      cash_category_type: "REVENUE" | "EXPENSE"
      cash_direction: "INCOME" | "EXPENSE"
      dispatch_status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"
      dispatch_type: "MESSAGE" | "BUDGET" | "REMINDER" | "MARKETING"
      event_status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED"
      event_type:
        | "SERVICE"
        | "MEETING"
        | "DELIVERY"
        | "FOLLOW_UP"
        | "REMINDER"
        | "OTHER"
      ipi_treatment: "CREDITO" | "CUSTO" | "ISENTO" | "NAO_APLICAVEL"
      item_type: "INSUMO" | "REVENDA" | "EMBALAGEM"
      order_status:
        | "PENDING"
        | "APPROVED"
        | "PROCESSING"
        | "SHIPPED"
        | "DELIVERED"
        | "CANCELLED"
      payment_method:
        | "PIX"
        | "DINHEIRO"
        | "CARTAO_CREDITO"
        | "CARTAO_DEBITO"
        | "BOLETO"
        | "TRANSFERENCIA"
      permission_module:
        | "DASHBOARD"
        | "SALES"
        | "PRODUCTS"
        | "FINANCIAL"
        | "SETTINGS"
        | "USERS"
      pis_cofins_regime:
        | "CUMULATIVO"
        | "NAO_CUMULATIVO"
        | "MONOFASICO"
        | "ISENTO"
      plan_status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED"
      price_table_type: "A" | "B" | "C" | "D"
      product_type: "PRODUZIDO" | "REVENDA"
      sale_scope: "INTRAESTADUAL" | "INTERESTADUAL"
      stock_type: "ITEM" | "PRODUCT"
      tax_regime:
        | "SIMPLES_NACIONAL"
        | "LUCRO_PRESUMIDO"
        | "LUCRO_REAL"
        | "MEI"
        | "SIMPLES_HIBRIDO"
        | "LUCRO_PRESUMIDO_RET"
      tax_type:
        | "ICMS"
        | "IPI"
        | "PIS"
        | "COFINS"
        | "ISS"
        | "PIS_COFINS"
        | "CSLL"
        | "IRPJ"
        | "CBS"
        | "IBS"
        | "IS"
      tax_update_status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
      unit_measure:
        | "UN"
        | "KG"
        | "L"
        | "M"
        | "M2"
        | "M3"
        | "H"
        | "MIN"
        | "G"
        | "ML"
        | "CM"
        | "MM"
        | "KM"
        | "W"
      user_role: "super_admin" | "admin" | "user"
      workload_unit: "MINUTES" | "HOURS" | "DAYS" | "ACTIVITIES"
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
      allocation_status: ["RESERVED", "PICKED", "CANCELLED"],
      automation_action: ["SEND_EMAIL", "SEND_WHATSAPP", "CREATE_TASK"],
      automation_trigger: [
        "BUDGET_EXPIRED",
        "BUDGET_CREATED",
        "SALE_COMPLETED",
        "STOCK_LOW",
      ],
      budget_status: [
        "DRAFT",
        "AWAITING_PAYMENT",
        "SENT",
        "APPROVED",
        "EXPIRED",
        "REJECTED",
        "PAID",
      ],
      buyer_type_enum: ["CONSUMIDOR_FINAL", "CONTRIBUINTE_PJ"],
      calc_type: ["INDUSTRIALIZACAO", "SERVICO", "REVENDA"],
      cash_category_type: ["REVENUE", "EXPENSE"],
      cash_direction: ["INCOME", "EXPENSE"],
      dispatch_status: ["PENDING", "SENT", "DELIVERED", "READ", "FAILED"],
      dispatch_type: ["MESSAGE", "BUDGET", "REMINDER", "MARKETING"],
      event_status: ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"],
      event_type: [
        "SERVICE",
        "MEETING",
        "DELIVERY",
        "FOLLOW_UP",
        "REMINDER",
        "OTHER",
      ],
      ipi_treatment: ["CREDITO", "CUSTO", "ISENTO", "NAO_APLICAVEL"],
      item_type: ["INSUMO", "REVENDA", "EMBALAGEM"],
      order_status: [
        "PENDING",
        "APPROVED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ],
      payment_method: [
        "PIX",
        "DINHEIRO",
        "CARTAO_CREDITO",
        "CARTAO_DEBITO",
        "BOLETO",
        "TRANSFERENCIA",
      ],
      permission_module: [
        "DASHBOARD",
        "SALES",
        "PRODUCTS",
        "FINANCIAL",
        "SETTINGS",
        "USERS",
      ],
      pis_cofins_regime: [
        "CUMULATIVO",
        "NAO_CUMULATIVO",
        "MONOFASICO",
        "ISENTO",
      ],
      plan_status: ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"],
      price_table_type: ["A", "B", "C", "D"],
      product_type: ["PRODUZIDO", "REVENDA"],
      sale_scope: ["INTRAESTADUAL", "INTERESTADUAL"],
      stock_type: ["ITEM", "PRODUCT"],
      tax_regime: [
        "SIMPLES_NACIONAL",
        "LUCRO_PRESUMIDO",
        "LUCRO_REAL",
        "MEI",
        "SIMPLES_HIBRIDO",
        "LUCRO_PRESUMIDO_RET",
      ],
      tax_type: [
        "ICMS",
        "IPI",
        "PIS",
        "COFINS",
        "ISS",
        "PIS_COFINS",
        "CSLL",
        "IRPJ",
        "CBS",
        "IBS",
        "IS",
      ],
      tax_update_status: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      unit_measure: [
        "UN",
        "KG",
        "L",
        "M",
        "M2",
        "M3",
        "H",
        "MIN",
        "G",
        "ML",
        "CM",
        "MM",
        "KM",
        "W",
      ],
      user_role: ["super_admin", "admin", "user"],
      workload_unit: ["MINUTES", "HOURS", "DAYS", "ACTIVITIES"],
    },
  },
} as const

