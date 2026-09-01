# HC Apparel — Future GoDaddy Static Hosting Setup

## Current status

HC Apparel is being built and tested locally, with Supabase providing the
database, authentication, Row Level Security, RPC functions, and Edge
Functions. The public frontend is not hosted yet, and the domain must not be
connected until the system is complete and final QA has passed.

This repository uses Vite and React. The production command is:

```bash
npm run build
```

The generated static frontend is written to:

```text
dist/
```

Upload the **contents of `dist/`**, not the outer `dist` directory, to the
future GoDaddy web root.

## 1. Install dependencies

Use a current Node.js LTS release (Node 20 or 22) on the computer or CI runner
that will create the deployment package.

```bash
git clone <HC_APPAREL_GITHUB_REPOSITORY>
cd hc-apparel-copy
npm ci
```

`npm ci` uses the committed `package-lock.json` and produces a repeatable
dependency installation. GoDaddy does not need Node.js when it is only serving
the generated static files.

## 2. Create production frontend environment variables

Create an uncommitted `.env.production.local` file in the project root:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

These are the only Supabase values required by the frontend build:

- `VITE_SUPABASE_URL`: the public HTTPS URL for the Supabase project.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the browser-safe Supabase publishable
  (formerly anon) key.

Important security rules:

- Every variable beginning with `VITE_` is embedded in the browser bundle and
  must be treated as public.
- Never place a Supabase service-role or secret key in a `VITE_` variable.
- Never upload `.env`, `.env.local`, or `.env.production.local` to GoDaddy.
- Supabase Row Level Security and admin guards must remain enabled because a
  publishable key does not replace database authorization.

### Backend-only secrets

The following values remain encrypted Supabase backend/Edge Function secrets
and must never be copied into the frontend environment or uploaded files:

```text
SS_ACCOUNT_NUMBER
SS_API_KEY
```

Any future email, payment, webhook, or other privileged credentials must follow
the same backend-only rule.

## 3. Build the static frontend

Run the quick code checks and create the production files:

```bash
npm run lint
npm run build
```

After a successful build, verify that `dist/` contains at least:

```text
dist/
  index.html
  assets/
```

The production environment variables are compiled into the JavaScript bundle
at build time. Rebuild and re-upload the files whenever a public frontend
environment value changes.

An optional local inspection can be run before any upload:

```bash
npm run preview
```

This local preview is not a replacement for final pre-launch QA.

## 4. Upload to GoDaddy later

Do not perform these steps until the frontend is approved for launch.

1. Confirm the GoDaddy plan provides Linux/cPanel static file hosting.
2. Open cPanel File Manager or connect using SFTP.
3. Back up any existing document-root files.
4. Open the domain document root, commonly `public_html/`.
5. Upload **all files and directories inside `dist/`** into that document root.
6. Preserve the `assets/` directory structure and hashed filenames.
7. Confirm HTTPS is active before opening the site to customers.

Do not upload source files, `node_modules/`, Supabase migrations, local
environment files, Git history, or backend secrets.

### React route fallback

The app uses browser-based React routes. Direct visits to paths such as
`/ProductDetail` or `/ResetPassword` must be routed back to `index.html`.

For a GoDaddy Linux/Apache plan, place this `.htaccess` file in the uploaded web
root:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

Enable “show hidden files” in File Manager so `.htaccess` is visible. If the
future GoDaddy plan uses a different server type, use that plan's equivalent
SPA fallback instead of this Apache rule.

## 5. Keep Supabase connected

GoDaddy will serve only the HTML, CSS, JavaScript, and image assets. The
frontend will continue making HTTPS requests to Supabase using the compiled
project URL and publishable key.

Before launch:

1. Keep all database migrations and Edge Functions deployed in Supabase.
2. Keep RLS policies, admin guards, and backend validation enabled.
3. Add the final HTTPS site URLs to Supabase Authentication URL Configuration.
4. Set the final Site URL and approved redirect URLs for sign-in, invitations,
   password recovery, and authentication callbacks.
5. Verify any Edge Function origin policy permits only the required production
   and approved testing origins.
6. Run the full final QA only after the hosting and authentication URLs are
   ready.

## 6. Connect the domain and DNS later

Do not change DNS during setup.

When launch is approved:

1. Obtain the exact IP address or DNS target from the GoDaddy hosting account.
2. Identify the domain's active authoritative DNS provider.
3. Add the required apex (`@`) and `www` records at that authoritative provider.
4. Avoid changing nameservers unless the hosting plan specifically requires it.
5. Configure one canonical hostname and redirect the alternate hostname.
6. Wait for the SSL certificate to become valid before sending customer
   traffic.
7. Update Supabase authentication URLs to the final HTTPS hostnames.
8. Run final desktop/mobile, authentication, checkout, quote, admin, security,
   and post-deployment QA before opening the site.

## Safety state that must remain in place

This hosting preparation does not change application or backend data:

- Live S&S order submission remains disabled.
- ZeroTouch remains test/preview only and reports `submitted: false`.
- S&S product loading remains paused.
- The public product count remains 64.
- Batch 4 must not be created.
- No real S&S order may be placed during setup.
- The public frontend and domain remain disconnected until final approval.

<!-- Vercel deployment trigger: 2026-09-01 -->
