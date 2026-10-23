import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const TARGET_EMAIL = 'indy.j5557@gmail.com';
const OWNER_EMAIL = 'heartfamilyco@gmail.com';
const SUPPORT_EMAIL = 'support@ilovehcapparel.net';
const OPERATION_KEY = 'yho-operations-onboarding:2026-10-19:v1';
const RECOVERY_OPERATION_KEY = 'yho-website-recovery:2026-10-23:v1';
const CONTROLLED_TEST_EMAIL = 'auth-recovery-test@ilovehcapparel.net';
const LOGO = 'https://bxsdajpldrdesnvjiubt.supabase.co/storage/v1/object/public/storefront-assets/legacy/8498fd234f415ff5_4bf10d633_1.png';
const SITE = 'https://www.ilovehcapparel.net';
const safe = (v: unknown, n = 500) => String(v || '').trim().slice(0, n);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const shell = (title: string, eyebrow: string, content: string) => `<!doctype html><html><body style="margin:0;background:#f8f4ee;color:#202227;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:640px;background:#fff;border:1px solid #ded5c4;border-radius:18px;overflow:hidden"><tr><td align="center" style="background:#4a5e2a;padding:20px"><img src="${LOGO}" width="150" alt="HC Apparel" style="display:block;width:150px;max-width:100%;height:auto"></td></tr><tr><td style="padding:28px 26px"><p style="margin:0 0 8px;color:#8a6b25;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${eyebrow}</p><h1 style="margin:0 0 18px;color:#26351f;font-size:30px">${title}</h1>${content}</td></tr><tr><td style="background:#26351f;padding:22px;text-align:center;color:#f8f4ee;font-size:12px;line-height:1.7"><a href="${SITE}" style="color:#ffd973">ilovehcapparel.net</a><br><a href="mailto:${SUPPORT_EMAIL}" style="color:#ffd973">${SUPPORT_EMAIL}</a></td></tr></table></td></tr></table></body></html>`;

async function sendBrevo(key: string, to: string, subject: string, html: string, text: string, tag: string) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': key, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ sender: { email: SUPPORT_EMAIL, name: 'HC Apparel' }, to: [{ email: to }], replyTo: { email: SUPPORT_EMAIL, name: 'HC Apparel' }, subject, htmlContent: html, textContent: text, tags: [tag] }), signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.messageId) throw new Error(`Brevo rejected ${tag} (${response.status}).`);
  return String(body.messageId);
}

