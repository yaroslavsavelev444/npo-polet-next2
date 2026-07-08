import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('ru', 'en');
  CREATE TYPE "public"."enum_admins_role" AS ENUM('admin', 'superadmin');
  CREATE TYPE "public"."enum_users_role" AS ENUM('user', 'admin', 'superadmin');
  CREATE TYPE "public"."enum_users_status" AS ENUM('active', 'blocked', 'suspended');
  CREATE TYPE "public"."enum_media_type" AS ENUM('certificate', 'instruction', 'license', 'passport', 'product', 'other');
  CREATE TYPE "public"."enum_products_pricing_discount_type" AS ENUM('percentage', 'fixed');
  CREATE TYPE "public"."product_status_enum" AS ENUM('available', 'preorder', 'out_of_stock', 'discontinued');
  CREATE TYPE "public"."instruction_type_enum" AS ENUM('file', 'link');
  CREATE TYPE "public"."enum_products_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__products_v_version_pricing_discount_type" AS ENUM('percentage', 'fixed');
  CREATE TYPE "public"."enum__products_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__products_v_published_locale" AS ENUM('ru', 'en');
  CREATE TYPE "public"."enum_orders_status_history_status" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
  CREATE TYPE "public"."enum_orders_delivery_method" AS ENUM('door_to_door', 'pickup_point', 'self_pickup');
  CREATE TYPE "public"."enum_orders_payment_method" AS ENUM('invoice', 'self_pickup_card', 'self_pickup_cash');
  CREATE TYPE "public"."enum_orders_payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');
  CREATE TYPE "public"."enum_orders_source" AS ENUM('web', 'mobile', 'admin');
  CREATE TYPE "public"."enum_feedbacks_type" AS ENUM('bug', 'improvement', 'feature', 'other');
  CREATE TYPE "public"."enum_feedbacks_status" AS ENUM('new', 'in_progress', 'resolved', 'closed', 'duplicate', 'wont_fix');
  CREATE TYPE "public"."enum_feedbacks_priority" AS ENUM('low', 'medium', 'high', 'critical');
  CREATE TYPE "public"."enum_feedbacks_user_role" AS ENUM('user', 'lawyer', 'admin', 'moderator');
  CREATE TYPE "public"."enum_banners_targeting_roles" AS ENUM('user', 'lawyer', 'admin', 'moderator');
  CREATE TYPE "public"."enum_banners_action" AS ENUM('none', 'link', 'modal', 'redirect');
  CREATE TYPE "public"."enum_banners_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__banners_v_version_targeting_roles" AS ENUM('user', 'lawyer', 'admin', 'moderator');
  CREATE TYPE "public"."enum__banners_v_version_action" AS ENUM('none', 'link', 'modal', 'redirect');
  CREATE TYPE "public"."enum__banners_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__banners_v_published_locale" AS ENUM('ru', 'en');
  CREATE TYPE "public"."enum_discounts_type" AS ENUM('percentage', 'fixed', 'quantity_based');
  CREATE TYPE "public"."enum_notifications_type" AS ENUM('system', 'subscription_match', 'chat', 'review', 'order', 'promotion', 'discount', 'product', 'login_from_new_device');
  CREATE TYPE "public"."enum_notifications_push_status" AS ENUM('pending', 'sent', 'failed');
  CREATE TYPE "public"."enum_content_blocks_variant" AS ENUM('default', 'image-left', 'image-right', 'text-only', 'hero');
  CREATE TYPE "public"."enum_content_blocks_button_style" AS ENUM('primary', 'secondary', 'outline');
  CREATE TYPE "public"."enum_otp_codes_type" AS ENUM('email_verify', 'login_2fa');
  CREATE TYPE "public"."enum_product_reviews_status" AS ENUM('pending', 'approved', 'rejected');
  CREATE TYPE "public"."enum_sessions_revoked_reason" AS ENUM('logout', 'logout_all', 'password_changed', 'admin');
  CREATE TYPE "public"."enum_checkout_preferences_delivery_method" AS ENUM('door_to_door', 'pickup_point', 'self_pickup');
  CREATE TYPE "public"."enum_settings_phones_type" AS ENUM('support', 'sales', 'general', 'fax', 'accounting', 'other');
  CREATE TYPE "public"."enum_settings_emails_type" AS ENUM('general', 'support', 'info', 'sales', 'security', 'hr', 'other');
  CREATE TYPE "public"."enum_settings_social_links_platform" AS ENUM('telegram', 'whatsapp', 'vk', 'github', 'max', 'other');
  CREATE TYPE "public"."enum_settings_other_contacts_type" AS ENUM('messenger', 'forum', 'custom', 'chat', 'bot');
  CREATE TABLE "admins_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "admins" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" "enum_admins_role" DEFAULT 'admin' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" "enum_users_role" DEFAULT 'user' NOT NULL,
  	"status" "enum_users_status" DEFAULT 'active' NOT NULL,
  	"blocked_until" timestamp(3) with time zone,
  	"two_f_a_verified" boolean DEFAULT false,
  	"two_f_a_verified_at" timestamp(3) with time zone,
  	"email_verified" boolean DEFAULT false,
  	"last_login_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"caption" varchar,
  	"is_public" boolean DEFAULT true,
  	"type" "enum_media_type" DEFAULT 'product',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_full_url" varchar,
  	"sizes_full_width" numeric,
  	"sizes_full_height" numeric,
  	"sizes_full_mime_type" varchar,
  	"sizes_full_filesize" numeric,
  	"sizes_full_filename" varchar
  );
  
  CREATE TABLE "categories_keywords" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"keyword" varchar
  );
  
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"image_id" integer,
  	"order" numeric DEFAULT 0,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories_locales" (
  	"name" varchar NOT NULL,
  	"subtitle" varchar,
  	"description" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "products_specifications" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"value" varchar,
  	"unit" varchar,
  	"group" varchar,
  	"is_visible" boolean DEFAULT true
  );
  
  CREATE TABLE "products_seo_keywords" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"keyword" varchar
  );
  
  CREATE TABLE "products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"category_id" integer,
  	"pricing_price_for_individual" numeric,
  	"pricing_discount_is_active" boolean DEFAULT false,
  	"pricing_discount_type" "enum_products_pricing_discount_type" DEFAULT 'percentage',
  	"pricing_discount_value" numeric,
  	"pricing_discount_valid_from" timestamp(3) with time zone,
  	"pricing_discount_valid_until" timestamp(3) with time zone,
  	"pricing_discount_min_quantity" numeric DEFAULT 1,
  	"inventory_status" "product_status_enum" DEFAULT 'available',
  	"inventory_min_order_quantity" numeric DEFAULT 1,
  	"inventory_max_order_quantity" numeric,
  	"inventory_is_visible" boolean DEFAULT true,
  	"inventory_show_on_main_page" boolean DEFAULT false,
  	"instruction_type" "instruction_type_enum",
  	"instruction_file_id" integer,
  	"instruction_link" varchar,
  	"brand_manufacturer" varchar,
  	"brand_warranty_months" numeric,
  	"dimensions_weight" numeric,
  	"dimensions_length" numeric,
  	"dimensions_width" numeric,
  	"dimensions_height" numeric,
  	"analytics_views_count" numeric DEFAULT 0,
  	"analytics_purchases_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_products_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "products_locales" (
  	"title" varchar,
  	"description" varchar,
  	"seo_meta_title" varchar,
  	"seo_meta_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"products_id" integer
  );
  
  CREATE TABLE "_products_v_version_specifications" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"value" varchar,
  	"unit" varchar,
  	"group" varchar,
  	"is_visible" boolean DEFAULT true,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_seo_keywords" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"keyword" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_category_id" integer,
  	"version_pricing_price_for_individual" numeric,
  	"version_pricing_discount_is_active" boolean DEFAULT false,
  	"version_pricing_discount_type" "enum__products_v_version_pricing_discount_type" DEFAULT 'percentage',
  	"version_pricing_discount_value" numeric,
  	"version_pricing_discount_valid_from" timestamp(3) with time zone,
  	"version_pricing_discount_valid_until" timestamp(3) with time zone,
  	"version_pricing_discount_min_quantity" numeric DEFAULT 1,
  	"version_inventory_status" "product_status_enum" DEFAULT 'available',
  	"version_inventory_min_order_quantity" numeric DEFAULT 1,
  	"version_inventory_max_order_quantity" numeric,
  	"version_inventory_is_visible" boolean DEFAULT true,
  	"version_inventory_show_on_main_page" boolean DEFAULT false,
  	"version_instruction_type" "instruction_type_enum",
  	"version_instruction_file_id" integer,
  	"version_instruction_link" varchar,
  	"version_brand_manufacturer" varchar,
  	"version_brand_warranty_months" numeric,
  	"version_dimensions_weight" numeric,
  	"version_dimensions_length" numeric,
  	"version_dimensions_width" numeric,
  	"version_dimensions_height" numeric,
  	"version_analytics_views_count" numeric DEFAULT 0,
  	"version_analytics_purchases_count" numeric DEFAULT 0,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__products_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__products_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_products_v_locales" (
  	"version_title" varchar,
  	"version_description" varchar,
  	"version_seo_meta_title" varchar,
  	"version_seo_meta_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_products_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"products_id" integer
  );
  
  CREATE TABLE "carts_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"quantity" numeric NOT NULL,
  	"added_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "carts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"quantity" numeric NOT NULL,
  	"unit_price" numeric NOT NULL,
  	"discount" numeric DEFAULT 0,
  	"total_price" numeric NOT NULL
  );
  
  CREATE TABLE "orders_applied_discounts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"discount_id_id" integer,
  	"name" varchar,
  	"discount_percent" numeric,
  	"discount_amount" numeric,
  	"message" varchar
  );
  
  CREATE TABLE "orders_status_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"status" "enum_orders_status_history_status" NOT NULL,
  	"changed_at" timestamp(3) with time zone,
  	"changed_by_id" integer,
  	"comment" varchar
  );
  
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order_number" varchar NOT NULL,
  	"user_id" integer NOT NULL,
  	"status" "enum_orders_status" DEFAULT 'pending' NOT NULL,
  	"recipient_full_name" varchar NOT NULL,
  	"recipient_phone" varchar NOT NULL,
  	"recipient_email" varchar NOT NULL,
  	"recipient_contact_person" varchar,
  	"delivery_method" "enum_orders_delivery_method" DEFAULT 'self_pickup' NOT NULL,
  	"delivery_address_street" varchar,
  	"delivery_address_city" varchar,
  	"delivery_address_postal_code" varchar,
  	"delivery_address_country" varchar DEFAULT 'Россия',
  	"delivery_transport_company_id" integer,
  	"delivery_pickup_point_id" integer,
  	"delivery_tracking_number" varchar,
  	"delivery_estimated_delivery" timestamp(3) with time zone,
  	"delivery_notes" varchar,
  	"pricing_subtotal" numeric NOT NULL,
  	"pricing_product_discounts" numeric DEFAULT 0,
  	"pricing_central_discount_amount" numeric DEFAULT 0,
  	"pricing_central_discount_percent" numeric DEFAULT 0,
  	"pricing_discount" numeric DEFAULT 0,
  	"pricing_shipping_cost" numeric DEFAULT 0,
  	"pricing_total" numeric NOT NULL,
  	"pricing_currency" varchar DEFAULT 'RUB',
  	"payment_method" "enum_orders_payment_method" NOT NULL,
  	"payment_status" "enum_orders_payment_status" DEFAULT 'pending',
  	"payment_transaction_id" varchar,
  	"payment_paid_at" timestamp(3) with time zone,
  	"payment_invoice_file_id" integer,
  	"company_info_company_id_id" integer,
  	"company_info_name" varchar,
  	"company_info_legal_address" varchar,
  	"company_info_company_address" varchar,
  	"company_info_tax_number" varchar,
  	"company_info_contact_person" varchar,
  	"notes" varchar,
  	"internal_notes" varchar,
  	"source" "enum_orders_source" DEFAULT 'web',
  	"ip_address" varchar,
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "consents_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"version" varchar NOT NULL,
  	"content" varchar NOT NULL,
  	"document_url" varchar,
  	"change_description" varchar,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "consents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"content" varchar NOT NULL,
  	"document_url" varchar,
  	"is_required" boolean DEFAULT true,
  	"needs_acceptance" boolean DEFAULT true NOT NULL,
  	"is_active" boolean DEFAULT true NOT NULL,
  	"version" varchar DEFAULT '1.0.0',
  	"checksum" varchar,
  	"last_updated_at" timestamp(3) with time zone,
  	"last_updated_by_id" integer,
  	"_changedescription" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "feedbacks_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar NOT NULL
  );
  
  CREATE TABLE "feedbacks_internal_notes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"note" varchar NOT NULL,
  	"created_by_id" integer,
  	"created_at" timestamp(3) with time zone,
  	"is_private" boolean DEFAULT false
  );
  
  CREATE TABLE "feedbacks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"type" "enum_feedbacks_type" NOT NULL,
  	"status" "enum_feedbacks_status" DEFAULT 'new',
  	"priority" "enum_feedbacks_priority" DEFAULT 'low',
  	"user_id" integer,
  	"user_email" varchar,
  	"user_name" varchar,
  	"user_role" "enum_feedbacks_user_role",
  	"assigned_to_id" integer,
  	"view_count" numeric DEFAULT 0,
  	"upvotes" numeric DEFAULT 0,
  	"duplicate_of_id" integer,
  	"resolved_at" timestamp(3) with time zone,
  	"closed_at" timestamp(3) with time zone,
  	"due_date" timestamp(3) with time zone,
  	"device_info_user_agent" varchar,
  	"device_info_platform" varchar,
  	"device_info_os" varchar,
  	"device_info_browser" varchar,
  	"device_info_screen_resolution" varchar,
  	"ip_address" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "feedbacks_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"users_id" integer,
  	"feedbacks_id" integer
  );
  
  CREATE TABLE "banners_targeting_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_banners_targeting_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "banners" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"subtitle" varchar,
  	"description" varchar,
  	"action" "enum_banners_action" DEFAULT 'none',
  	"action_payload" varchar,
  	"start_at" timestamp(3) with time zone,
  	"end_at" timestamp(3) with time zone,
  	"repeatable" boolean DEFAULT false,
  	"priority" numeric DEFAULT 0,
  	"status" "enum_banners_status" DEFAULT 'draft',
  	"is_system" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_banners_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "banners_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "_banners_v_version_targeting_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__banners_v_version_targeting_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_banners_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_subtitle" varchar,
  	"version_description" varchar,
  	"version_action" "enum__banners_v_version_action" DEFAULT 'none',
  	"version_action_payload" varchar,
  	"version_start_at" timestamp(3) with time zone,
  	"version_end_at" timestamp(3) with time zone,
  	"version_repeatable" boolean DEFAULT false,
  	"version_priority" numeric DEFAULT 0,
  	"version_status" "enum__banners_v_version_status" DEFAULT 'draft',
  	"version_is_system" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__banners_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__banners_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_banners_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "pickup_points" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"address" varchar NOT NULL,
  	"city" varchar,
  	"phone" varchar,
  	"working_hours" varchar,
  	"coordinates_lat" numeric,
  	"coordinates_lng" numeric,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "transport_companies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"phone" varchar,
  	"website" varchar,
  	"tracking_url_template" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"type" "enum_discounts_type" DEFAULT 'percentage' NOT NULL,
  	"discount_percent" numeric,
  	"fixed_amount" numeric,
  	"min_total_quantity" numeric,
  	"min_total_amount" numeric,
  	"applies_to_all_products" boolean DEFAULT true,
  	"is_active" boolean DEFAULT true,
  	"is_unlimited" boolean DEFAULT false,
  	"start_at" timestamp(3) with time zone NOT NULL,
  	"end_at" timestamp(3) with time zone,
  	"priority" numeric DEFAULT 1,
  	"code" varchar,
  	"total_uses" numeric DEFAULT 0,
  	"total_discount_amount" numeric DEFAULT 0,
  	"created_by_id" integer,
  	"updated_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discounts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer,
  	"products_id" integer
  );
  
  CREATE TABLE "companies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"company_name" varchar NOT NULL,
  	"legal_address" varchar NOT NULL,
  	"company_address" varchar,
  	"tax_number" varchar NOT NULL,
  	"contact_person" varchar,
  	"phone" varchar,
  	"email" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "knowledge_topics_blocks_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "knowledge_topics_blocks_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" varchar NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "knowledge_topics_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"caption" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "knowledge_topics_blocks_link" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "knowledge_topics_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar
  );
  
  CREATE TABLE "knowledge_topics" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"image_id" integer,
  	"position" numeric DEFAULT 0,
  	"featured" boolean DEFAULT false,
  	"published" boolean DEFAULT true,
  	"published_at" timestamp(3) with time zone,
  	"author_id" integer,
  	"reading_time" numeric,
  	"seo_meta_title" varchar,
  	"seo_meta_description" varchar,
  	"seo_og_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "wishlists_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"added_at" timestamp(3) with time zone,
  	"notes" varchar
  );
  
  CREATE TABLE "wishlists" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"total_items" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"type" "enum_notifications_type" DEFAULT 'system',
  	"title" varchar NOT NULL,
  	"body" varchar NOT NULL,
  	"data" jsonb,
  	"link" varchar,
  	"is_read" boolean DEFAULT false,
  	"read_at" timestamp(3) with time zone,
  	"push_status" "enum_notifications_push_status" DEFAULT 'pending',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "content_blocks_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar
  );
  
  CREATE TABLE "content_blocks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"subtitle" varchar NOT NULL,
  	"image_id" integer,
  	"variant" "enum_content_blocks_variant" DEFAULT 'default' NOT NULL,
  	"button_text" varchar,
  	"button_action" varchar,
  	"button_style" "enum_content_blocks_button_style",
  	"description" varchar,
  	"position" numeric DEFAULT 0,
  	"is_active" boolean DEFAULT true,
  	"metadata" jsonb,
  	"created_by_id" integer,
  	"updated_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "otp_codes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"type" "enum_otp_codes_type" NOT NULL,
  	"code_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"max_attempts" numeric DEFAULT 5,
  	"used" boolean DEFAULT false,
  	"ip" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "product_reviews_pros" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "product_reviews_cons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "product_reviews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"product_id" integer NOT NULL,
  	"rating" numeric NOT NULL,
  	"title" varchar,
  	"comment" varchar NOT NULL,
  	"status" "enum_product_reviews_status" DEFAULT 'pending',
  	"rejection_reason" varchar,
  	"is_verified_purchase" boolean DEFAULT false,
  	"helpful_count" numeric DEFAULT 0,
  	"not_helpful_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"user_agent" varchar,
  	"ip" varchar,
  	"device_label" varchar,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"last_active_at" timestamp(3) with time zone NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"revoked" boolean DEFAULT false,
  	"revoked_reason" "enum_sessions_revoked_reason",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "user_consents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"consent_id" integer NOT NULL,
  	"consent_slug" varchar NOT NULL,
  	"version" varchar NOT NULL,
  	"accepted_at" timestamp(3) with time zone NOT NULL,
  	"ip" varchar,
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "checkout_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"recipient_full_name" varchar,
  	"recipient_phone" varchar,
  	"recipient_email" varchar,
  	"delivery_method" "enum_checkout_preferences_delivery_method",
  	"delivery_address_street" varchar,
  	"delivery_address_city" varchar,
  	"delivery_address_postal_code" varchar,
  	"delivery_address_country" varchar,
  	"delivery_transport_company_id" integer,
  	"delivery_pickup_point_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" integer,
  	"users_id" integer,
  	"media_id" integer,
  	"categories_id" integer,
  	"products_id" integer,
  	"carts_id" integer,
  	"orders_id" integer,
  	"consents_id" integer,
  	"feedbacks_id" integer,
  	"banners_id" integer,
  	"pickup_points_id" integer,
  	"transport_companies_id" integer,
  	"discounts_id" integer,
  	"companies_id" integer,
  	"knowledge_topics_id" integer,
  	"wishlists_id" integer,
  	"notifications_id" integer,
  	"content_blocks_id" integer,
  	"otp_codes_id" integer,
  	"product_reviews_id" integer,
  	"sessions_id" integer,
  	"user_consents_id" integer,
  	"checkout_preferences_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" integer,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "settings_phones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_settings_phones_type" DEFAULT 'general',
  	"value" varchar NOT NULL,
  	"description" varchar,
  	"is_primary" boolean DEFAULT false,
  	"sort_order" numeric DEFAULT 0
  );
  
  CREATE TABLE "settings_emails" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_settings_emails_type" DEFAULT 'general',
  	"value" varchar NOT NULL,
  	"description" varchar,
  	"is_primary" boolean DEFAULT false,
  	"sort_order" numeric DEFAULT 0
  );
  
  CREATE TABLE "settings_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_settings_social_links_platform" NOT NULL,
  	"url" varchar NOT NULL,
  	"title" varchar,
  	"sort_order" numeric DEFAULT 0
  );
  
  CREATE TABLE "settings_other_contacts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_settings_other_contacts_type" NOT NULL,
  	"name" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0
  );
  
  CREATE TABLE "settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"company_name" varchar NOT NULL,
  	"logo_id" integer NOT NULL,
  	"legal_address" varchar,
  	"physical_address" varchar,
  	"restrictions_disable_registration" boolean DEFAULT false,
  	"restrictions_disable_ordering" boolean DEFAULT false,
  	"working_hours" varchar,
  	"map" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_keywords" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "admins_sessions" ADD CONSTRAINT "admins_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories_keywords" ADD CONSTRAINT "categories_keywords_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories_locales" ADD CONSTRAINT "categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_specifications" ADD CONSTRAINT "products_specifications_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_seo_keywords" ADD CONSTRAINT "products_seo_keywords_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_instruction_file_id_media_id_fk" FOREIGN KEY ("instruction_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_locales" ADD CONSTRAINT "products_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_specifications" ADD CONSTRAINT "_products_v_version_specifications_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_seo_keywords" ADD CONSTRAINT "_products_v_version_seo_keywords_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_parent_id_products_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_category_id_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_instruction_file_id_media_id_fk" FOREIGN KEY ("version_instruction_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_locales" ADD CONSTRAINT "_products_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "carts_items" ADD CONSTRAINT "carts_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts_items" ADD CONSTRAINT "carts_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_applied_discounts" ADD CONSTRAINT "orders_applied_discounts_discount_id_id_discounts_id_fk" FOREIGN KEY ("discount_id_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_applied_discounts" ADD CONSTRAINT "orders_applied_discounts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_status_history" ADD CONSTRAINT "orders_status_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_status_history" ADD CONSTRAINT "orders_status_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_transport_company_id_transport_companies_id_fk" FOREIGN KEY ("delivery_transport_company_id") REFERENCES "public"."transport_companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_pickup_point_id_pickup_points_id_fk" FOREIGN KEY ("delivery_pickup_point_id") REFERENCES "public"."pickup_points"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_invoice_file_id_media_id_fk" FOREIGN KEY ("payment_invoice_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_company_info_company_id_id_companies_id_fk" FOREIGN KEY ("company_info_company_id_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consents_history" ADD CONSTRAINT "consents_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."consents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "consents" ADD CONSTRAINT "consents_last_updated_by_id_users_id_fk" FOREIGN KEY ("last_updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "feedbacks_tags" ADD CONSTRAINT "feedbacks_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."feedbacks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "feedbacks_internal_notes" ADD CONSTRAINT "feedbacks_internal_notes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "feedbacks_internal_notes" ADD CONSTRAINT "feedbacks_internal_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."feedbacks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_duplicate_of_id_feedbacks_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."feedbacks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "feedbacks_rels" ADD CONSTRAINT "feedbacks_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."feedbacks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "feedbacks_rels" ADD CONSTRAINT "feedbacks_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "feedbacks_rels" ADD CONSTRAINT "feedbacks_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "feedbacks_rels" ADD CONSTRAINT "feedbacks_rels_feedbacks_fk" FOREIGN KEY ("feedbacks_id") REFERENCES "public"."feedbacks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "banners_targeting_roles" ADD CONSTRAINT "banners_targeting_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "banners_rels" ADD CONSTRAINT "banners_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "banners_rels" ADD CONSTRAINT "banners_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_banners_v_version_targeting_roles" ADD CONSTRAINT "_banners_v_version_targeting_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_banners_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_banners_v" ADD CONSTRAINT "_banners_v_parent_id_banners_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."banners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_banners_v_rels" ADD CONSTRAINT "_banners_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_banners_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_banners_v_rels" ADD CONSTRAINT "_banners_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discounts" ADD CONSTRAINT "discounts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discounts" ADD CONSTRAINT "discounts_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discounts_rels" ADD CONSTRAINT "discounts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."discounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discounts_rels" ADD CONSTRAINT "discounts_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discounts_rels" ADD CONSTRAINT "discounts_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "companies" ADD CONSTRAINT "companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "knowledge_topics_blocks_heading" ADD CONSTRAINT "knowledge_topics_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "knowledge_topics_blocks_text" ADD CONSTRAINT "knowledge_topics_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "knowledge_topics_blocks_image" ADD CONSTRAINT "knowledge_topics_blocks_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "knowledge_topics_blocks_image" ADD CONSTRAINT "knowledge_topics_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "knowledge_topics_blocks_link" ADD CONSTRAINT "knowledge_topics_blocks_link_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "knowledge_topics_tags" ADD CONSTRAINT "knowledge_topics_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "knowledge_topics" ADD CONSTRAINT "knowledge_topics_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "knowledge_topics" ADD CONSTRAINT "knowledge_topics_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "knowledge_topics" ADD CONSTRAINT "knowledge_topics_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlists_items" ADD CONSTRAINT "wishlists_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlists_items" ADD CONSTRAINT "wishlists_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_blocks_tags" ADD CONSTRAINT "content_blocks_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."content_blocks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_reviews_pros" ADD CONSTRAINT "product_reviews_pros_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."product_reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_reviews_cons" ADD CONSTRAINT "product_reviews_cons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."product_reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_preferences" ADD CONSTRAINT "checkout_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_preferences" ADD CONSTRAINT "checkout_preferences_delivery_transport_company_id_transport_companies_id_fk" FOREIGN KEY ("delivery_transport_company_id") REFERENCES "public"."transport_companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "checkout_preferences" ADD CONSTRAINT "checkout_preferences_delivery_pickup_point_id_pickup_points_id_fk" FOREIGN KEY ("delivery_pickup_point_id") REFERENCES "public"."pickup_points"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_carts_fk" FOREIGN KEY ("carts_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consents_fk" FOREIGN KEY ("consents_id") REFERENCES "public"."consents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_feedbacks_fk" FOREIGN KEY ("feedbacks_id") REFERENCES "public"."feedbacks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_banners_fk" FOREIGN KEY ("banners_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pickup_points_fk" FOREIGN KEY ("pickup_points_id") REFERENCES "public"."pickup_points"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_transport_companies_fk" FOREIGN KEY ("transport_companies_id") REFERENCES "public"."transport_companies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discounts_fk" FOREIGN KEY ("discounts_id") REFERENCES "public"."discounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_companies_fk" FOREIGN KEY ("companies_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_knowledge_topics_fk" FOREIGN KEY ("knowledge_topics_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_wishlists_fk" FOREIGN KEY ("wishlists_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_content_blocks_fk" FOREIGN KEY ("content_blocks_id") REFERENCES "public"."content_blocks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_otp_codes_fk" FOREIGN KEY ("otp_codes_id") REFERENCES "public"."otp_codes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_reviews_fk" FOREIGN KEY ("product_reviews_id") REFERENCES "public"."product_reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sessions_fk" FOREIGN KEY ("sessions_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_consents_fk" FOREIGN KEY ("user_consents_id") REFERENCES "public"."user_consents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_checkout_preferences_fk" FOREIGN KEY ("checkout_preferences_id") REFERENCES "public"."checkout_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_phones" ADD CONSTRAINT "settings_phones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_emails" ADD CONSTRAINT "settings_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_social_links" ADD CONSTRAINT "settings_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_other_contacts" ADD CONSTRAINT "settings_other_contacts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "admins_sessions_order_idx" ON "admins_sessions" USING btree ("_order");
  CREATE INDEX "admins_sessions_parent_id_idx" ON "admins_sessions" USING btree ("_parent_id");
  CREATE INDEX "admins_updated_at_idx" ON "admins" USING btree ("updated_at");
  CREATE INDEX "admins_created_at_idx" ON "admins" USING btree ("created_at");
  CREATE UNIQUE INDEX "admins_email_idx" ON "admins" USING btree ("email");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_full_sizes_full_filename_idx" ON "media" USING btree ("sizes_full_filename");
  CREATE INDEX "categories_keywords_order_idx" ON "categories_keywords" USING btree ("_order");
  CREATE INDEX "categories_keywords_parent_id_idx" ON "categories_keywords" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_image_idx" ON "categories" USING btree ("image_id");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "categories_locales_locale_parent_id_unique" ON "categories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_specifications_order_idx" ON "products_specifications" USING btree ("_order");
  CREATE INDEX "products_specifications_parent_id_idx" ON "products_specifications" USING btree ("_parent_id");
  CREATE INDEX "products_seo_keywords_order_idx" ON "products_seo_keywords" USING btree ("_order");
  CREATE INDEX "products_seo_keywords_parent_id_idx" ON "products_seo_keywords" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");
  CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");
  CREATE INDEX "products_instruction_instruction_file_idx" ON "products" USING btree ("instruction_file_id");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "products__status_idx" ON "products" USING btree ("_status");
  CREATE UNIQUE INDEX "products_locales_locale_parent_id_unique" ON "products_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_rels_order_idx" ON "products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "products_rels" USING btree ("path");
  CREATE INDEX "products_rels_media_id_idx" ON "products_rels" USING btree ("media_id");
  CREATE INDEX "products_rels_products_id_idx" ON "products_rels" USING btree ("products_id");
  CREATE INDEX "_products_v_version_specifications_order_idx" ON "_products_v_version_specifications" USING btree ("_order");
  CREATE INDEX "_products_v_version_specifications_parent_id_idx" ON "_products_v_version_specifications" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_seo_keywords_order_idx" ON "_products_v_version_seo_keywords" USING btree ("_order");
  CREATE INDEX "_products_v_version_seo_keywords_parent_id_idx" ON "_products_v_version_seo_keywords" USING btree ("_parent_id");
  CREATE INDEX "_products_v_parent_idx" ON "_products_v" USING btree ("parent_id");
  CREATE INDEX "_products_v_version_version_slug_idx" ON "_products_v" USING btree ("version_slug");
  CREATE INDEX "_products_v_version_version_category_idx" ON "_products_v" USING btree ("version_category_id");
  CREATE INDEX "_products_v_version_instruction_version_instruction_file_idx" ON "_products_v" USING btree ("version_instruction_file_id");
  CREATE INDEX "_products_v_version_version_updated_at_idx" ON "_products_v" USING btree ("version_updated_at");
  CREATE INDEX "_products_v_version_version_created_at_idx" ON "_products_v" USING btree ("version_created_at");
  CREATE INDEX "_products_v_version_version__status_idx" ON "_products_v" USING btree ("version__status");
  CREATE INDEX "_products_v_created_at_idx" ON "_products_v" USING btree ("created_at");
  CREATE INDEX "_products_v_updated_at_idx" ON "_products_v" USING btree ("updated_at");
  CREATE INDEX "_products_v_snapshot_idx" ON "_products_v" USING btree ("snapshot");
  CREATE INDEX "_products_v_published_locale_idx" ON "_products_v" USING btree ("published_locale");
  CREATE INDEX "_products_v_latest_idx" ON "_products_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_products_v_locales_locale_parent_id_unique" ON "_products_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_products_v_rels_order_idx" ON "_products_v_rels" USING btree ("order");
  CREATE INDEX "_products_v_rels_parent_idx" ON "_products_v_rels" USING btree ("parent_id");
  CREATE INDEX "_products_v_rels_path_idx" ON "_products_v_rels" USING btree ("path");
  CREATE INDEX "_products_v_rels_media_id_idx" ON "_products_v_rels" USING btree ("media_id");
  CREATE INDEX "_products_v_rels_products_id_idx" ON "_products_v_rels" USING btree ("products_id");
  CREATE INDEX "carts_items_order_idx" ON "carts_items" USING btree ("_order");
  CREATE INDEX "carts_items_parent_id_idx" ON "carts_items" USING btree ("_parent_id");
  CREATE INDEX "carts_items_product_idx" ON "carts_items" USING btree ("product_id");
  CREATE UNIQUE INDEX "carts_user_idx" ON "carts" USING btree ("user_id");
  CREATE INDEX "carts_updated_at_idx" ON "carts" USING btree ("updated_at");
  CREATE INDEX "carts_created_at_idx" ON "carts" USING btree ("created_at");
  CREATE INDEX "orders_items_order_idx" ON "orders_items" USING btree ("_order");
  CREATE INDEX "orders_items_parent_id_idx" ON "orders_items" USING btree ("_parent_id");
  CREATE INDEX "orders_items_product_idx" ON "orders_items" USING btree ("product_id");
  CREATE INDEX "orders_applied_discounts_order_idx" ON "orders_applied_discounts" USING btree ("_order");
  CREATE INDEX "orders_applied_discounts_parent_id_idx" ON "orders_applied_discounts" USING btree ("_parent_id");
  CREATE INDEX "orders_applied_discounts_discount_id_idx" ON "orders_applied_discounts" USING btree ("discount_id_id");
  CREATE INDEX "orders_status_history_order_idx" ON "orders_status_history" USING btree ("_order");
  CREATE INDEX "orders_status_history_parent_id_idx" ON "orders_status_history" USING btree ("_parent_id");
  CREATE INDEX "orders_status_history_changed_by_idx" ON "orders_status_history" USING btree ("changed_by_id");
  CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");
  CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");
  CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");
  CREATE INDEX "orders_delivery_delivery_transport_company_idx" ON "orders" USING btree ("delivery_transport_company_id");
  CREATE INDEX "orders_delivery_delivery_pickup_point_idx" ON "orders" USING btree ("delivery_pickup_point_id");
  CREATE INDEX "orders_payment_payment_status_idx" ON "orders" USING btree ("payment_status");
  CREATE INDEX "orders_payment_payment_invoice_file_idx" ON "orders" USING btree ("payment_invoice_file_id");
  CREATE INDEX "orders_company_info_company_info_company_id_idx" ON "orders" USING btree ("company_info_company_id_id");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "consents_history_order_idx" ON "consents_history" USING btree ("_order");
  CREATE INDEX "consents_history_parent_id_idx" ON "consents_history" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "consents_slug_idx" ON "consents" USING btree ("slug");
  CREATE INDEX "consents_is_active_idx" ON "consents" USING btree ("is_active");
  CREATE INDEX "consents_last_updated_by_idx" ON "consents" USING btree ("last_updated_by_id");
  CREATE INDEX "consents_updated_at_idx" ON "consents" USING btree ("updated_at");
  CREATE INDEX "consents_created_at_idx" ON "consents" USING btree ("created_at");
  CREATE INDEX "feedbacks_tags_order_idx" ON "feedbacks_tags" USING btree ("_order");
  CREATE INDEX "feedbacks_tags_parent_id_idx" ON "feedbacks_tags" USING btree ("_parent_id");
  CREATE INDEX "feedbacks_internal_notes_order_idx" ON "feedbacks_internal_notes" USING btree ("_order");
  CREATE INDEX "feedbacks_internal_notes_parent_id_idx" ON "feedbacks_internal_notes" USING btree ("_parent_id");
  CREATE INDEX "feedbacks_internal_notes_created_by_idx" ON "feedbacks_internal_notes" USING btree ("created_by_id");
  CREATE INDEX "feedbacks_type_idx" ON "feedbacks" USING btree ("type");
  CREATE INDEX "feedbacks_status_idx" ON "feedbacks" USING btree ("status");
  CREATE INDEX "feedbacks_priority_idx" ON "feedbacks" USING btree ("priority");
  CREATE INDEX "feedbacks_user_idx" ON "feedbacks" USING btree ("user_id");
  CREATE INDEX "feedbacks_assigned_to_idx" ON "feedbacks" USING btree ("assigned_to_id");
  CREATE INDEX "feedbacks_duplicate_of_idx" ON "feedbacks" USING btree ("duplicate_of_id");
  CREATE INDEX "feedbacks_updated_at_idx" ON "feedbacks" USING btree ("updated_at");
  CREATE INDEX "feedbacks_created_at_idx" ON "feedbacks" USING btree ("created_at");
  CREATE INDEX "feedbacks_rels_order_idx" ON "feedbacks_rels" USING btree ("order");
  CREATE INDEX "feedbacks_rels_parent_idx" ON "feedbacks_rels" USING btree ("parent_id");
  CREATE INDEX "feedbacks_rels_path_idx" ON "feedbacks_rels" USING btree ("path");
  CREATE INDEX "feedbacks_rels_media_id_idx" ON "feedbacks_rels" USING btree ("media_id");
  CREATE INDEX "feedbacks_rels_users_id_idx" ON "feedbacks_rels" USING btree ("users_id");
  CREATE INDEX "feedbacks_rels_feedbacks_id_idx" ON "feedbacks_rels" USING btree ("feedbacks_id");
  CREATE INDEX "banners_targeting_roles_order_idx" ON "banners_targeting_roles" USING btree ("order");
  CREATE INDEX "banners_targeting_roles_parent_idx" ON "banners_targeting_roles" USING btree ("parent_id");
  CREATE INDEX "banners_status_idx" ON "banners" USING btree ("status");
  CREATE INDEX "banners_updated_at_idx" ON "banners" USING btree ("updated_at");
  CREATE INDEX "banners_created_at_idx" ON "banners" USING btree ("created_at");
  CREATE INDEX "banners__status_idx" ON "banners" USING btree ("_status");
  CREATE INDEX "banners_rels_order_idx" ON "banners_rels" USING btree ("order");
  CREATE INDEX "banners_rels_parent_idx" ON "banners_rels" USING btree ("parent_id");
  CREATE INDEX "banners_rels_path_idx" ON "banners_rels" USING btree ("path");
  CREATE INDEX "banners_rels_media_id_idx" ON "banners_rels" USING btree ("media_id");
  CREATE INDEX "_banners_v_version_targeting_roles_order_idx" ON "_banners_v_version_targeting_roles" USING btree ("order");
  CREATE INDEX "_banners_v_version_targeting_roles_parent_idx" ON "_banners_v_version_targeting_roles" USING btree ("parent_id");
  CREATE INDEX "_banners_v_parent_idx" ON "_banners_v" USING btree ("parent_id");
  CREATE INDEX "_banners_v_version_version_status_idx" ON "_banners_v" USING btree ("version_status");
  CREATE INDEX "_banners_v_version_version_updated_at_idx" ON "_banners_v" USING btree ("version_updated_at");
  CREATE INDEX "_banners_v_version_version_created_at_idx" ON "_banners_v" USING btree ("version_created_at");
  CREATE INDEX "_banners_v_version_version__status_idx" ON "_banners_v" USING btree ("version__status");
  CREATE INDEX "_banners_v_created_at_idx" ON "_banners_v" USING btree ("created_at");
  CREATE INDEX "_banners_v_updated_at_idx" ON "_banners_v" USING btree ("updated_at");
  CREATE INDEX "_banners_v_snapshot_idx" ON "_banners_v" USING btree ("snapshot");
  CREATE INDEX "_banners_v_published_locale_idx" ON "_banners_v" USING btree ("published_locale");
  CREATE INDEX "_banners_v_latest_idx" ON "_banners_v" USING btree ("latest");
  CREATE INDEX "_banners_v_rels_order_idx" ON "_banners_v_rels" USING btree ("order");
  CREATE INDEX "_banners_v_rels_parent_idx" ON "_banners_v_rels" USING btree ("parent_id");
  CREATE INDEX "_banners_v_rels_path_idx" ON "_banners_v_rels" USING btree ("path");
  CREATE INDEX "_banners_v_rels_media_id_idx" ON "_banners_v_rels" USING btree ("media_id");
  CREATE INDEX "pickup_points_is_active_idx" ON "pickup_points" USING btree ("is_active");
  CREATE INDEX "pickup_points_updated_at_idx" ON "pickup_points" USING btree ("updated_at");
  CREATE INDEX "pickup_points_created_at_idx" ON "pickup_points" USING btree ("created_at");
  CREATE INDEX "transport_companies_is_active_idx" ON "transport_companies" USING btree ("is_active");
  CREATE INDEX "transport_companies_updated_at_idx" ON "transport_companies" USING btree ("updated_at");
  CREATE INDEX "transport_companies_created_at_idx" ON "transport_companies" USING btree ("created_at");
  CREATE INDEX "discounts_is_active_idx" ON "discounts" USING btree ("is_active");
  CREATE INDEX "discounts_priority_idx" ON "discounts" USING btree ("priority");
  CREATE UNIQUE INDEX "discounts_code_idx" ON "discounts" USING btree ("code");
  CREATE INDEX "discounts_created_by_idx" ON "discounts" USING btree ("created_by_id");
  CREATE INDEX "discounts_updated_by_idx" ON "discounts" USING btree ("updated_by_id");
  CREATE INDEX "discounts_updated_at_idx" ON "discounts" USING btree ("updated_at");
  CREATE INDEX "discounts_created_at_idx" ON "discounts" USING btree ("created_at");
  CREATE INDEX "discounts_rels_order_idx" ON "discounts_rels" USING btree ("order");
  CREATE INDEX "discounts_rels_parent_idx" ON "discounts_rels" USING btree ("parent_id");
  CREATE INDEX "discounts_rels_path_idx" ON "discounts_rels" USING btree ("path");
  CREATE INDEX "discounts_rels_categories_id_idx" ON "discounts_rels" USING btree ("categories_id");
  CREATE INDEX "discounts_rels_products_id_idx" ON "discounts_rels" USING btree ("products_id");
  CREATE INDEX "companies_user_idx" ON "companies" USING btree ("user_id");
  CREATE INDEX "companies_company_name_idx" ON "companies" USING btree ("company_name");
  CREATE INDEX "companies_tax_number_idx" ON "companies" USING btree ("tax_number");
  CREATE INDEX "companies_updated_at_idx" ON "companies" USING btree ("updated_at");
  CREATE INDEX "companies_created_at_idx" ON "companies" USING btree ("created_at");
  CREATE INDEX "knowledge_topics_blocks_heading_order_idx" ON "knowledge_topics_blocks_heading" USING btree ("_order");
  CREATE INDEX "knowledge_topics_blocks_heading_parent_id_idx" ON "knowledge_topics_blocks_heading" USING btree ("_parent_id");
  CREATE INDEX "knowledge_topics_blocks_heading_path_idx" ON "knowledge_topics_blocks_heading" USING btree ("_path");
  CREATE INDEX "knowledge_topics_blocks_text_order_idx" ON "knowledge_topics_blocks_text" USING btree ("_order");
  CREATE INDEX "knowledge_topics_blocks_text_parent_id_idx" ON "knowledge_topics_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "knowledge_topics_blocks_text_path_idx" ON "knowledge_topics_blocks_text" USING btree ("_path");
  CREATE INDEX "knowledge_topics_blocks_image_order_idx" ON "knowledge_topics_blocks_image" USING btree ("_order");
  CREATE INDEX "knowledge_topics_blocks_image_parent_id_idx" ON "knowledge_topics_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "knowledge_topics_blocks_image_path_idx" ON "knowledge_topics_blocks_image" USING btree ("_path");
  CREATE INDEX "knowledge_topics_blocks_image_image_idx" ON "knowledge_topics_blocks_image" USING btree ("image_id");
  CREATE INDEX "knowledge_topics_blocks_link_order_idx" ON "knowledge_topics_blocks_link" USING btree ("_order");
  CREATE INDEX "knowledge_topics_blocks_link_parent_id_idx" ON "knowledge_topics_blocks_link" USING btree ("_parent_id");
  CREATE INDEX "knowledge_topics_blocks_link_path_idx" ON "knowledge_topics_blocks_link" USING btree ("_path");
  CREATE INDEX "knowledge_topics_tags_order_idx" ON "knowledge_topics_tags" USING btree ("_order");
  CREATE INDEX "knowledge_topics_tags_parent_id_idx" ON "knowledge_topics_tags" USING btree ("_parent_id");
  CREATE INDEX "knowledge_topics_title_idx" ON "knowledge_topics" USING btree ("title");
  CREATE UNIQUE INDEX "knowledge_topics_slug_idx" ON "knowledge_topics" USING btree ("slug");
  CREATE INDEX "knowledge_topics_image_idx" ON "knowledge_topics" USING btree ("image_id");
  CREATE INDEX "knowledge_topics_position_idx" ON "knowledge_topics" USING btree ("position");
  CREATE INDEX "knowledge_topics_published_idx" ON "knowledge_topics" USING btree ("published");
  CREATE INDEX "knowledge_topics_author_idx" ON "knowledge_topics" USING btree ("author_id");
  CREATE INDEX "knowledge_topics_seo_seo_og_image_idx" ON "knowledge_topics" USING btree ("seo_og_image_id");
  CREATE INDEX "knowledge_topics_updated_at_idx" ON "knowledge_topics" USING btree ("updated_at");
  CREATE INDEX "knowledge_topics_created_at_idx" ON "knowledge_topics" USING btree ("created_at");
  CREATE INDEX "wishlists_items_order_idx" ON "wishlists_items" USING btree ("_order");
  CREATE INDEX "wishlists_items_parent_id_idx" ON "wishlists_items" USING btree ("_parent_id");
  CREATE INDEX "wishlists_items_product_idx" ON "wishlists_items" USING btree ("product_id");
  CREATE UNIQUE INDEX "wishlists_user_idx" ON "wishlists" USING btree ("user_id");
  CREATE INDEX "wishlists_updated_at_idx" ON "wishlists" USING btree ("updated_at");
  CREATE INDEX "wishlists_created_at_idx" ON "wishlists" USING btree ("created_at");
  CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");
  CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");
  CREATE INDEX "notifications_is_read_idx" ON "notifications" USING btree ("is_read");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE INDEX "content_blocks_tags_order_idx" ON "content_blocks_tags" USING btree ("_order");
  CREATE INDEX "content_blocks_tags_parent_id_idx" ON "content_blocks_tags" USING btree ("_parent_id");
  CREATE INDEX "content_blocks_image_idx" ON "content_blocks" USING btree ("image_id");
  CREATE INDEX "content_blocks_position_idx" ON "content_blocks" USING btree ("position");
  CREATE INDEX "content_blocks_is_active_idx" ON "content_blocks" USING btree ("is_active");
  CREATE INDEX "content_blocks_created_by_idx" ON "content_blocks" USING btree ("created_by_id");
  CREATE INDEX "content_blocks_updated_by_idx" ON "content_blocks" USING btree ("updated_by_id");
  CREATE INDEX "content_blocks_updated_at_idx" ON "content_blocks" USING btree ("updated_at");
  CREATE INDEX "content_blocks_created_at_idx" ON "content_blocks" USING btree ("created_at");
  CREATE INDEX "otp_codes_user_idx" ON "otp_codes" USING btree ("user_id");
  CREATE INDEX "otp_codes_type_idx" ON "otp_codes" USING btree ("type");
  CREATE INDEX "otp_codes_expires_at_idx" ON "otp_codes" USING btree ("expires_at");
  CREATE INDEX "otp_codes_updated_at_idx" ON "otp_codes" USING btree ("updated_at");
  CREATE INDEX "otp_codes_created_at_idx" ON "otp_codes" USING btree ("created_at");
  CREATE INDEX "product_reviews_pros_order_idx" ON "product_reviews_pros" USING btree ("_order");
  CREATE INDEX "product_reviews_pros_parent_id_idx" ON "product_reviews_pros" USING btree ("_parent_id");
  CREATE INDEX "product_reviews_cons_order_idx" ON "product_reviews_cons" USING btree ("_order");
  CREATE INDEX "product_reviews_cons_parent_id_idx" ON "product_reviews_cons" USING btree ("_parent_id");
  CREATE INDEX "product_reviews_user_idx" ON "product_reviews" USING btree ("user_id");
  CREATE INDEX "product_reviews_product_idx" ON "product_reviews" USING btree ("product_id");
  CREATE INDEX "product_reviews_status_idx" ON "product_reviews" USING btree ("status");
  CREATE INDEX "product_reviews_updated_at_idx" ON "product_reviews" USING btree ("updated_at");
  CREATE INDEX "product_reviews_created_at_idx" ON "product_reviews" USING btree ("created_at");
  CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");
  CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");
  CREATE INDEX "sessions_revoked_idx" ON "sessions" USING btree ("revoked");
  CREATE INDEX "sessions_updated_at_idx" ON "sessions" USING btree ("updated_at");
  CREATE INDEX "user_consents_user_idx" ON "user_consents" USING btree ("user_id");
  CREATE INDEX "user_consents_consent_idx" ON "user_consents" USING btree ("consent_id");
  CREATE INDEX "user_consents_consent_slug_idx" ON "user_consents" USING btree ("consent_slug");
  CREATE INDEX "user_consents_updated_at_idx" ON "user_consents" USING btree ("updated_at");
  CREATE INDEX "user_consents_created_at_idx" ON "user_consents" USING btree ("created_at");
  CREATE UNIQUE INDEX "checkout_preferences_user_idx" ON "checkout_preferences" USING btree ("user_id");
  CREATE INDEX "checkout_preferences_delivery_delivery_transport_company_idx" ON "checkout_preferences" USING btree ("delivery_transport_company_id");
  CREATE INDEX "checkout_preferences_delivery_delivery_pickup_point_idx" ON "checkout_preferences" USING btree ("delivery_pickup_point_id");
  CREATE INDEX "checkout_preferences_updated_at_idx" ON "checkout_preferences" USING btree ("updated_at");
  CREATE INDEX "checkout_preferences_created_at_idx" ON "checkout_preferences" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_admins_id_idx" ON "payload_locked_documents_rels" USING btree ("admins_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_carts_id_idx" ON "payload_locked_documents_rels" USING btree ("carts_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_consents_id_idx" ON "payload_locked_documents_rels" USING btree ("consents_id");
  CREATE INDEX "payload_locked_documents_rels_feedbacks_id_idx" ON "payload_locked_documents_rels" USING btree ("feedbacks_id");
  CREATE INDEX "payload_locked_documents_rels_banners_id_idx" ON "payload_locked_documents_rels" USING btree ("banners_id");
  CREATE INDEX "payload_locked_documents_rels_pickup_points_id_idx" ON "payload_locked_documents_rels" USING btree ("pickup_points_id");
  CREATE INDEX "payload_locked_documents_rels_transport_companies_id_idx" ON "payload_locked_documents_rels" USING btree ("transport_companies_id");
  CREATE INDEX "payload_locked_documents_rels_discounts_id_idx" ON "payload_locked_documents_rels" USING btree ("discounts_id");
  CREATE INDEX "payload_locked_documents_rels_companies_id_idx" ON "payload_locked_documents_rels" USING btree ("companies_id");
  CREATE INDEX "payload_locked_documents_rels_knowledge_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("knowledge_topics_id");
  CREATE INDEX "payload_locked_documents_rels_wishlists_id_idx" ON "payload_locked_documents_rels" USING btree ("wishlists_id");
  CREATE INDEX "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");
  CREATE INDEX "payload_locked_documents_rels_content_blocks_id_idx" ON "payload_locked_documents_rels" USING btree ("content_blocks_id");
  CREATE INDEX "payload_locked_documents_rels_otp_codes_id_idx" ON "payload_locked_documents_rels" USING btree ("otp_codes_id");
  CREATE INDEX "payload_locked_documents_rels_product_reviews_id_idx" ON "payload_locked_documents_rels" USING btree ("product_reviews_id");
  CREATE INDEX "payload_locked_documents_rels_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("sessions_id");
  CREATE INDEX "payload_locked_documents_rels_user_consents_id_idx" ON "payload_locked_documents_rels" USING btree ("user_consents_id");
  CREATE INDEX "payload_locked_documents_rels_checkout_preferences_id_idx" ON "payload_locked_documents_rels" USING btree ("checkout_preferences_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_admins_id_idx" ON "payload_preferences_rels" USING btree ("admins_id");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "settings_phones_order_idx" ON "settings_phones" USING btree ("_order");
  CREATE INDEX "settings_phones_parent_id_idx" ON "settings_phones" USING btree ("_parent_id");
  CREATE INDEX "settings_emails_order_idx" ON "settings_emails" USING btree ("_order");
  CREATE INDEX "settings_emails_parent_id_idx" ON "settings_emails" USING btree ("_parent_id");
  CREATE INDEX "settings_social_links_order_idx" ON "settings_social_links" USING btree ("_order");
  CREATE INDEX "settings_social_links_parent_id_idx" ON "settings_social_links" USING btree ("_parent_id");
  CREATE INDEX "settings_other_contacts_order_idx" ON "settings_other_contacts" USING btree ("_order");
  CREATE INDEX "settings_other_contacts_parent_id_idx" ON "settings_other_contacts" USING btree ("_parent_id");
  CREATE INDEX "settings_logo_idx" ON "settings" USING btree ("logo_id");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "admins_sessions" CASCADE;
  DROP TABLE "admins" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "categories_keywords" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "categories_locales" CASCADE;
  DROP TABLE "products_specifications" CASCADE;
  DROP TABLE "products_seo_keywords" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "products_locales" CASCADE;
  DROP TABLE "products_rels" CASCADE;
  DROP TABLE "_products_v_version_specifications" CASCADE;
  DROP TABLE "_products_v_version_seo_keywords" CASCADE;
  DROP TABLE "_products_v" CASCADE;
  DROP TABLE "_products_v_locales" CASCADE;
  DROP TABLE "_products_v_rels" CASCADE;
  DROP TABLE "carts_items" CASCADE;
  DROP TABLE "carts" CASCADE;
  DROP TABLE "orders_items" CASCADE;
  DROP TABLE "orders_applied_discounts" CASCADE;
  DROP TABLE "orders_status_history" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "consents_history" CASCADE;
  DROP TABLE "consents" CASCADE;
  DROP TABLE "feedbacks_tags" CASCADE;
  DROP TABLE "feedbacks_internal_notes" CASCADE;
  DROP TABLE "feedbacks" CASCADE;
  DROP TABLE "feedbacks_rels" CASCADE;
  DROP TABLE "banners_targeting_roles" CASCADE;
  DROP TABLE "banners" CASCADE;
  DROP TABLE "banners_rels" CASCADE;
  DROP TABLE "_banners_v_version_targeting_roles" CASCADE;
  DROP TABLE "_banners_v" CASCADE;
  DROP TABLE "_banners_v_rels" CASCADE;
  DROP TABLE "pickup_points" CASCADE;
  DROP TABLE "transport_companies" CASCADE;
  DROP TABLE "discounts" CASCADE;
  DROP TABLE "discounts_rels" CASCADE;
  DROP TABLE "companies" CASCADE;
  DROP TABLE "knowledge_topics_blocks_heading" CASCADE;
  DROP TABLE "knowledge_topics_blocks_text" CASCADE;
  DROP TABLE "knowledge_topics_blocks_image" CASCADE;
  DROP TABLE "knowledge_topics_blocks_link" CASCADE;
  DROP TABLE "knowledge_topics_tags" CASCADE;
  DROP TABLE "knowledge_topics" CASCADE;
  DROP TABLE "wishlists_items" CASCADE;
  DROP TABLE "wishlists" CASCADE;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "content_blocks_tags" CASCADE;
  DROP TABLE "content_blocks" CASCADE;
  DROP TABLE "otp_codes" CASCADE;
  DROP TABLE "product_reviews_pros" CASCADE;
  DROP TABLE "product_reviews_cons" CASCADE;
  DROP TABLE "product_reviews" CASCADE;
  DROP TABLE "sessions" CASCADE;
  DROP TABLE "user_consents" CASCADE;
  DROP TABLE "checkout_preferences" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "settings_phones" CASCADE;
  DROP TABLE "settings_emails" CASCADE;
  DROP TABLE "settings_social_links" CASCADE;
  DROP TABLE "settings_other_contacts" CASCADE;
  DROP TABLE "settings" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_admins_role";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_users_status";
  DROP TYPE "public"."enum_media_type";
  DROP TYPE "public"."enum_products_pricing_discount_type";
  DROP TYPE "public"."product_status_enum";
  DROP TYPE "public"."instruction_type_enum";
  DROP TYPE "public"."enum_products_status";
  DROP TYPE "public"."enum__products_v_version_pricing_discount_type";
  DROP TYPE "public"."enum__products_v_version_status";
  DROP TYPE "public"."enum__products_v_published_locale";
  DROP TYPE "public"."enum_orders_status_history_status";
  DROP TYPE "public"."enum_orders_status";
  DROP TYPE "public"."enum_orders_delivery_method";
  DROP TYPE "public"."enum_orders_payment_method";
  DROP TYPE "public"."enum_orders_payment_status";
  DROP TYPE "public"."enum_orders_source";
  DROP TYPE "public"."enum_feedbacks_type";
  DROP TYPE "public"."enum_feedbacks_status";
  DROP TYPE "public"."enum_feedbacks_priority";
  DROP TYPE "public"."enum_feedbacks_user_role";
  DROP TYPE "public"."enum_banners_targeting_roles";
  DROP TYPE "public"."enum_banners_action";
  DROP TYPE "public"."enum_banners_status";
  DROP TYPE "public"."enum__banners_v_version_targeting_roles";
  DROP TYPE "public"."enum__banners_v_version_action";
  DROP TYPE "public"."enum__banners_v_version_status";
  DROP TYPE "public"."enum__banners_v_published_locale";
  DROP TYPE "public"."enum_discounts_type";
  DROP TYPE "public"."enum_notifications_type";
  DROP TYPE "public"."enum_notifications_push_status";
  DROP TYPE "public"."enum_content_blocks_variant";
  DROP TYPE "public"."enum_content_blocks_button_style";
  DROP TYPE "public"."enum_otp_codes_type";
  DROP TYPE "public"."enum_product_reviews_status";
  DROP TYPE "public"."enum_sessions_revoked_reason";
  DROP TYPE "public"."enum_checkout_preferences_delivery_method";
  DROP TYPE "public"."enum_settings_phones_type";
  DROP TYPE "public"."enum_settings_emails_type";
  DROP TYPE "public"."enum_settings_social_links_platform";
  DROP TYPE "public"."enum_settings_other_contacts_type";`);
}
