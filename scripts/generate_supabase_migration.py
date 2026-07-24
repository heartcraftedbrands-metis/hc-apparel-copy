"""Generate the initial Supabase schema from the exported Base44 entity schemas.

This generator intentionally preserves Base44 record IDs as text so imported
relationships remain stable. Authentication ownership is migrated separately
through owner_user_id and legacy_created_by_id.
"""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENTITY_DIR = ROOT / "base44" / "entities"
OUTPUT_DIR = ROOT / "supabase" / "migrations"
OUTPUT_FILE = OUTPUT_DIR / "202607220001_base44_initial_schema.sql"

TABLE_NAMES = {
    "Cart": "carts",
    "ContactMessage": "contact_messages",
    "CustomerNotification": "customer_notifications",
    "GarmentCatalog": "garment_catalog_items",
    "ImportBatch": "import_batches",
    "NewsletterSubscriber": "newsletter_subscribers",
    "Order": "orders",
    "OrderStatusHistory": "order_status_history",
    "PaymentFeeSettings": "payment_fee_settings",
    "PaymentSettings": "payment_settings",
    "Product": "products",
    "Quote": "quotes",
    "QuoteRequest": "quote_requests",
    "Review": "reviews",
    "SSCatalogItem": "ss_catalog_items",
    "SSImportStaging": "ss_import_staging",
    "SSPricingRules": "ss_pricing_rules",
    "Vendor": "vendors",
    "VendorOrder": "vendor_orders",
    "VendorOrderDraft": "vendor_order_drafts",
    "VendorPricing": "vendor_pricing",
    "Wishlist": "wishlists",
}

PUBLIC_READ = {}

OWNER_CRUD = {"carts", "wishlists"}

# Values present in the production export but omitted from the latest Base44
# entity enum definitions. Preserve them so migration does not rewrite history.
LEGACY_ENUM_VALUES = {
    ("garment_catalog_items", "material"): ["Cotton/Poly Fleece", "Ring Spun Cotton"],
    ("garment_catalog_items", "product_type"): ["Long Sleeve"],
    ("orders", "fulfillment_status"): ["sent_to_vendor"],
    ("products", "category"): ["apparel_blanks"],
    ("quotes", "status"): ["new"],
}

INDEXES = {
    "products": ["visibility", "is_active", "category", "supplier_sku", "created_date"],
    "orders": ["customer_email", "status", "payment_status", "stripe_session_id", "created_date"],
    "quote_requests": ["email", "status", "created_date"],
    "contact_messages": ["email", "status", "created_date"],
    "newsletter_subscribers": ["email", "is_active"],
    "garment_catalog_items": ["sku", "brand", "style_number", "status"],
    "ss_catalog_items": ["sku", "brand", "style_number", "catalog_status", "curated_status"],
    "ss_import_staging": ["import_session_id", "row_status", "sku"],
    "vendors": ["name", "is_active"],
    "vendor_orders": ["customer_order_id", "vendor_id", "status"],
    "vendor_order_drafts": ["customer_order_id", "vendor_status"],
    "vendor_pricing": ["vendor_id", "is_active"],
    "customer_notifications": ["order_id", "customer_email", "sent_status"],
}


def read_jsonc(path: Path):
    text = path.read_text(encoding="utf-8-sig")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"(^|\s)//.*", r"\1", text)
    return json.loads(text)


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def sql_type(spec):
    kind = spec.get("type")
    if kind == "string":
        if spec.get("format") == "date-time":
            return "timestamptz"
        if spec.get("format") == "date":
            return "date"
        return "text"
    if kind == "number":
        return "numeric"
    if kind == "integer":
        return "bigint"
    if kind == "boolean":
        return "boolean"
    if kind in {"array", "object"}:
        return "jsonb"
    return "jsonb"


def sql_literal(value, target_type):
    if value is None:
        return None
    if target_type == "boolean":
        return "true" if value else "false"
    if target_type in {"numeric", "bigint"}:
        return str(value)
    if target_type == "jsonb":
        return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"
    return "'" + str(value).replace("'", "''") + "'"


def column_sql(name, spec, required, extra_enum_values=None):
    target_type = sql_type(spec)
    parts = [ident(name), target_type]
    default = sql_literal(spec.get("default"), target_type)
    if default is not None:
        parts.extend(["default", default])
    if name in required:
        parts.append("not null")
    enum_values = list(spec.get("enum") or [])
    for value in extra_enum_values or []:
        if value not in enum_values:
            enum_values.append(value)
    if enum_values:
        allowed = ", ".join("'" + str(v).replace("'", "''") + "'" for v in enum_values)
        parts.append(f"check ({ident(name)} in ({allowed}))")
    return " ".join(parts)