async function caller(request: Request, admin: ReturnType<typeof createClient>, url: string) {
  const token = safe(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
  if (!token) return { token: '', user: null };
  const result = await admin.auth.getUser(token);
  return { token, user: result.data.user || null };
}

async function sendYhoRecovery(admin: ReturnType<typeof createClient>, brevoKey: string) {
  const diagnostic = await admin.rpc('ops_auth_account_diagnostic', { p_email: TARGET_EMAIL });
  if (diagnostic.error || !diagnostic.data?.usable) {
    return json({ error: 'YHO authentication account is not ready for recovery.', diagnostic: diagnostic.data || null }, 409);
  }
  const existing = await admin.from('ops_email_delivery_ledger').select('*').eq('operation_key', RECOVERY_OPERATION_KEY).maybeSingle();
  if (existing.data?.provider_message_id && ['accepted','delivered'].includes(existing.data.delivery_status)) {
    return json({ accepted: true, duplicate: true, recipient: TARGET_EMAIL, messageId: existing.data.provider_message_id, deliveryStatus: existing.data.delivery_status, diagnostic: diagnostic.data });
  }
  if (!brevoKey) return json({ error: 'Brevo transactional delivery is not configured.' }, 424);

  await admin.from('ops_email_delivery_ledger').upsert({
    operation_key: RECOVERY_OPERATION_KEY,
    recipient: TARGET_EMAIL,
    subject: 'HC Apparel secure password recovery',
    provider: 'brevo',
    delivery_status: 'sending',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'operation_key' });
  await admin.from('ops_auth_recovery_attempts').upsert({
    operation_key: RECOVERY_OPERATION_KEY,
    user_id: diagnostic.data.user_id,
    email: TARGET_EMAIL,
    account_state: diagnostic.data,
    delivery_status: 'sending',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'operation_key' });

  const link = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: TARGET_EMAIL,
    options: { redirectTo: `${SITE}/ResetPassword` },
  });
  if (link.error || !link.data.properties?.action_link) {
    const message = 'Supabase could not generate the recovery link.';
    await admin.from('ops_auth_recovery_attempts').update({ delivery_status: 'failed', last_error: message, updated_at: new Date().toISOString() }).eq('operation_key', RECOVERY_OPERATION_KEY);
    await admin.from('ops_email_delivery_ledger').update({ delivery_status: 'failed', last_error: message, updated_at: new Date().toISOString() }).eq('operation_key', RECOVERY_OPERATION_KEY);
    return json({ error: message }, 502);
  }

  const actionLink = link.data.properties.action_link;
  const html = shell('Choose a new HC Apparel password', 'Secure website access', `<p>Hi YHo,</p><p>Your existing HC Apparel website account is ready. Use the secure button below to choose a password that only you know.</p><p style="text-align:center;margin:26px 0"><a href="${actionLink}" style="display:inline-block;background:#e8a910;color:#202227;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px">Choose my password</a></p><p>Open the newest message in Safari on your iPhone. After saving your password, HC Apparel will return you to the secure Business Action Center with your Operations Manager permissions.</p><p style="background:#f8f4ee;padding:14px;border-radius:10px"><strong>Important:</strong> This link is single-use and time-limited. If it has expired or was already used, the page will explain what happened and let you request another link. HC Apparel will never ask you to email your password.</p>`);
  try {
    const messageId = await sendBrevo(brevoKey, TARGET_EMAIL, 'HC Apparel secure password recovery', html, `Hi YHo,\n\nUse this secure, single-use link to choose your HC Apparel password: ${actionLink}\n\nOpen the newest message in Safari. After saving your password, you will return to the Business Action Center with Operations Manager access. If the link expired or was already used, request another link from the page. HC Apparel will never ask you to email your password.`, 'yho-website-recovery');
    const now = new Date().toISOString();
    await admin.from('ops_email_delivery_ledger').update({ provider_message_id: messageId, delivery_status: 'accepted', accepted_at: now, last_error: null, updated_at: now }).eq('operation_key', RECOVERY_OPERATION_KEY);
    await admin.from('ops_auth_recovery_attempts').update({ provider_message_id: messageId, delivery_status: 'accepted', last_error: null, updated_at: now }).eq('operation_key', RECOVERY_OPERATION_KEY);
    return json({ accepted: true, duplicate: false, recipient: TARGET_EMAIL, messageId, deliveryStatus: 'accepted', diagnostic: diagnostic.data });
  } catch (error) {
    const message = safe((error as Error).message, 300);
    await admin.from('ops_email_delivery_ledger').update({ delivery_status: 'unknown', last_error: message, updated_at: new Date().toISOString() }).eq('operation_key', RECOVERY_OPERATION_KEY);
    await admin.from('ops_auth_recovery_attempts').update({ delivery_status: 'unknown', last_error: message, updated_at: new Date().toISOString() }).eq('operation_key', RECOVERY_OPERATION_KEY);
    return json({ error: 'The provider response was uncertain. The message was not retried.', deliveryStatus: 'unknown' }, 502);
  }
}

