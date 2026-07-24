# Supabase migration

This directory contains the first migration away from Base44. Applying it does
not change the current Base44 site or Cloudflare DNS.

## Files

- `migrations/202607220001_base44_initial_schema.sql` creates the 22 legacy
  data tables, Supabase user profiles, indexes, triggers, restricted storefront
  views, admin guards, and row-level security policies.
- `base44-import-manifest.json` records export counts without including private
  customer data.
- `.private/base44-import/*.csv` contains import-ready customer and business
  data. This directory is intentionally ignored by Git.

## Deployment order

1. Link the Supabase CLI to the new production project.
2. Apply the SQL migration.
3. Create the first owner account through Supabase Auth.
4. Promote that profile to `admin` from the Supabase SQL editor. Never put the
   owner's email or a service-role key in this repository.
5. Import the prepared CSVs in this order:
   - `payment_fee_settings`, `payment_settings`, `ss_pricing_rules`
   - `vendors`, `vendor_pricing`
   - `products`, `garment_catalog_items`, `ss_catalog_items`
   - `quote_requests`, `quotes`, `orders`
   - `vendor_orders`, `vendor_order_drafts`
   - `customer_notifications`, `order_status_history`
   - `carts`, `wishlists`
   - `contact_messages`, `newsletter_subscribers`, `reviews`
6. Do not initially import `ss_import_staging` or `import_batches`; those are
   historical importer state rather than storefront production data.
7. Reconcile imported customer records with new Supabase Auth accounts by
   email and populate `owner_user_id` after customers register.
8. Migrate Base44-hosted files to Supabase Storage before cancelling Base44.
9. Replace Base44 frontend calls and backend functions, test the complete order
   and payment flow, then change Cloudflare DNS during the final cutover.

## First administrator

After the owner's Auth user exists, run the following in the Supabase SQL
editor, replacing the placeholder with the owner's actual email:

```sql
update public.profiles
set role = 'admin'
where lower(email) = lower('OWNER_EMAIL_HERE');
```

Confirm exactly one row was updated. Do not expose this operation through the
frontend.

## Security model

- Base tables are denied to anonymous users.
- Storefront products and active reviews are exposed through restricted views
  that omit vendor cost, profit, internal notes, files, and creator metadata.
- Customer order and notification views require an authenticated JWT and match
  the account ID or normalized email.
- Administrative tables require an authenticated profile with `role = 'admin'`.
- Cart and wishlist writes require `owner_user_id = auth.uid()`.

Legacy cross-table foreign keys and uniqueness constraints are intentionally
deferred until the known orphan notification and duplicate source rows have
been cleaned. Primary keys and Auth ownership constraints are enforced now.