def base_columns():
    return [
        '"id" text primary key default gen_random_uuid()::text',
        '"created_date" timestamptz not null default now()',
        '"updated_date" timestamptz not null default now()',
        '"legacy_created_by_id" text',
        '"created_by_email" text',
        '"owner_user_id" uuid references auth.users(id) on delete set null',
        '"is_sample" boolean not null default false',
    ]


def policy_name(prefix, table):
    return f"{prefix}_{table}"[:63]


def main():
    entities = []
    for path in sorted(ENTITY_DIR.glob("*.jsonc")):
        entity = read_jsonc(path)
        entity["table_name"] = TABLE_NAMES[entity["name"]]
        entities.append(entity)

    lines = [
        "-- Generated from base44/entities on 2026-07-22.",
        "-- Review before deployment. Run through Supabase migrations, not the dashboard table editor.",
        "begin;",
        "",
        "create extension if not exists pgcrypto;",
        "",
        "create table if not exists public.profiles (",
        "  id uuid primary key references auth.users(id) on delete cascade,",
        "  email text not null,",
        "  full_name text,",
        "  role text not null default 'customer' check (role in ('customer', 'admin')),",
        "  created_at timestamptz not null default now(),",
        "  updated_at timestamptz not null default now()",
        ");",
        "",
        "create or replace function public.set_updated_date()",
        "returns trigger language plpgsql as $$",
        "begin",
        "  new.updated_date = now();",
        "  return new;",
        "end;",
        "$$;",
        "",
        "create or replace function public.set_profile_updated_at()",
        "returns trigger language plpgsql as $$",
        "begin",
        "  new.updated_at = now();",
        "  return new;",
        "end;",
        "$$;",
        "",
        "create or replace function public.handle_new_auth_user()",
        "returns trigger language plpgsql security definer set search_path = public as $$",
        "begin",
        "  insert into public.profiles (id, email, full_name)",
        "  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name')",
        "  on conflict (id) do nothing;",
        "  return new;",
        "end;",
        "$$;",
        "",
        "drop trigger if exists on_auth_user_created on auth.users;",
        "create trigger on_auth_user_created",
        "after insert on auth.users for each row execute function public.handle_new_auth_user();",
        "",
        "drop trigger if exists profiles_set_updated_at on public.profiles;",
        "create trigger profiles_set_updated_at before update on public.profiles",
        "for each row execute function public.set_profile_updated_at();",
        "",
        "create or replace function public.is_admin()",
        "returns boolean language sql stable security definer set search_path = public as $$",
        "  select exists (",
        "    select 1 from public.profiles",
        "    where id = auth.uid() and role = 'admin'",
        "  );",
        "$$;",
        "",
        "revoke all on function public.is_admin() from public;",
        "grant execute on function public.is_admin() to authenticated;",
        "",
    ]

    for entity in entities:
        table = entity["table_name"]
        required = set(entity.get("required") or [])
        columns = base_columns()
        for name, spec in entity.get("properties", {}).items():
            columns.append(
                column_sql(
                    name,
                    spec,
                    required,
                    LEGACY_ENUM_VALUES.get((table, name)),
                )
            )
        if table == "vendor_orders":
            columns.append('"customer_paid_total" numeric')
        lines.extend([
            f"create table if not exists public.{ident(table)} (",
            "  " + ",\n  ".join(columns),
            ");",
            "",
            f"drop trigger if exists {ident(table + '_set_updated_date')} on public.{ident(table)};",
            f"create trigger {ident(table + '_set_updated_date')} before update on public.{ident(table)}",
            "for each row execute function public.set_updated_date();",
            "",
        ])

    for table, columns in INDEXES.items():
        for column in columns:
            index_name = f"idx_{table}_{column}"[:63]
            lines.append(
                f"create index if not exists {ident(index_name)} on public.{ident(table)} ({ident(column)});"
            )
    lines.extend([
        "create unique index if not exists idx_newsletter_subscribers_email_lower",
        "on public.newsletter_subscribers (lower(email));",
        "",
        "alter table public.profiles enable row level security;",
        "drop policy if exists profiles_select_own on public.profiles;",
        "create policy profiles_select_own on public.profiles for select to authenticated",
        "using (id = auth.uid() or public.is_admin());",
        "drop policy if exists profiles_admin_all on public.profiles;",
        "create policy profiles_admin_all on public.profiles for all to authenticated",
        "using (public.is_admin()) with check (public.is_admin());",
        "",
    ])

    for entity in entities:
        table = entity["table_name"]
        lines.append(f"alter table public.{ident(table)} enable row level security;")
        if table in PUBLIC_READ:
            condition = PUBLIC_READ[table]
            lines.extend([
                f"drop policy if exists {ident(policy_name('public_read', table))} on public.{ident(table)};",
                f"create policy {ident(policy_name('public_read', table))} on public.{ident(table)}",
                f"for select to anon, authenticated using ({condition});",
            ])
        if table in OWNER_CRUD:
            lines.extend([
                f"drop policy if exists {ident(policy_name('owner_select', table))} on public.{ident(table)};",
                f"create policy {ident(policy_name('owner_select', table))} on public.{ident(table)}",
                "for select to authenticated using (owner_user_id = auth.uid());",
                f"drop policy if exists {ident(policy_name('owner_insert', table))} on public.{ident(table)};",
                f"create policy {ident(policy_name('owner_insert', table))} on public.{ident(table)}",
                "for insert to authenticated with check (owner_user_id = auth.uid());",
                f"drop policy if exists {ident(policy_name('owner_update', table))} on public.{ident(table)};",
                f"create policy {ident(policy_name('owner_update', table))} on public.{ident(table)}",
                "for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());",
                f"drop policy if exists {ident(policy_name('owner_delete', table))} on public.{ident(table)};",
                f"create policy {ident(policy_name('owner_delete', table))} on public.{ident(table)}",
                "for delete to authenticated using (owner_user_id = auth.uid());",
            ])
        lines.extend([
            f"drop policy if exists {ident(policy_name('admin_all', table))} on public.{ident(table)};",
            f"create policy {ident(policy_name('admin_all', table))} on public.{ident(table)}",
            "for all to authenticated using (public.is_admin()) with check (public.is_admin());",
            "",
        ])

    table_list = ", ".join(f"public.{ident(e['table_name'])}" for e in entities)
    lines.extend([
        "create or replace view public.storefront_products",
        "with (security_barrier = true) as",
        "select id, name, description, price, sale_price, product_type, product_subtype,",
        "       design_type, visibility, image_url, mockup_images, stock, category, categories,",
        "       tags, is_featured, is_best_seller, available_sizes, available_colors, size_prices,",
        "       care_instructions, shipping_note, is_active, created_date, updated_date",
        "from public.products",
        "where visibility = 'public' and is_active is true;",
        "",
        "create or replace view public.storefront_reviews",
        "with (security_barrier = true) as",
        "select id, reviewer_name, rating, review_text, product_name, created_date",
        "from public.reviews",
        "where is_active is true;",
        "",
        "create or replace view public.customer_orders",
        "with (security_barrier = true) as",
        "select id, customer_email, customer_name, customer_phone, business_name, preferred_contact,",
        "       order_items, total_amount, amount_paid, balance_due, status, payment_status,",
        "       payment_method, payment_date, fulfillment_status, has_physical_items,",
        "       shipping_address, delivery_notes, notes, tracking_number, tracking_carrier,",
        "       tracking_url, shipped_date, delivery_estimate, created_date, updated_date",
        "from public.orders",
        "where owner_user_id = auth.uid()",
        "   or lower(customer_email) = lower(auth.jwt() ->> 'email');",
        "",
        "create or replace view public.customer_visible_notifications",
        "with (security_barrier = true) as",
        "select id, order_id, order_number, notification_type, customer_name, customer_email,",
        "       subject, customer_message, related_status, sent_status, sent_date, created_date",
        "from public.customer_notifications",
        "where customer_visible is true",
        "  and lower(customer_email) = lower(auth.jwt() ->> 'email');",
        "",
        f"revoke all on table {table_list} from anon, authenticated;",
        f"grant all on table {table_list} to authenticated;",
        "grant all on public.profiles to authenticated;",
        "revoke all on public.storefront_products, public.storefront_reviews, public.customer_orders, public.customer_visible_notifications from public;",
        "grant select on public.storefront_products, public.storefront_reviews to anon, authenticated;",
        "grant select on public.customer_orders, public.customer_visible_notifications to authenticated;",
        "",
        "commit;",
        "",
    ])

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text("\n".join(lines), encoding="utf-8")
    print(OUTPUT_FILE)


if __name__ == "__main__":
    main()