async function runControlledRecoveryTest(admin: ReturnType<typeof createClient>, url: string) {
  const started = new Date().toISOString();
  const initialPassword = `Hc-Test-${crypto.randomUUID()}!9aA`;
  const finalPassword = `Hc-Recovered-${crypto.randomUUID()}!9aA`;
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) return json({ error: 'Controlled account lookup failed.' }, 502);
  let testUser = users.data.users.find((user) => user.email?.toLowerCase() === CONTROLLED_TEST_EMAIL);
  if (!testUser) {
    const created = await admin.auth.admin.createUser({
      email: CONTROLLED_TEST_EMAIL,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { full_name: 'HC Auth Recovery Test', is_sample: true },
      app_metadata: { is_sample: true },
    });
    if (created.error || !created.data.user) return json({ error: 'Controlled auth account creation failed.' }, 502);
    testUser = created.data.user;
  }
  const run = await admin.from('ops_auth_recovery_test_runs').insert({ test_email: CONTROLLED_TEST_EMAIL, status: 'running', started_at: started }).select('id').single();
  if (run.error) return json({ error: 'Controlled recovery test could not be recorded.' }, 500);
  try {
    const link = await admin.auth.admin.generateLink({ type: 'recovery', email: CONTROLLED_TEST_EMAIL, options: { redirectTo: `${SITE}/ResetPassword` } });
    const tokenHash = link.data.properties?.hashed_token;
    if (link.error || !tokenHash) throw new Error('Recovery token generation failed');
    const authClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') || '', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const verified = await authClient.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
    if (verified.error || !verified.data.session) throw new Error('Recovery session verification failed');
    const updated = await authClient.auth.updateUser({ password: finalPassword });
    if (updated.error) throw new Error('Recovery password update failed');
    await authClient.auth.signOut();
    const signInClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') || '', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const signedIn = await signInClient.auth.signInWithPassword({ email: CONTROLLED_TEST_EMAIL, password: finalPassword });
    if (signedIn.error || signedIn.data.user?.id !== testUser.id) throw new Error('Recovered password sign-in failed');
    await signInClient.auth.signOut();
    const completed = new Date().toISOString();
    const evidence = {
      test_data: true,
      email_provider: 'email',
      recovery_link_generated: true,
      recovery_session_verified: true,
      password_updated: true,
      recovered_password_sign_in_confirmed: true,
      redirect_url: `${SITE}/ResetPassword`,
      supplier_or_payment_activity: false,
    };
    await admin.from('ops_auth_recovery_test_runs').update({ status: 'passed', evidence, completed_at: completed }).eq('id', run.data.id);
    return json({ passed: true, testEmail: CONTROLLED_TEST_EMAIL, evidence, startedAt: started, completedAt: completed });
  } catch (error) {
    const message = safe((error as Error).message, 240);
    await admin.from('ops_auth_recovery_test_runs').update({ status: 'failed', last_error: message, completed_at: new Date().toISOString() }).eq('id', run.data.id);
    return json({ passed: false, error: message, testEmail: CONTROLLED_TEST_EMAIL }, 500);
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const url = Deno.env.get('SUPABASE_URL') || '', role = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const admin = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
  const input = await request.json().catch(() => ({}));
  const action = safe(input.action, 60);
  const suppliedInternalToken = safe(request.headers.get('x-operations-token'), 200);
  const runtime = await admin.from('operations_runtime_config').select('monitor_token').eq('id', true).maybeSingle();
  const internalAuthorized = Boolean(suppliedInternalToken && runtime.data?.monitor_token && suppliedInternalToken === runtime.data.monitor_token);
  if (internalAuthorized && action === 'send_recovery') return sendYhoRecovery(admin, safe(Deno.env.get('BREVO_API_KEY'), 500));
  if (internalAuthorized && action === 'run_controlled_test') return runControlledRecoveryTest(admin, url);

  const who = await caller(request, admin, url);
  if (!who.user) return json({ error: 'Authentication required.' }, 401);

  if (action === 'complete_password_setup') {
    if (who.user.email?.toLowerCase() !== TARGET_EMAIL) return json({ error: 'This setup belongs to another account.' }, 403);
    const pending = await admin.from('ops_auth_onboarding').select('*').eq('user_id', who.user.id).eq('status', 'pending').maybeSingle();
    if (!pending.data) return json({ error: 'This setup link was already used or is no longer active.' }, 409);
    if (!pending.data.expires_at || new Date(pending.data.expires_at) <= new Date()) {
      await admin.from('ops_auth_onboarding').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('user_id', who.user.id).eq('status', 'pending');
      return json({ error: 'This setup link has expired. Ask HC Apparel support for a new link.' }, 410);
    }
    const password = String(input.password || '');
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return json({ error: 'Use at least 12 characters with uppercase, lowercase, a number, and a symbol.' }, 400);
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') || '', { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${who.token}` } } });
    const changed = await userClient.auth.updateUser({ password });
    if (changed.error) return json({ error: safe(changed.error.message, 240) }, 400);
    const completedAt = new Date().toISOString();
    const reserved = await admin.from('ops_auth_onboarding').update({ status: 'completed', completed_at: completedAt, updated_at: completedAt, last_error: null }).eq('user_id', who.user.id).eq('status', 'pending').select('*').maybeSingle();
    if (!reserved.data) return json({ error: 'Password changed, but completion reconciliation is required. Do not repeat the password change.' }, 409);
    let confirmationStatus = 'pending', confirmationMessageId = reserved.data.confirmation_message_id;
    if (!confirmationMessageId) {
      const key = safe(Deno.env.get('BREVO_API_KEY'), 500);
      if (key) try {
        const eastern = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long', timeZone: 'America/New_York' }).format(new Date(completedAt));
        const html = shell('Password setup confirmed', 'Security confirmation', `<p>Supabase Auth confirmed that YHO completed password setup.</p><p style="background:#f8f4ee;padding:14px;border-radius:10px"><strong>Name:</strong> YHO<br><strong>Email:</strong> ${TARGET_EMAIL}<br><strong>Confirmed:</strong> ${eastern}</p><p>No password or recovery token is included.</p>`);
        confirmationMessageId = await sendBrevo(key, SUPPORT_EMAIL, 'HC Operations password setup confirmed', html, `Supabase Auth confirmed that YHO completed password setup.\nName: YHO\nEmail: ${TARGET_EMAIL}\nConfirmed: ${eastern}\n\nNo password or recovery token is included.`, 'yho-password-confirmed');
        confirmationStatus = 'accepted';
        await admin.from('ops_auth_onboarding').update({ confirmation_message_id: confirmationMessageId, confirmation_delivery_status: confirmationStatus, updated_at: new Date().toISOString() }).eq('user_id', who.user.id).is('confirmation_message_id', null);
      } catch (error) {
        await admin.from('ops_auth_onboarding').update({ confirmation_delivery_status: 'failed', last_error: safe((error as Error).message, 300), updated_at: new Date().toISOString() }).eq('user_id', who.user.id);
        confirmationStatus = 'failed';
      }
    }
    return json({ completed: true, completedAt, confirmationStatus });
  }

  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') || '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${who.token}` } },
  });
  const adminCheck = await userClient.rpc('is_admin');
  console.log(JSON.stringify({ event: 'operations_onboarding_admin_check', ok: !adminCheck.error && Boolean(adminCheck.data), error: adminCheck.error?.message || null }));
  if (adminCheck.error || !adminCheck.data) return json({ error: 'Administrator access required.' }, 403);
  if (action === 'status') {
    const row = await admin.from('ops_auth_onboarding').select('status,expires_at,onboarding_message_id,onboarding_delivery_status,confirmation_message_id,confirmation_delivery_status,last_error').eq('operation_key', OPERATION_KEY).maybeSingle();
    return json({ configured: Boolean(Deno.env.get('BREVO_API_KEY')), onboarding: row.data || null });
  }
  if (action !== 'send_approved') return json({ error: 'Unsupported action.' }, 400);
  const key = safe(Deno.env.get('BREVO_API_KEY'), 500);
  if (!key) return json({ error: 'Brevo transactional delivery is not configured.' }, 424);
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const matches = (users.data.users || []).filter(user => user.email?.toLowerCase() === TARGET_EMAIL);
  console.log(JSON.stringify({ event: 'operations_onboarding_account_match', count: matches.length, listError: users.error?.message || null }));
  if (matches.length !== 1) return json({ error: matches.length ? 'YHO email matched more than one auth account.' : 'YHO auth account was not found.' }, 409);
  const target = matches[0];
  const membership = await admin.from('ops_business_memberships').select('access_role').eq('user_id', target.id).eq('business_id', 'hc-apparel').maybeSingle();
  console.log(JSON.stringify({ event: 'operations_onboarding_membership', role: membership.data?.access_role || null, error: membership.error?.message || null }));
  if (membership.data?.access_role !== 'operations_manager') return json({ error: 'YHO operations_manager membership was not found.' }, 409);
  let row = (await admin.from('ops_auth_onboarding').select('*').eq('operation_key', OPERATION_KEY).maybeSingle()).data;
  if (!row) {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const inserted = await admin.from('ops_auth_onboarding').insert({ user_id: target.id, email: TARGET_EMAIL, status: 'pending', expires_at: expiresAt, operation_key: OPERATION_KEY }).select('*').single();
    if (inserted.error) return json({ error: inserted.error.message }, 500);
    row = inserted.data;
  }
  const results: Record<string, unknown> = {};
  if (!row.onboarding_message_id && row.onboarding_delivery_status !== 'unknown') {
    const link = await admin.auth.admin.generateLink({ type: 'recovery', email: TARGET_EMAIL, options: { redirectTo: `${SITE}/ResetPassword?onboarding=yho` } });
    if (link.error || !link.data.properties?.action_link) return json({ error: 'Supabase could not generate the single-use setup link.' }, 502);
    const actionLink = link.data.properties.action_link;
    const content = `<p>Your existing HC account is ready to use with <strong>${TARGET_EMAIL}</strong>.</p><ol><li>Open <a href="${SITE}/Operations">HC Operations</a> in Safari.</li><li>Use the secure button below to choose your password. It is single-use and expires in one hour.</li><li>Sign in, tap <strong>Share → Add to Home Screen</strong>, enable <strong>Open as Web App</strong> if shown, name it <strong>HC Ops</strong>, and tap Add.</li></ol><h2>Receipts</h2><p>Use Camera or Photos/Files. Saved on this device is local; Pending sync is waiting; Sync failed stays local and can be retried; Synced means the server record and private file are confirmed.</p><h2>Trips</h2><p>Enter vehicle, date, starting and ending odometer readings, and business purpose. The web app cannot guarantee continuous GPS while the phone is locked or Waze is active. Use odometer/manual information and review visible gaps.</p><p>Orders and invoices are available according to your role. To leave the app, tap <strong>Account → Sign Out</strong> after checking pending uploads.</p><p style="text-align:center"><a href="${actionLink}" style="display:inline-block;background:#e8a910;color:#202227;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px">Choose your password</a></p>`;
    try {
      const id = await sendBrevo(key, TARGET_EMAIL, 'Welcome to HC Operations — choose your password', shell('Welcome, YHO', 'HC Operations', content), `Welcome to HC Operations.\n\nOpen ${SITE}/Operations in Safari. Use this single-use link within one hour to choose your password: ${actionLink}\n\nAdd HC Ops to the Home Screen using Share → Add to Home Screen. Receipt states are Saved on this device, Pending sync, Sync failed, and Synced. Use odometer readings for trips; continuous background GPS is not guaranteed while the phone is locked or Waze is active. Use Account → Sign Out after checking pending uploads.`, 'yho-operations-onboarding');
      await admin.from('ops_auth_onboarding').update({ onboarding_message_id: id, onboarding_delivery_status: 'accepted', last_error: null, updated_at: new Date().toISOString() }).eq('operation_key', OPERATION_KEY).is('onboarding_message_id', null);
      results.onboarding = { status: 'accepted', messageId: id, recipient: TARGET_EMAIL };
    } catch (error) {
      await admin.from('ops_auth_onboarding').update({ onboarding_delivery_status: 'unknown', last_error: safe((error as Error).message, 300), updated_at: new Date().toISOString() }).eq('operation_key', OPERATION_KEY);
      return json({ error: 'The onboarding provider response was uncertain. It was not retried.', status: 'unknown' }, 502);
    }
  } else results.onboarding = { status: row.onboarding_delivery_status, messageId: row.onboarding_message_id, duplicate: true };

  const planKey = 'marketing-plan-email:2026-10-19:v1';
  const existingPlan = await admin.from('ops_email_delivery_ledger').select('provider_message_id,delivery_status').eq('operation_key', planKey).maybeSingle();
  if (!existingPlan.data) {
    const html = shell('HC Apparel Marketing Plan', 'October 19, 2026', `<p>Here’s the current plan for HC Apparel’s organic marketing.</p><p><strong>Facebook:</strong> We use 9 AM, 3 PM, and 6 PM Eastern on the same campaign dates. Exact images, captions, Pages, and times are approved in Codex before scheduling.</p><p>RF494 is confirmed scheduled for October 19 at 6 PM Eastern. Five more approved 6 PM posts are waiting for free Buffer capacity. Scheduled is not Published, so provider status is checked after each due time.</p><p><strong>Email:</strong> Four product campaigns are recorded for October 27, November 10, November 24, and December 8 at 10 AM Eastern. Provider confirmation remains separate from the local schedule.</p><p><strong>Short video:</strong> Three vertical concepts are prepared for review. Nothing is published without approval.</p><p><strong>Reporting:</strong> Tagged website visits, instrumented quote requests, and paid purchases can be reported, subject to privacy and cross-device attribution limits.</p><p><strong>Messages and comments:</strong> Facebook replies require exact approval. Automatic comment ingestion remains blocked until a real webhook event is verified.</p><p>No paid upgrade, boosted post, or new service will be started without authorization.</p>`);
    try {
      const id = await sendBrevo(key, OWNER_EMAIL, 'HC Apparel Marketing Plan', html, 'HC Apparel Marketing Plan\n\nFacebook uses 9 AM, 3 PM, and 6 PM Eastern on shared campaign dates. RF494 is scheduled for October 19 at 6 PM, and five approved posts are waiting for Buffer capacity. Four email campaigns are recorded for October 27, November 10, November 24, and December 8 at 10 AM Eastern. Three short-video concepts are prepared. Website conversions are tracked with attribution limits. Facebook replies require approval and automatic comment ingestion remains blocked. No paid upgrades without authorization.', 'hc-marketing-plan');
      await admin.from('ops_email_delivery_ledger').insert({ operation_key: planKey, recipient: OWNER_EMAIL, subject: 'HC Apparel Marketing Plan', delivery_status: 'accepted', provider: 'brevo', provider_message_id: id, accepted_at: new Date().toISOString() });
      results.marketingPlan = { status: 'accepted', messageId: id, recipient: OWNER_EMAIL };
    } catch (error) {
      return json({ ...results, error: 'The marketing-plan provider response was uncertain. It was not retried.', status: 'unknown' }, 502);
    }
  } else results.marketingPlan = { status: existingPlan.data.delivery_status, messageId: existingPlan.data.provider_message_id, duplicate: true };
  return json({ accepted: true, ...results });
});
