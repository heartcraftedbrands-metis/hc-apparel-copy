# Social Media Studio setup

The admin page is `/AdminSocialMediaStudio`. It is protected by the existing admin route, and its Edge Function checks the signed-in user's admin role again before using OpenAI or Buffer.

## Deploy

1. Apply `supabase/migrations/202609160001_social_media_studio.sql` to the HC Apparel Supabase project.
2. Deploy the `social-media-studio` Edge Function from `supabase/functions/social-media-studio`.
3. Set these **Supabase Edge Function secrets**, never `VITE_` browser variables:
   - `OPENAI_API_KEY` — required to generate copy and images.
   - `SOCIAL_STUDIO_ENCRYPTION_KEY` — required to connect Buffer from the admin page. Use 32 cryptographically random bytes encoded as base64; retain the same value when redeploying, because changing it makes a stored Buffer key unreadable.
   - `BUFFER_API_KEY` — optional alternative to entering the key in the admin page. Keep it server-side only.
   - `OPENAI_TEXT_MODEL` and `OPENAI_IMAGE_MODEL` — optional; defaults are `gpt-4o-mini` and `gpt-image-1`.
4. Open Social Media Studio as an admin. Under **Buffer connection settings**, enter a Buffer personal API key. The function verifies the account, encrypts the key, and stores only ciphertext and a random IV in the service-role-only credentials table. The browser never receives the saved key.

Generated images are saved under `social-studio/` in the existing public `storefront-assets` bucket so Buffer can fetch them. Image generation starts at 1024×1024 (square); the page presents it as a square social post. The image is not automatically resized to exactly 1080×1080. The function can use a selected existing product image as an edit reference when it has a reachable HTTPS URL; otherwise select **Generate without reference**.

Generating a post creates a private local draft. **Save Draft** stores reviewed edits; **Send to Buffer Drafts** creates an unpublished Buffer draft; **Schedule in Buffer** either uses the next queue slot or the selected future time. No generation action publishes a post. Post history records the last confirmed handoff; use **Refresh Buffer status** to check whether Buffer has subsequently published it.

If the migration, secrets, or Buffer connection are missing, the admin page reports a setup error and does not send anything. Verify the credentials and a test draft in a non-production Buffer channel before scheduling real posts.
