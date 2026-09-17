# HC Apparel productivity calendar setup

Deploy `202609170002_productivity_calendar.sql` and `202609170003_calendar_team_assignments.sql`, then deploy the `productivity-calendar` Supabase Edge Function **with JWT verification disabled at the gateway**. The function verifies the admin JWT itself for every POST action; its unauthenticated GET is solely the short-lived OAuth callback. Do not visit the callback with a real code by hand. The second migration grants `service_role` only `SELECT (id, role)` on `public.profiles`; browser grants are unchanged.

The exact Google Cloud **Authorized redirect URI** expected by the code is:

`https://bxsdajpldrdesnvjiubt.supabase.co/functions/v1/productivity-calendar`

Create a Google Cloud OAuth web application, enable Google Calendar API, configure the consent screen/test user for `heartfamilyco@gmail.com`, and set that exact authorized redirect URI. It must match the Supabase secret `GOOGLE_REDIRECT_URI` byte-for-byte. The requested scopes are `openid`, `email`, `calendar.calendarlist.readonly`, `calendar.events`, and `calendar.app.created` (the last scope is needed only to create the two secondary team calendars).

Set these Supabase Edge Function secrets (never use a `VITE_` prefix):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` = the exact URI above
- `OPENAI_API_KEY` (existing secret, reused for text-only scheduling suggestions)

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function. `DEFAULT_OPERATIONS_CALENDAR_ID` is **not used**; assigning two distinct writable team calendars in Calendar Settings is required. Access and refresh tokens are encrypted with AES-GCM using a key derived server-side from `GOOGLE_CLIENT_SECRET`; rotating that client secret requires reconnecting Google Calendar. Token tables have no browser-role grants or RLS policies.

The connection is limited to the Google identity `heartfamilyco@gmail.com` after consent. It does not create calendars automatically. An admin can select existing writable calendars or explicitly confirm creation of `HC Apparel — King Terik` and `HC Apparel — YHO Operations`; optional `HC Apparel Operations` is a shared fallback. YHO / Mario is an internal assignee with a placeholder email and receives no invitation. AI sees only operational IDs/statuses/dates, not customer contact or payment data. Suggestions never create events automatically. A saved suggestion must be edited/reviewed, marked approved, have a matching writable team calendar and a checked confirmation, then pass a final confirmation before the server inserts a single event. The Google request includes no attendees and uses `sendUpdates=none`.

To test safely before approving a real event: visit `/AdminTeamProductivity`, `/AdminCalendarSettings`, `/AdminProductivityDashboard`; verify that a customer account is redirected away from each, check staff data, connect Google, list/select calendars, and generate a suggestion. Stop before **Approve & Create Event** unless separately authorized.
