/**
 * ORVA Store — Supabase Database Types
 * Project Ref: olmsjkhdfghyydogcvvy
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          display_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          display_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          display_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      collections: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          display_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          display_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          display_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          slug: string;
          sku: string | null;
          name: string;
          name_fr: string | null;
          short_description: string | null;
          description: string | null;
          category_id: string | null;
          base_price: number;
          original_price: number | null;
          savings: number;
          currency: string;
          status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
          is_featured: boolean;
          stock_quantity: number;
          story: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          sku?: string | null;
          name: string;
          name_fr?: string | null;
          short_description?: string | null;
          description?: string | null;
          category_id?: string | null;
          base_price: number;
          original_price?: number | null;
          savings?: number;
          currency?: string;
          status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
          is_featured?: boolean;
          stock_quantity?: number;
          story?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          sku?: string | null;
          name?: string;
          name_fr?: string | null;
          short_description?: string | null;
          description?: string | null;
          category_id?: string | null;
          base_price?: number;
          original_price?: number | null;
          savings?: number;
          currency?: string;
          status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
          is_featured?: boolean;
          stock_quantity?: number;
          story?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_collections: {
        Row: {
          product_id: string;
          collection_id: string;
        };
        Insert: {
          product_id: string;
          collection_id: string;
        };
        Update: {
          product_id?: string;
          collection_id?: string;
        };
      };
      variants: {
        Row: {
          id: string;
          product_id: string;
          label: string;
          sku: string | null;
          price_override: number | null;
          stock: number;
          is_available: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          label: string;
          sku?: string | null;
          price_override?: number | null;
          stock?: number;
          is_available?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          label?: string;
          sku?: string | null;
          price_override?: number | null;
          stock?: number;
          is_available?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_media: {
        Row: {
          id: string;
          product_id: string | null;
          variant_id: string | null;
          url: string;
          role: 'COVER' | 'GALLERY' | 'DETAIL' | 'VARIANT' | 'LIFESTYLE' | 'BACKGROUND' | 'EDITORIAL';
          alt_text: string | null;
          display_order: number;
          is_archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          url: string;
          role?: 'COVER' | 'GALLERY' | 'DETAIL' | 'VARIANT' | 'LIFESTYLE' | 'BACKGROUND' | 'EDITORIAL';
          alt_text?: string | null;
          display_order?: number;
          is_archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          url?: string;
          role?: 'COVER' | 'GALLERY' | 'DETAIL' | 'VARIANT' | 'LIFESTYLE' | 'BACKGROUND' | 'EDITORIAL';
          alt_text?: string | null;
          display_order?: number;
          is_archived?: boolean;
          created_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string;
          phone2: string | null;
          email: string | null;
          wilaya: string | null;
          commune: string | null;
          address: string | null;
          notes: string | null;
          orders_count: number;
          total_spent: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          phone2?: string | null;
          email?: string | null;
          wilaya?: string | null;
          commune?: string | null;
          address?: string | null;
          notes?: string | null;
          orders_count?: number;
          total_spent?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          phone2?: string | null;
          email?: string | null;
          wilaya?: string | null;
          commune?: string | null;
          address?: string | null;
          notes?: string | null;
          orders_count?: number;
          total_spent?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          customer_phone2: string | null;
          wilaya_code: number;
          wilaya_name: string;
          commune_name: string;
          delivery_wilaya: string;
          delivery_commune: string;
          delivery_method: 'DOMICILE' | 'STOP_DESK';
          delivery_type: 'DOMICILE' | 'STOP_DESK';
          delivery_address: string | null;
          origin_hub: string;
          delivery_fee: number;
          shipping_fee?: number;
          subtotal: number;
          total: number;
          currency: string;
          status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_TO_SHIP' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
          payment_method: string;
          payment_status: 'UNPAID' | 'PAID';
          tracking_code: string | null;
          tracking_url: string | null;
          courier_provider: string;
          risk_score: number;
          risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
          risk_decision: 'ACCEPT' | 'REVIEW' | 'REJECT';
          risk_reasons: Json;
          customer_notes: string | null;
          operator_notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          customer_id?: string | null;
          customer_name: string;
          customer_phone: string;
          customer_phone2?: string | null;
          wilaya_code: number;
          wilaya_name: string;
          commune_name: string;
          delivery_wilaya?: string;
          delivery_commune?: string;
          delivery_method?: 'DOMICILE' | 'STOP_DESK';
          delivery_type?: 'DOMICILE' | 'STOP_DESK';
          delivery_address?: string | null;
          origin_hub?: string;
          delivery_fee?: number;
          shipping_fee?: number;
          subtotal?: number;
          total: number;
          currency?: string;
          status?: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_TO_SHIP' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
          payment_method?: string;
          payment_status?: 'UNPAID' | 'PAID';
          tracking_code?: string | null;
          tracking_url?: string | null;
          courier_provider?: string;
          risk_score?: number;
          risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
          risk_decision?: 'ACCEPT' | 'REVIEW' | 'REJECT';
          risk_reasons?: Json;
          customer_notes?: string | null;
          operator_notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          customer_phone2?: string | null;
          wilaya_code?: number;
          wilaya_name?: string;
          commune_name?: string;
          delivery_wilaya?: string;
          delivery_commune?: string;
          delivery_method?: 'DOMICILE' | 'STOP_DESK';
          delivery_type?: 'DOMICILE' | 'STOP_DESK';
          delivery_address?: string | null;
          origin_hub?: string;
          delivery_fee?: number;
          shipping_fee?: number;
          subtotal?: number;
          total?: number;
          currency?: string;
          status?: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY_TO_SHIP' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
          payment_method?: string;
          payment_status?: 'UNPAID' | 'PAID';
          tracking_code?: string | null;
          tracking_url?: string | null;
          courier_provider?: string;
          risk_score?: number;
          risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
          risk_decision?: 'ACCEPT' | 'REVIEW' | 'REJECT';
          risk_reasons?: Json;
          customer_notes?: string | null;
          operator_notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          variant_id: string | null;
          pack_id: 'PACK1' | 'PACK2' | 'PACK3' | null;
          product_name_snapshot: string;
          variant_label_snapshot: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          variant_id?: string | null;
          pack_id?: 'PACK1' | 'PACK2' | 'PACK3' | null;
          product_name_snapshot: string;
          variant_label_snapshot?: string | null;
          unit_price: number;
          quantity?: number;
          line_total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          pack_id?: 'PACK1' | 'PACK2' | 'PACK3' | null;
          product_name_snapshot?: string;
          variant_label_snapshot?: string | null;
          unit_price?: number;
          quantity?: number;
          line_total?: number;
          created_at?: string;
        };
      };
      deliveries: {
        Row: {
          id: string;
          order_id: string;
          provider: string;
          tracking_number: string | null;
          tracking_url: string | null;
          status: 'PENDING' | 'CREATED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RETURNED' | 'CANCELLED';
          raw_response: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          provider?: string;
          tracking_number?: string | null;
          tracking_url?: string | null;
          status?: 'PENDING' | 'CREATED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RETURNED' | 'CANCELLED';
          raw_response?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          provider?: string;
          tracking_number?: string | null;
          tracking_url?: string | null;
          status?: 'PENDING' | 'CREATED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RETURNED' | 'CANCELLED';
          raw_response?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_timeline_events: {
        Row: {
          id: string;
          order_id: string;
          event_type: string;
          title: string;
          description: string | null;
          actor: string;
          tracking_number: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          event_type: string;
          title: string;
          description?: string | null;
          actor?: string;
          tracking_number?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          event_type?: string;
          title?: string;
          description?: string | null;
          actor?: string;
          tracking_number?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      cod_reconciliations: {
        Row: {
          id: string;
          order_id: string;
          expected_amount: number;
          collected_amount: number;
          difference: number;
          status: 'PENDING' | 'COLLECTED' | 'RECONCILED' | 'DISCREPANCY';
          reconciled_at: string | null;
          reconciled_by: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          expected_amount: number;
          collected_amount?: number;
          difference?: number;
          status?: 'PENDING' | 'COLLECTED' | 'RECONCILED' | 'DISCREPANCY';
          reconciled_at?: string | null;
          reconciled_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          expected_amount?: number;
          collected_amount?: number;
          difference?: number;
          status?: 'PENDING' | 'COLLECTED' | 'RECONCILED' | 'DISCREPANCY';
          reconciled_at?: string | null;
          reconciled_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_conversions: {
        Row: {
          id: string;
          order_id: string;
          conversion_sequence: number;
          timestamp_utc: string;
          operator: string;
          reason: string;
          override_applied: boolean;
          previous_customer_name: string | null;
          new_customer_name: string | null;
          previous_phone: string | null;
          new_phone: string | null;
          previous_wilaya: string | null;
          new_wilaya: string | null;
          previous_commune: string | null;
          new_commune: string | null;
          previous_delivery_type: string | null;
          new_delivery_type: string | null;
          previous_shipping_fee: number | null;
          new_shipping_fee: number | null;
          previous_total: number | null;
          new_total: number | null;
          financial_difference: number;
          formatted_courier_note: string | null;
          courier_tracking_code: string | null;
          diff: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          conversion_sequence?: number;
          timestamp_utc?: string;
          operator?: string;
          reason: string;
          override_applied?: boolean;
          previous_customer_name?: string | null;
          new_customer_name?: string | null;
          previous_phone?: string | null;
          new_phone?: string | null;
          previous_wilaya?: string | null;
          new_wilaya?: string | null;
          previous_commune?: string | null;
          new_commune?: string | null;
          previous_delivery_type?: string | null;
          new_delivery_type?: string | null;
          previous_shipping_fee?: number | null;
          new_shipping_fee?: number | null;
          previous_total?: number | null;
          new_total?: number | null;
          financial_difference?: number;
          formatted_courier_note?: string | null;
          courier_tracking_code?: string | null;
          diff?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          conversion_sequence?: number;
          timestamp_utc?: string;
          operator?: string;
          reason?: string;
          override_applied?: boolean;
          previous_customer_name?: string | null;
          new_customer_name?: string | null;
          previous_phone?: string | null;
          new_phone?: string | null;
          previous_wilaya?: string | null;
          new_wilaya?: string | null;
          previous_commune?: string | null;
          new_commune?: string | null;
          previous_delivery_type?: string | null;
          new_delivery_type?: string | null;
          previous_shipping_fee?: number | null;
          new_shipping_fee?: number | null;
          previous_total?: number | null;
          new_total?: number | null;
          financial_difference?: number;
          formatted_courier_note?: string | null;
          courier_tracking_code?: string | null;
          diff?: Json;
          created_at?: string;
        };
      };
      order_re_routings: {
        Row: {
          id: string;
          order_id: string;
          conversion_sequence: number;
          timestamp_utc: string;
          operator: string;
          reason: string;
          override_applied: boolean;
          previous_customer_name: string | null;
          new_customer_name: string | null;
          previous_phone: string | null;
          new_phone: string | null;
          previous_wilaya: string | null;
          new_wilaya: string | null;
          previous_commune: string | null;
          new_commune: string | null;
          previous_delivery_type: string | null;
          new_delivery_type: string | null;
          previous_shipping_fee: number | null;
          new_shipping_fee: number | null;
          previous_total: number | null;
          new_total: number | null;
          financial_difference: number;
          formatted_courier_note: string | null;
          courier_tracking_code: string | null;
          diff: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          conversion_sequence?: number;
          timestamp_utc?: string;
          operator?: string;
          reason: string;
          override_applied?: boolean;
          previous_customer_name?: string | null;
          new_customer_name?: string | null;
          previous_phone?: string | null;
          new_phone?: string | null;
          previous_wilaya?: string | null;
          new_wilaya?: string | null;
          previous_commune?: string | null;
          new_commune?: string | null;
          previous_delivery_type?: string | null;
          new_delivery_type?: string | null;
          previous_shipping_fee?: number | null;
          new_shipping_fee?: number | null;
          previous_total?: number | null;
          new_total?: number | null;
          financial_difference?: number;
          formatted_courier_note?: string | null;
          courier_tracking_code?: string | null;
          diff?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          conversion_sequence?: number;
          timestamp_utc?: string;
          operator?: string;
          reason?: string;
          override_applied?: boolean;
          previous_customer_name?: string | null;
          new_customer_name?: string | null;
          previous_phone?: string | null;
          new_phone?: string | null;
          previous_wilaya?: string | null;
          new_wilaya?: string | null;
          previous_commune?: string | null;
          new_commune?: string | null;
          previous_delivery_type?: string | null;
          new_delivery_type?: string | null;
          previous_shipping_fee?: number | null;
          new_shipping_fee?: number | null;
          previous_total?: number | null;
          new_total?: number | null;
          financial_difference?: number;
          formatted_courier_note?: string | null;
          courier_tracking_code?: string | null;
          diff?: Json;
          created_at?: string;
        };
      };
      courier_configurations: {
        Row: {
          id: string;
          name: string;
          name_ar: string;
          family: 'yalidine' | 'procolis' | 'ecotrack' | 'maystro';
          base_url: string;
          is_active: boolean;
          is_default: boolean;
          supports_stop_desk: boolean;
          api_key: string | null;
          api_token: string | null;
          api_secret: string | null;
          account_id: string | null;
          origin_hub: string;
          webhook_secret: string | null;
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          name_ar: string;
          family: 'yalidine' | 'procolis' | 'ecotrack' | 'maystro';
          base_url: string;
          is_active?: boolean;
          is_default?: boolean;
          supports_stop_desk?: boolean;
          api_key?: string | null;
          api_token?: string | null;
          api_secret?: string | null;
          account_id?: string | null;
          origin_hub?: string;
          webhook_secret?: string | null;
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          name_ar?: string;
          family?: 'yalidine' | 'procolis' | 'ecotrack' | 'maystro';
          base_url?: string;
          is_active?: boolean;
          is_default?: boolean;
          supports_stop_desk?: boolean;
          api_key?: string | null;
          api_token?: string | null;
          api_secret?: string | null;
          account_id?: string | null;
          origin_hub?: string;
          webhook_secret?: string | null;
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      site_settings: {
        Row: {
          id: number;
          brand_name: string;
          brand_name_ar: string;
          contact_email: string;
          contact_phone: string;
          customer_service_phone: string;
          origin_hub_wilaya_code: number;
          origin_hub_wilaya_name: string;
          default_currency: string;
          meta_pixel_id: string;
          meta_capi_token: string;
          meta_test_event_code: string;
          telegram_bot_token: string;
          telegram_chat_id: string;
          telegram_alerts_enabled: boolean;
          active_courier_provider: string;
          delivery_settings: Json;
          reassurance_pillars: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          brand_name?: string;
          brand_name_ar?: string;
          contact_email?: string;
          contact_phone?: string;
          customer_service_phone?: string;
          origin_hub_wilaya_code?: number;
          origin_hub_wilaya_name?: string;
          default_currency?: string;
          meta_pixel_id?: string;
          meta_capi_token?: string;
          meta_test_event_code?: string;
          telegram_bot_token?: string;
          telegram_chat_id?: string;
          telegram_alerts_enabled?: boolean;
          active_courier_provider?: string;
          delivery_settings?: Json;
          reassurance_pillars?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          brand_name?: string;
          brand_name_ar?: string;
          contact_email?: string;
          contact_phone?: string;
          customer_service_phone?: string;
          origin_hub_wilaya_code?: number;
          origin_hub_wilaya_name?: string;
          default_currency?: string;
          meta_pixel_id?: string;
          meta_capi_token?: string;
          meta_test_event_code?: string;
          telegram_bot_token?: string;
          telegram_chat_id?: string;
          telegram_alerts_enabled?: boolean;
          active_courier_provider?: string;
          delivery_settings?: Json;
          reassurance_pillars?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          actor: string;
          details: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          action: string;
          actor?: string;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: string;
          entity_id?: string;
          action?: string;
          actor?: string;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
      meta_conversion_events: {
        Row: {
          id: string;
          event_name: 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'Purchase' | string;
          event_id: string;
          order_id: string | null;
          event_source_url: string | null;
          user_data: Json;
          custom_data: Json;
          status: string;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_name: 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'Purchase' | string;
          event_id: string;
          order_id?: string | null;
          event_source_url?: string | null;
          user_data?: Json;
          custom_data?: Json;
          status?: string;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_name?: 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'Purchase' | string;
          event_id?: string;
          order_id?: string | null;
          event_source_url?: string | null;
          user_data?: Json;
          custom_data?: Json;
          status?: string;
          error_message?: string | null;
          created_at?: string;
        };
      };
      telegram_alert_logs: {
        Row: {
          id: string;
          order_id: string | null;
          order_number: string;
          message: string;
          chat_id: string;
          status: 'SUCCESS' | 'FAILED' | 'PENDING' | string;
          response: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          order_number: string;
          message: string;
          chat_id: string;
          status?: 'SUCCESS' | 'FAILED' | 'PENDING' | string;
          response?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string | null;
          order_number?: string;
          message?: string;
          chat_id?: string;
          status?: 'SUCCESS' | 'FAILED' | 'PENDING' | string;
          response?: Json | null;
          created_at?: string;
        };
      };
      algeria_wilayas: {
        Row: {
          code: number;
          name: string;
          ar_name: string;
          domicile_tariff: number;
          stopdesk_tariff: number;
          is_stopdesk_available: boolean;
        };
        Insert: {
          code: number;
          name: string;
          ar_name: string;
          domicile_tariff?: number;
          stopdesk_tariff?: number;
          is_stopdesk_available?: boolean;
        };
        Update: {
          code?: number;
          name?: string;
          ar_name?: string;
          domicile_tariff?: number;
          stopdesk_tariff?: number;
          is_stopdesk_available?: boolean;
        };
      };
      public_site_settings: {
        Row: {
          brand_name: string;
          brand_name_ar: string;
          customer_service_phone: string;
          origin_hub_wilaya_code: number;
          default_currency: string;
        };
        Insert: {
          brand_name?: string;
          brand_name_ar?: string;
          customer_service_phone?: string;
          origin_hub_wilaya_code?: number;
          default_currency?: string;
        };
        Update: {
          brand_name?: string;
          brand_name_ar?: string;
          customer_service_phone?: string;
          origin_hub_wilaya_code?: number;
          default_currency?: string;
        };
      };
    };
    Views: {
      public_site_settings: {
        Row: {
          brand_name: string;
          brand_name_ar: string;
          customer_service_phone: string;
          origin_hub_wilaya_code: number;
          default_currency: string;
        };
      };
    };
  };
}

// Convenient Row helper types
export type Category = Database['public']['Tables']['categories']['Row'];
export type Collection = Database['public']['Tables']['collections']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type Variant = Database['public']['Tables']['variants']['Row'];
export type ProductMedia = Database['public']['Tables']['product_media']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'];
export type Delivery = Database['public']['Tables']['deliveries']['Row'];
export type OrderTimelineEvent = Database['public']['Tables']['order_timeline_events']['Row'];
export type CodReconciliation = Database['public']['Tables']['cod_reconciliations']['Row'];
export type OrderConversion = Database['public']['Tables']['order_conversions']['Row'];
export type CourierConfiguration = Database['public']['Tables']['courier_configurations']['Row'];
export type SiteSettings = Database['public']['Tables']['site_settings']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
export type PublicSiteSettings = Database['public']['Views']['public_site_settings']['Row'];
