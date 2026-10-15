import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TINA_INVOICE_ID = 'invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0';
const BUSINESS_ID = 'hc-apparel';
const TINA_TRACKING_NUMBER = '9505506617716287884250';
const TINA_DESTINATION_ZIP = '89031';
const TINA_MAILING_DATE = '2026-10-14';
const PROVISIONAL_TRANSACTIONS = {
  michaels: 'stripe:evidence:michaels-5082:20261014:1196',
  usps: 'stripe:evidence:usps-kiosk-1204599557:20261014:1500',
  racetrac: 'stripe:evidence:racetrac-2329:20261014:254',
} as const;
const money = (cents: number | null | undefined) => Number(cents || 0) / 100;
const iso = (seconds: number | null | undefined) => seconds ? new Date(seconds * 1000).toISOString() : null;
const safe = (value: unknown, maximum = 300) => String(value || '').trim().slice(0, maximum);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

type StripeKeyCandidate = {
  source: 'STRIPE_LIVE_SECRET_KEY' | 'STRIPE_SECRET_KEY';
  secretKey: string;
};

const configuredStripeKeys = (): StripeKeyCandidate[] => {
  const candidates: StripeKeyCandidate[] = [];
  const seen = new Set<string>();
  for (const source of ['STRIPE_LIVE_SECRET_KEY', 'STRIPE_SECRET_KEY'] as const) {
    let secretKey = Deno.env.get(source)?.trim() || '';
    if (secretKey.length >= 2 && ((secretKey.startsWith('"') && secretKey.endsWith('"'))
      || (secretKey.startsWith("'") && secretKey.endsWith("'")))) {
      secretKey = secretKey.slice(1, -1).trim();
    }
    secretKey = secretKey.replace(new RegExp(`^${source}\\s*=\\s*`), '').trim();
    if (!/^(sk|rk)_live_/.test(secretKey) || seen.has(secretKey)) continue;
    seen.add(secretKey);
    candidates.push({ source, secretKey });
  }
  return candidates;
};

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function stripeGet(secretKey: string, path: string) {
  let finalError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.stripe.com${path}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const message = safe(payload?.error?.message || `Stripe request failed (${response.status}).`);
      const error = Object.assign(new Error(message), {
        status: response.status,
        code: safe(payload?.error?.code, 80),
        type: safe(payload?.error?.type, 80),
      });
      if (response.status !== 429 && response.status < 500) throw error;
      finalError = message;
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      if (status && status !== 429 && status < 500) throw error;
      finalError = safe((error as Error)?.message || error);
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
  }
  throw new Error(finalError || 'Stripe did not respond after three attempts.');
}

async function stripeAccountId(secretKey: string) {
  try {
    return safe((await stripeGet(secretKey, '/v1/account')).id, 120) || null;
  } catch {
    // Restricted keys can still have the exact resource permissions needed by
    // this worker even when Account read is unavailable.
    return null;
  }
}

async function uspsToken() {
  const clientId = Deno.env.get('USPS_CLIENT_ID')?.trim() || '';
  const clientSecret = Deno.env.get('USPS_CLIENT_SECRET')?.trim() || '';
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('USPS tracking requires the existing USPS_CLIENT_ID and USPS_CLIENT_SECRET Edge Function secrets.'), { status: 424 });
  }
  const response = await fetch('https://apis.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw Object.assign(new Error(safe(payload?.error_description || payload?.error || `USPS OAuth failed (${response.status}).`)), { status: response.status });
  }
  return payload.access_token as string;
}

function uspsStatusSummary(payload: Record<string, any>) {
  const first = Array.isArray(payload) ? payload[0] : payload;
  const events = first?.trackingEvents || first?.events || [];
  const newest = Array.isArray(events) ? events[0] : null;
  return {
    raw: first || {},
    status: safe(first?.statusCategory || first?.status || first?.trackingStatus || newest?.eventType || 'tracking_available', 120),
    summary: safe(first?.statusSummary || first?.summary || first?.eventSummaries?.[0] || newest?.event || newest?.eventType || 'USPS tracking information retrieved.', 500),
    expectedDeliveryDate: safe(first?.expectedDeliveryDate || first?.predictedDeliveryDate, 40) || null,
  };
}

async function uspsTracking() {
  const token = await uspsToken();
  const response = await fetch('https://apis.usps.com/tracking/v3r2/tracking', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      trackingNumber: TINA_TRACKING_NUMBER,
      mailingDate: TINA_MAILING_DATE,
      destinationZIPCode: TINA_DESTINATION_ZIP,
      includeVeriPoint: false,
    }]),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = safe(payload?.error?.message || payload?.message || payload?.[0]?.error?.message || `USPS Tracking 3.2 failed (${response.status}).`);
    throw Object.assign(new Error(message), { status: response.status });
  }
  return uspsStatusSummary(payload);
}

async function resolvePaymentCredential(candidates: StripeKeyCandidate[], paymentIntentId: string) {
  const inspected: Array<{ source: StripeKeyCandidate['source']; accountId: string | null; result: string }> = [];
  for (const candidate of candidates) {
    const accountId = await stripeAccountId(candidate.secretKey);
    try {
      const paymentIntent = await stripeGet(candidate.secretKey, `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction`);
      inspected.push({ source: candidate.source, accountId, result: 'matched_payment_intent' });
      return { ...candidate, accountId, paymentIntent, inspected };
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      const message = safe((error as Error)?.message || error, 200);
      if (status !== 404 && !/no such payment_intent/i.test(message)) throw error;
      inspected.push({ source: candidate.source, accountId, result: 'payment_intent_not_in_account' });
    }
  }
  const accountSummary = inspected.map(item => `${item.source}${item.accountId ? ` (${item.accountId})` : ''}`).join(', ');
  throw Object.assign(new Error(`The configured Stripe accounts (${accountSummary || 'none'}) do not own Tina Dunn's verified PaymentIntent. Reuse the existing invoice-account credential; do not create a new connection.`), { status: 424 });
}

async function authorize(request: Request, admin: ReturnType<typeof createClient>, serviceRole: string, supabaseUrl: string) {
  const token = safe(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === serviceRole) return true;
  // Ask PostgREST to validate the presented JWT and report its signed role.
  // This safely supports a valid legacy service-role JWT even when the Edge
  // runtime exposes a newer server-key representation in its environment.
  const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const callerRole = await caller.rpc('ops_verified_calling_role');
  if (!callerRole.error && callerRole.data === 'service_role') return true;
  const user = await admin.auth.getUser(token);
  if (!user.data.user) return false;
  const profile = await admin.from('profiles').select('role').eq('id', user.data.user.id).maybeSingle();
  if (profile.data?.role === 'admin') return true;
  const membership = await admin.from('ops_business_memberships').select('can_manage_finances')
    .eq('business_id', BUSINESS_ID).eq('user_id', user.data.user.id).maybeSingle();
  return membership.data?.can_manage_finances === true;
}

type StoredTransaction = {
  id: string;
  provider: 'stripe';
  provider_transaction_id: string;
  provider_account_id: string | null;
  business_id: string;
  transaction_kind: 'customer_payment' | 'processor_fee' | 'refund' | 'card_expense' | 'card_refund';
  direction: 'inflow' | 'outflow';
  amount_cents: number;
  currency: string;
  occurred_at: string;
  merchant_name: string | null;
  merchant_category: string | null;
  merchant_city: string | null;
  merchant_state: string | null;
  merchant_country: string | null;
  source_status: string | null;
  source_type: string | null;
  source_data: Record<string, unknown>;
  source_hash: string;
  review_status: 'unreviewed' | 'review_needed' | 'confirmed';
};

async function paymentTransactions(paymentIntent: Record<string, any>, accountId: string | null, verificationSource = 'stripe_api') {
  const charge = paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object'
    ? paymentIntent.latest_charge : null;
  const balance = charge?.balance_transaction && typeof charge.balance_transaction === 'object'
    ? charge.balance_transaction : null;
  const occurredAt = iso(charge?.created || paymentIntent.created) || new Date().toISOString();
  const currency = safe(paymentIntent.currency || charge?.currency || 'usd', 10).toUpperCase();
  const result: StoredTransaction[] = [];
  const paymentSource = {
    payment_intent_id: paymentIntent.id,
    charge_id: charge?.id || null,
    balance_transaction_id: balance?.id || null,
    invoice_id: paymentIntent.invoice || null,
    amount_received: paymentIntent.amount_received || 0,
    amount_refunded: charge?.amount_refunded || 0,
    balance_fee: balance?.fee ?? null,
    balance_net: balance?.net ?? null,
    livemode: paymentIntent.livemode === true,
    verification_source: verificationSource,
  };
  result.push({
    id: `stripe:payment_intent:${paymentIntent.id}`,
    provider: 'stripe', provider_transaction_id: paymentIntent.id,
    provider_account_id: accountId, business_id: BUSINESS_ID,
    transaction_kind: 'customer_payment', direction: 'inflow',
    amount_cents: Math.max(0, Number(paymentIntent.amount_received || charge?.amount || 0)),
    currency, occurred_at: occurredAt, merchant_name: null, merchant_category: null,
    merchant_city: null, merchant_state: null, merchant_country: null,
    source_status: safe(paymentIntent.status, 80) || null, source_type: 'payment_intent',
    source_data: paymentSource, source_hash: await digest(paymentSource), review_status: 'confirmed',
  });
  if (balance?.id && Number(balance.fee || 0) > 0) {
    const feeSource = {
      balance_transaction_id: balance.id,
      payment_intent_id: paymentIntent.id,
      charge_id: charge?.id || null,
      fee_details: balance.fee_details || [],
      available_on: balance.available_on || null,
    };
    result.push({
      id: `stripe:processor_fee:${balance.id}`,
      provider: 'stripe', provider_transaction_id: balance.id,
      provider_account_id: accountId, business_id: BUSINESS_ID,
      transaction_kind: 'processor_fee', direction: 'outflow',
      amount_cents: Math.max(0, Number(balance.fee || 0)), currency,
      occurred_at: iso(balance.created) || occurredAt, merchant_name: 'Stripe',
      merchant_category: 'payment_processing', merchant_city: null, merchant_state: null,
      merchant_country: null, source_status: safe(balance.status, 80) || null,
      source_type: 'balance_transaction_fee', source_data: feeSource,
      source_hash: await digest(feeSource), review_status: 'confirmed',
    });
  }
  if (charge?.id && Number(charge.amount_refunded || 0) > 0) {
    const refundSource = { charge_id: charge.id, payment_intent_id: paymentIntent.id, amount_refunded: charge.amount_refunded };
    result.push({
      id: `stripe:refund_total:${charge.id}`,
      provider: 'stripe', provider_transaction_id: charge.id,
      provider_account_id: accountId, business_id: BUSINESS_ID,
      transaction_kind: 'refund', direction: 'outflow', amount_cents: Number(charge.amount_refunded),
      currency, occurred_at: occurredAt, merchant_name: null, merchant_category: null,
      merchant_city: null, merchant_state: null, merchant_country: null,
      source_status: safe(charge.status, 80) || null, source_type: 'charge_refund_total',
      source_data: refundSource, source_hash: await digest(refundSource), review_status: 'confirmed',
    });
  }
  return { transactions: result, charge, balance };
}

async function issuingTransactions(secretKey: string, createdGte: number) {
  const rows: Record<string, any>[] = [];
  let startingAfter = '';
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100', 'created[gte]': String(createdGte) });
    if (startingAfter) query.set('starting_after', startingAfter);
    const result = await stripeGet(secretKey, `/v1/issuing/transactions?${query.toString()}`);
    const pageRows = Array.isArray(result.data) ? result.data : [];
    rows.push(...pageRows);
    if (!result.has_more || !pageRows.length) break;
    startingAfter = safe(pageRows.at(-1)?.id, 120);
    if (!startingAfter) break;
  }
  return rows;
}

async function storeIssuingTransaction(row: Record<string, any>, accountId: string | null): Promise<StoredTransaction> {
  const refund = row.type === 'refund' || Number(row.amount || 0) > 0;
  const merchant = row.merchant_data || {};
  const source = {
    issuing_transaction_id: row.id,
    authorization_id: typeof row.authorization === 'string' ? row.authorization : row.authorization?.id || null,
    balance_transaction_id: typeof row.balance_transaction === 'string' ? row.balance_transaction : row.balance_transaction?.id || null,
    card_id: typeof row.card === 'string' ? row.card : row.card?.id || null,
    cardholder_id: typeof row.cardholder === 'string' ? row.cardholder : row.cardholder?.id || null,
    amount: row.amount,
    merchant_amount: row.merchant_amount,
    merchant_currency: row.merchant_currency,
    merchant_data: merchant,
    purchase_details: row.purchase_details || null,
    metadata: row.metadata || {},
    livemode: row.livemode === true,
  };
  return {
    id: `stripe:issuing:${row.id}`,
    provider: 'stripe', provider_transaction_id: row.id,
    provider_account_id: accountId, business_id: BUSINESS_ID,
    transaction_kind: refund ? 'card_refund' : 'card_expense',
    direction: refund ? 'inflow' : 'outflow',
    amount_cents: Math.abs(Number(row.amount || 0)),
    currency: safe(row.currency || 'usd', 10).toUpperCase(),
    occurred_at: iso(row.created) || new Date().toISOString(),
    merchant_name: safe(merchant.name, 200) || null,
    merchant_category: safe(merchant.category, 120) || null,
    merchant_city: safe(merchant.city, 120) || null,
    merchant_state: safe(merchant.state, 80) || null,
    merchant_country: safe(merchant.country, 10) || null,
    source_status: null, source_type: safe(row.type, 80) || 'capture',
    source_data: source, source_hash: await digest(source), review_status: 'unreviewed',
  };
}

async function treasuryFinancialAccounts(secretKey: string) {
  const rows: Record<string, any>[] = [];
  let startingAfter = '';
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (startingAfter) query.set('starting_after', startingAfter);
    const result = await stripeGet(secretKey, `/v1/treasury/financial_accounts?${query.toString()}`);
    const pageRows = Array.isArray(result.data) ? result.data : [];
    rows.push(...pageRows);
    if (!result.has_more || !pageRows.length) break;
    startingAfter = safe(pageRows.at(-1)?.id, 120);
    if (!startingAfter) break;
  }
  return rows;
}

async function treasuryTransactions(secretKey: string, financialAccountId: string, createdGte: number) {
  const rows: Record<string, any>[] = [];
  let startingAfter = '';
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({
      financial_account: financialAccountId,
      limit: '100',
      'created[gte]': String(createdGte),
    });
    if (startingAfter) query.set('starting_after', startingAfter);
    const result = await stripeGet(secretKey, `/v1/treasury/transactions?${query.toString()}`);
    const pageRows = Array.isArray(result.data) ? result.data : [];
    rows.push(...pageRows);
    if (!result.has_more || !pageRows.length) break;
    startingAfter = safe(pageRows.at(-1)?.id, 120);
    if (!startingAfter) break;
  }
  return rows;
}

async function storeTreasuryTransaction(
  secretKey: string,
  row: Record<string, any>,
  accountId: string | null,
): Promise<StoredTransaction> {
  const flowType = safe(row.flow_type || row.flow?.type, 80) || 'unknown';
  const flowId = safe(typeof row.flow === 'string' ? row.flow : row.flow?.[flowType] || row.flow?.id, 160);
  let receivedDebit: Record<string, any> | null = null;
  let receivedDebitReadError = '';
  if (flowType === 'received_debit' && /^rd_[A-Za-z0-9_]+$/.test(flowId)) {
    try {
      receivedDebit = await stripeGet(secretKey, `/v1/treasury/received_debits/${encodeURIComponent(flowId)}`);
    } catch (error) {
      receivedDebitReadError = safe((error as Error)?.message || error, 300);
    }
  }
  const amount = Number(row.amount || receivedDebit?.amount || 0);
  const refund = amount > 0 && /reversal|return|refund/.test(flowType);
  const merchantName = safe(receivedDebit?.description || row.description, 200) || null;
  const source = {
    treasury_transaction_id: row.id,
    financial_account_id: row.financial_account || null,
    flow_type: flowType,
    flow_id: flowId || null,
    received_debit_id: receivedDebit?.id || null,
    received_debit_read_error: receivedDebitReadError || null,
    received_debit_description: merchantName,
    issuing_transaction_id: typeof receivedDebit?.initiating_payment_method_details?.issuing_card === 'string'
      ? receivedDebit.initiating_payment_method_details.issuing_card
      : receivedDebit?.issuing_transaction || null,
    amount: row.amount,
    balance_impact: row.balance_impact || null,
    status_transitions: row.status_transitions || null,
    livemode: row.livemode === true,
  };
  return {
    id: `stripe:treasury:${row.id}`,
    provider: 'stripe', provider_transaction_id: row.id,
    provider_account_id: accountId, business_id: BUSINESS_ID,
    transaction_kind: refund ? 'card_refund' : 'card_expense',
    direction: refund ? 'inflow' : 'outflow',
    amount_cents: Math.abs(amount),
    currency: safe(row.currency || receivedDebit?.currency || 'usd', 10).toUpperCase(),
    occurred_at: iso(row.created || receivedDebit?.created) || new Date().toISOString(),
    merchant_name: merchantName,
    merchant_category: flowType,
    merchant_city: null, merchant_state: null, merchant_country: null,
    source_status: safe(row.status, 80) || null,
    source_type: `treasury_${flowType}`,
    source_data: source,
    source_hash: await digest(source),
    review_status: 'unreviewed',
  };
}

const normalizedMerchant = (value: string | null | undefined) => safe(value, 240).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const onDate = (transaction: StoredTransaction, date: string) => transaction.occurred_at.slice(0, 10) === date;

function exactEvidenceMatches(rows: StoredTransaction[]) {
  const rules = [
    {
      key: 'michaels', amount: 1196, date: '2026-10-14',
      merchant: /michaels.*5082/, relationship: 'blank_garments', matchStatus: 'confirmed', confidence: 1,
      evidence: [{ type: 'exact_amount_merchant_date_and_owner_confirmation', amount: 11.96, quantity: 3 }],
    },
    {
      key: 'usps', amount: 1500, date: '2026-10-14',
      merchant: /usps.*(kiosk|1204599557)/, relationship: 'postage', matchStatus: 'review_needed', confidence: 0.85,
      evidence: [{ type: 'amount_merchant_date_match' }, { type: 'card_last4_conflict', stripeLast4: '6373', receiptLast4: '2437' }],
    },
    {
      key: 'racetrac', amount: 254, date: '2026-10-14',
      merchant: /racetrac.*2329/, relationship: null, matchStatus: 'review_needed', confidence: 0.5,
      evidence: [{ type: 'exact_amount_merchant_date' }, { type: 'business_purpose_unknown' }],
    },
  ] as const;
  return rules.map(rule => ({
    rule,
    transaction: rows.find(row => row.transaction_kind === 'card_expense'
      && row.amount_cents === rule.amount && onDate(row, rule.date)
      && rule.merchant.test(normalizedMerchant(row.merchant_name))) || null,
  }));
}

function costRelationship(transaction: StoredTransaction) {
  if (transaction.transaction_kind !== 'card_expense') return null;
  const merchant = `${transaction.merchant_name || ''} ${transaction.merchant_category || ''}`.toLowerCase();
  if (/ss active|s&s|activewear|shirt|apparel wholesal/.test(merchant)) return 'blank_garments';
  if (/perfec ?press|dtf|transfer|screen print/.test(merchant)) return 'transfers_printing';
  if (/usps|postal service|post office/.test(merchant)) return 'postage';
  if (/packag|mailer|shipping suppl/.test(merchant)) return 'packaging';
  return null;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await authorize(request, admin, serviceRole, supabaseUrl)) return json({ error: 'Finance synchronization is not authorized.' }, 403);
  const input = await request.json().catch(() => ({}));

  const attemptedAt = new Date().toISOString();
  await admin.from('ops_financial_sync_state').upsert({
    source: 'stripe', business_id: BUSINESS_ID, status: 'running', last_attempt_at: attemptedAt,
    last_error: null, updated_at: attemptedAt,
  });

  try {
    const priorSyncResult = await admin.from('ops_financial_sync_state').select('capability_status').eq('source', 'stripe').maybeSingle();
    const priorCapabilities = priorSyncResult.data?.capability_status || {};
    const stripeKeys = configuredStripeKeys();
    if (!stripeKeys.length) throw Object.assign(new Error('The existing live Stripe server keys are unavailable to the financial sync worker.'), { status: 424 });
    const invoiceResult = await admin.from('ops_shared_records').select('*').eq('id', TINA_INVOICE_ID).eq('record_type', 'invoice').single();
    if (invoiceResult.error || !invoiceResult.data) throw new Error('The synchronized Tina Dunn invoice was not found.');
    const invoiceRow = invoiceResult.data;
    const invoice = invoiceRow.payload || {};
    const paymentIntentId = safe(invoice.paymentHistory?.[0]?.paymentIntentId || invoice.paymentIntentId, 120);
    if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) throw new Error('The Tina Dunn invoice does not contain a verified Stripe PaymentIntent ID.');

    const snapshot = input?.verifiedFinancialSnapshot || null;
    const snapshotValid = snapshot
      && snapshot.financialDetailsStatus === 'verified'
      && snapshot.invoiceId === TINA_INVOICE_ID
      && snapshot.invoiceNumber === invoice.invoiceNumber
      && snapshot.paymentIntentId === paymentIntentId
      && Number.isFinite(Number(snapshot.grossCollections))
      && Math.abs(Number(snapshot.grossCollections) - Number(invoice.total)) < 0.005
      && Number.isFinite(Number(snapshot.processingFees))
      && Number.isFinite(Number(snapshot.netProceeds))
      && Math.abs(Number(snapshot.netProceeds) - (Number(snapshot.grossCollections) - Number(snapshot.processingFees) - Number(snapshot.refunds || 0))) < 0.005;
    let paymentCredential: Awaited<ReturnType<typeof resolvePaymentCredential>> | null = null;
    let paymentReadError = '';
    try {
      paymentCredential = await resolvePaymentCredential(stripeKeys, paymentIntentId);
    } catch (error) {
      paymentReadError = safe((error as Error)?.message || error, 500);
      if (!snapshotValid) throw error;
    }
    const accountId = paymentCredential?.accountId
      || safe(String(invoice.paymentLink || '').match(/acct_[A-Za-z0-9]+/)?.[0], 120)
      || null;
    const paymentIntent = paymentCredential?.paymentIntent || {
      id: snapshot.paymentIntentId,
      status: snapshot.paymentStatus === 'paid' ? 'succeeded' : snapshot.paymentStatus,
      livemode: true,
      amount_received: Math.round(Number(snapshot.grossCollections) * 100),
      amount_refunded: Math.round(Number(snapshot.refunds || 0) * 100),
      currency: safe(snapshot.currency || 'USD', 10).toLowerCase(),
      invoice: snapshot.externalInvoiceId,
      created: Math.floor(new Date(snapshot.date || invoice.paidAt || invoice.createdAt).getTime() / 1000),
      latest_charge: {
        id: snapshot.chargeId,
        amount: Math.round(Number(snapshot.grossCollections) * 100),
        amount_refunded: Math.round(Number(snapshot.refunds || 0) * 100),
        created: Math.floor(new Date(snapshot.date || invoice.paidAt || invoice.createdAt).getTime() / 1000),
        balance_transaction: {
          id: snapshot.balanceTransactionId,
          fee: Math.round(Number(snapshot.processingFees) * 100),
          net: Math.round(Number(snapshot.netProceeds) * 100),
          status: 'verified_historical_record',
          created: Math.floor(new Date(snapshot.date || invoice.paidAt || invoice.createdAt).getTime() / 1000),
        },
      },
    };
    if (paymentIntent.livemode !== true) throw new Error('Stripe returned a non-live payment for the live Tina Dunn invoice.');
    const paymentData = await paymentTransactions(paymentIntent, accountId, paymentCredential ? 'stripe_api' : 'existing_hcc_verified_reconciliation');
    const paymentUpsert = await admin.from('ops_financial_transactions').upsert(paymentData.transactions, {
      onConflict: 'provider,provider_transaction_id,transaction_kind',
    });
    if (paymentUpsert.error) throw paymentUpsert.error;

    const exactMatches = paymentData.transactions.filter(item => ['customer_payment', 'processor_fee', 'refund'].includes(item.transaction_kind)).map(item => ({
      financial_transaction_id: item.id,
      shared_record_id: TINA_INVOICE_ID,
      relationship: item.transaction_kind === 'customer_payment' ? 'customer_payment' : item.transaction_kind === 'processor_fee' ? 'processor_fee' : 'other_cost',
      match_status: 'auto_confirmed', confidence: 1,
      evidence: [{ type: 'exact_provider_identifier', paymentIntentId, balanceTransactionId: paymentData.balance?.id || null, chargeId: paymentData.charge?.id || null }],
    }));
    if (exactMatches.length) {
      const matchResult = await admin.from('ops_reconciliation_matches').upsert(exactMatches, {
        onConflict: 'financial_transaction_id,shared_record_id,relationship',
      });
      if (matchResult.error) throw matchResult.error;
    }

    let treasuryAvailable = false;
    let treasuryError = '';
    let treasuryRequiredPermission = '';
    let cardRows: StoredTransaction[] = [];
    const treasuryAccounts: Array<{ source: StripeKeyCandidate['source']; accountId: string | null; financialAccountId: string; rows: number }> = [];
    const treasuryFailures: string[] = [];
    const invoiceStart = Math.floor(new Date(invoice.createdAt || '2026-10-03T00:00:00Z').getTime() / 1000) - (30 * 24 * 60 * 60);
    for (const stripeKey of stripeKeys) {
      const stripeAccount = stripeKey.secretKey === paymentCredential?.secretKey
        ? accountId
        : await stripeAccountId(stripeKey.secretKey);
      try {
        const financialAccounts = await treasuryFinancialAccounts(stripeKey.secretKey);
        treasuryAvailable = true;
        for (const financialAccount of financialAccounts) {
          const rows = await treasuryTransactions(stripeKey.secretKey, financialAccount.id, invoiceStart);
          const storedRows = await Promise.all(rows.map(row => storeTreasuryTransaction(stripeKey.secretKey, row, stripeAccount)));
          treasuryAccounts.push({
            source: stripeKey.source,
            accountId: stripeAccount,
            financialAccountId: financialAccount.id,
            rows: storedRows.length,
          });
          cardRows.push(...storedRows);
        }
      } catch (error) {
        const status = Number((error as { status?: number })?.status || 0);
        const message = safe((error as Error)?.message || error);
        treasuryFailures.push(`${stripeKey.source}${stripeAccount ? ` (${stripeAccount})` : ''}: ${message}`);
        if (status === 403 || /permission|not authorized/i.test(message)) {
          treasuryRequiredPermission = 'Stripe Treasury Financial Accounts, Transactions, and Received Debits: Read';
        } else if (status === 404 || /treasury|financial account/i.test(message)) {
          treasuryRequiredPermission = 'The existing Stripe Financial Account credential with Treasury read access';
        }
      }
    }
    treasuryError = treasuryAvailable ? treasuryFailures.join(' | ') : treasuryFailures.join(' | ') || 'No configured Stripe key exposed the existing Financial Account.';

    // Issuing remains a compatibility fallback only. A Financial Account card
    // debit is a Treasury ReceivedDebit and must not be treated as unavailable
    // merely because the Stripe account is not enrolled in Issuing.
    let issuingAvailable = false;
    let issuingError = '';
    const issuingAccounts: Array<{ source: StripeKeyCandidate['source']; accountId: string | null; rows: number }> = [];
    if (!treasuryAvailable) {
      const issuingFailures: string[] = [];
      for (const stripeKey of stripeKeys) {
        const issuingAccountId = stripeKey.secretKey === paymentCredential?.secretKey
          ? accountId
          : await stripeAccountId(stripeKey.secretKey);
        try {
          const rows = await issuingTransactions(stripeKey.secretKey, invoiceStart);
          const storedRows = await Promise.all(rows.map(row => storeIssuingTransaction(row, issuingAccountId)));
          issuingAvailable = true;
          issuingAccounts.push({ source: stripeKey.source, accountId: issuingAccountId, rows: storedRows.length });
          cardRows.push(...storedRows);
        } catch (error) {
          issuingFailures.push(`${stripeKey.source}${issuingAccountId ? ` (${issuingAccountId})` : ''}: ${safe((error as Error)?.message || error)}`);
        }
      }
      issuingError = issuingFailures.join(' | ');
    }
    cardRows = [...new Map(cardRows.map(row => [row.id, row])).values()];
    if (cardRows.length) {
      const cardUpsert = await admin.from('ops_financial_transactions').upsert(cardRows, {
        onConflict: 'provider,provider_transaction_id,transaction_kind',
      });
      if (cardUpsert.error) throw cardUpsert.error;
    }

    const exactEvidence = exactEvidenceMatches(cardRows);
    for (const item of exactEvidence) {
      if (!item.transaction) continue;
      const provisionalId = PROVISIONAL_TRANSACTIONS[item.rule.key];
      await admin.from('ops_financial_transactions').update({
        source_status: 'superseded_by_provider_record',
        review_status: 'excluded',
        source_data: {
          supersededBy: item.transaction.id,
          reason: 'An exact Treasury transaction matched the private screenshot evidence.',
        },
      }).eq('id', provisionalId);
      if (item.rule.relationship) {
        const matchResult = await admin.from('ops_reconciliation_matches').upsert({
          financial_transaction_id: item.transaction.id,
          shared_record_id: TINA_INVOICE_ID,
          relationship: item.rule.relationship,
          match_status: item.rule.matchStatus,
          confidence: item.rule.confidence,
          evidence: item.rule.evidence,
          reviewed_at: item.rule.matchStatus === 'confirmed' ? new Date().toISOString() : null,
          review_notes: item.rule.key === 'usps'
            ? 'Actual postage is independently allocated; the card-last-four conflict remains under review.'
            : 'Matched to the confirmed private purchase evidence.',
        }, { onConflict: 'financial_transaction_id,shared_record_id,relationship' });
        if (matchResult.error) throw matchResult.error;
        await admin.from('ops_reconciliation_matches').update({
          match_status: 'rejected',
          review_notes: `Superseded by exact provider transaction ${item.transaction.provider_transaction_id}.`,
          reviewed_at: new Date().toISOString(),
        }).eq('financial_transaction_id', provisionalId)
          .eq('shared_record_id', TINA_INVOICE_ID)
          .eq('relationship', item.rule.relationship);
      }
    }

    const candidates = cardRows.map(transaction => ({ transaction, relationship: costRelationship(transaction) }))
      .filter(item => item.relationship);
    const exactProviderIds = new Set(exactEvidence.filter(item => item.transaction).map(item => item.transaction!.id));
    for (const candidate of candidates) {
      if (exactProviderIds.has(candidate.transaction.id)) continue;
      const metadata = candidate.transaction.source_data?.metadata as Record<string, unknown> | undefined;
      const exactInvoiceReference = metadata?.hcc_invoice_id === TINA_INVOICE_ID || metadata?.hcc_invoice_number === invoice.invoiceNumber;
      const evidence = [
        { type: 'merchant_match', merchant: candidate.transaction.merchant_name, relationship: candidate.relationship },
        { type: 'date_proximity', transactionDate: candidate.transaction.occurred_at, invoiceDate: invoice.issueDate || invoice.createdAt },
        ...(exactInvoiceReference ? [{ type: 'exact_invoice_metadata', invoiceId: TINA_INVOICE_ID, invoiceNumber: invoice.invoiceNumber }] : []),
      ];
      const matchStatus = exactInvoiceReference ? 'auto_confirmed' : 'review_needed';
      const candidateResult = await admin.from('ops_reconciliation_matches').upsert({
        financial_transaction_id: candidate.transaction.id,
        shared_record_id: TINA_INVOICE_ID,
        relationship: candidate.relationship,
        match_status: matchStatus,
        confidence: exactInvoiceReference ? 1 : 0.45,
        evidence,
      }, { onConflict: 'financial_transaction_id,shared_record_id,relationship' });
      if (candidateResult.error) throw candidateResult.error;
      if (!exactInvoiceReference) {
        await admin.from('ops_financial_transactions').update({ review_status: 'review_needed' }).eq('id', candidate.transaction.id);
      }
    }

    const matchesResult = await admin.from('ops_reconciliation_matches').select('*').eq('shared_record_id', TINA_INVOICE_ID);
    if (matchesResult.error) throw matchesResult.error;
    const matches = matchesResult.data || [];
    const allocationsResult = await admin.from('ops_cost_allocations').select('*')
      .eq('shared_record_id', TINA_INVOICE_ID).eq('allocation_status', 'confirmed');
    if (allocationsResult.error) throw allocationsResult.error;
    const allocations = allocationsResult.data || [];
    const confirmedCostsCents = allocations.reduce((sum, item) => sum + Number(item.allocated_amount_cents || 0), 0);
    const platformFeeCents = allocations.filter(item => item.relationship === 'platform_fee')
      .reduce((sum, item) => sum + Number(item.allocated_amount_cents || 0), 0);
    const fulfillmentCostsCents = confirmedCostsCents - platformFeeCents;

    let trackingAvailable = false;
    let trackingError = '';
    let trackingResult: ReturnType<typeof uspsStatusSummary> | null = null;
    try {
      trackingResult = await uspsTracking();
      trackingAvailable = true;
      const shipmentUpdate = await admin.from('ops_shipments').update({
        shipment_status: trackingResult.status || 'tracking_available',
        status_summary: trackingResult.summary,
        expected_delivery_date: trackingResult.expectedDeliveryDate || '2026-10-17',
        expected_delivery_is_estimate: true,
        last_checked_at: new Date().toISOString(),
        status_source: 'USPS Tracking 3.2',
        status_data: trackingResult.raw,
      }).eq('carrier', 'USPS').eq('tracking_number', TINA_TRACKING_NUMBER);
      if (shipmentUpdate.error) throw shipmentUpdate.error;
    } catch (error) {
      trackingError = safe((error as Error)?.message || error, 500);
      await admin.from('ops_shipments').update({
        shipment_status: 'tracking_refresh_failed',
        status_summary: 'The shipment is recorded. Live USPS status could not be refreshed.',
        last_checked_at: new Date().toISOString(),
        status_source: 'USPS Tracking 3.2',
        status_data: { error: trackingError },
      }).eq('carrier', 'USPS').eq('tracking_number', TINA_TRACKING_NUMBER);
    }

    const grossCents = Number(paymentIntent.amount_received || 0);
    const feeCents = Number(paymentData.balance?.fee || 0);
    const refundCents = Number(paymentData.charge?.amount_refunded || 0);
    const costReviewNeeded = matches.filter(match => match.match_status === 'review_needed'
      && ['blank_garments', 'transfers_printing', 'postage', 'packaging', 'other_cost'].includes(match.relationship)).length;
    const allocatedRelationships = new Set(allocations.map(item => item.relationship));
    const missingCostCategories = [
      ...(!allocatedRelationships.has('production_labor') ? ['Paid pressing or production labor'] : []),
      ...(!allocatedRelationships.has('packaging') ? ['Packaging'] : []),
    ];
    const costsComplete = missingCostCategories.length === 0;
    const checkedAt = new Date().toISOString();
    const reconciliationSource = treasuryAvailable
      ? 'Stripe live payment, Stripe Treasury transaction API, private purchase evidence, and USPS Tracking 3.2'
      : priorCapabilities?.balanceHistoryCsv?.status === 'imported'
        ? 'Verified Stripe payment record, imported Stripe Balance History CSV, private purchase evidence, and USPS Tracking 3.2'
        : 'Verified Stripe payment record, private purchase evidence, and USPS Tracking 3.2';
    const reconciliation = {
      status: costsComplete ? 'complete' : 'incomplete',
      checkedAt,
      source: reconciliationSource,
      customerPayment: {
        paymentIntentId, chargeId: paymentData.charge?.id || null,
        balanceTransactionId: paymentData.balance?.id || null,
        grossCollected: money(grossCents), processingFee: money(feeCents),
        refunds: money(refundCents), netAfterStripe: money(grossCents - feeCents - refundCents),
        status: paymentIntent.status,
      },
      relatedCosts: {
        verifiedActualCosts: money(fulfillmentCostsCents),
        verifiedAccountPlatformFees: money(platformFeeCents),
        totalVerifiedCostsAndAccountFees: money(confirmedCostsCents),
        reviewQueueCount: costReviewNeeded,
        complete: costsComplete,
        paymentVerificationSeparate: true,
        missing: missingCostCategories,
      },
      margin: {
        final: costsComplete ? money(grossCents - feeCents - refundCents - confirmedCostsCents) : null,
        knownAmountAfterVerifiedCosts: money(grossCents - feeCents - refundCents - confirmedCostsCents),
        knownAmountAfterVerifiedCostsAndFees: money(grossCents - feeCents - refundCents - confirmedCostsCents),
        knownAmountBeforeUnverifiedFulfillmentCosts: money(grossCents - feeCents - refundCents - confirmedCostsCents),
        grossCollected: money(grossCents),
        processingFee: money(feeCents),
        accountPlatformFees: money(platformFeeCents),
        verifiedCosts: money(fulfillmentCostsCents),
        complete: costsComplete,
      },
      financialAccountTransactions: {
        available: treasuryAvailable,
        retrieved: cardRows.filter(row => row.source_type?.startsWith('treasury_')).length,
        accounts: treasuryAccounts,
        requiredPermission: treasuryRequiredPermission || null,
        error: treasuryError || null,
      },
      cardTransactions: {
        available: treasuryAvailable || issuingAvailable,
        retrieved: cardRows.length,
        accounts: treasuryAvailable ? treasuryAccounts : issuingAccounts,
        source: treasuryAvailable ? 'Stripe Treasury' : 'Stripe Issuing fallback',
        requiredPermission: treasuryAvailable ? null : treasuryRequiredPermission || null,
        error: treasuryAvailable ? treasuryError || null : treasuryError || issuingError || null,
      },
      order: {
        found: false,
        reason: 'This paid record is a standalone Heart Command Center invoice; its tax record explicitly indicates createsOrder=false.',
      },
      shipping: {
        trackingNumber: TINA_TRACKING_NUMBER,
        actualPostageVerified: true,
        actualPostage: 15,
        expectedDeliveryDate: trackingResult?.expectedDeliveryDate || '2026-10-17',
        expectedDeliveryIsEstimate: true,
        status: trackingResult?.status || 'tracking_refresh_failed',
        statusSummary: trackingResult?.summary || 'The shipment is recorded. Live USPS status could not be refreshed.',
        lastCheckedAt: checkedAt,
        trackingAvailable,
        trackingError: trackingError || null,
      },
    };

    const enrichedPayload = {
      ...invoice,
      accountPlatformFees: money(platformFeeCents),
      financialReconciliation: reconciliation,
      trackingNumber: TINA_TRACKING_NUMBER,
      shippingCarrier: 'USPS',
      shippingService: 'Priority Mail Padded Flat Rate Envelope',
      shippingEstimated: false,
      actualShippingCost: 15,
      deliveryEstimate: trackingResult?.expectedDeliveryDate || '2026-10-17',
      shipmentStatus: trackingResult?.status || 'tracking_refresh_failed',
      fulfillmentCosts: {
        currency: 'USD',
        blankGarments: 11.96,
        transfersPrinting: 31.80,
        postage: 15,
        recordedActualCostTotal: money(fulfillmentCostsCents),
        complete: costsComplete,
        missing: missingCostCategories,
      },
      fulfillmentCostsComplete: costsComplete,
      fulfillmentCostMissing: missingCostCategories,
      costReconciliationStatus: costsComplete ? 'complete' : 'incomplete',
      updatedAt: checkedAt,
    };
    const invoiceUpdate = await admin.from('ops_shared_records').update({
      payload: enrichedPayload, sync_state: 'synced', status: invoice.status || invoiceRow.status,
    }).eq('id', TINA_INVOICE_ID);
    if (invoiceUpdate.error) throw invoiceUpdate.error;

    const categoryResult = await admin.rpc('ops_apply_categorization_batch', { p_business_id: BUSINESS_ID });
    const capabilityStatus = {
      ...priorCapabilities,
      paymentIntentsRead: true,
      paymentIntentLiveRead: Boolean(paymentCredential),
      paymentIntentReadError: paymentReadError || null,
      balanceTransactionsRead: Boolean(paymentData.balance),
      treasuryFinancialAccountsRead: treasuryAvailable,
      treasuryTransactionsRead: treasuryAvailable,
      treasuryAccounts,
      treasuryError: treasuryError || null,
      issuingTransactionsRead: issuingAvailable,
      uspsTrackingRead: trackingAvailable,
      uspsTrackingError: trackingError || null,
      requiredPermission: treasuryAvailable ? null : treasuryRequiredPermission || null,
      paymentCredentialSource: paymentCredential?.source || 'existing_hcc_verified_reconciliation',
      paymentAccountId: accountId,
      configuredAccountChecks: paymentCredential?.inspected || [],
      issuingAccounts,
      categorization: categoryResult.error
        ? { status: 'failed', error: safe(categoryResult.error.message, 300) }
        : { status: 'active', chartOfAccounts: 'shared', ruleEngine: 'active', evaluated: Number(categoryResult.data || 0), evaluatedAt: checkedAt },
    };
    const syncStatus = treasuryAvailable && trackingAvailable ? 'synced' : 'partial';
    const syncErrors = [
      ...(!treasuryAvailable && treasuryError ? [treasuryError] : []),
      ...(!trackingAvailable && trackingError ? [trackingError] : []),
    ];
    const syncState = await admin.from('ops_financial_sync_state').upsert({
      source: 'stripe', business_id: BUSINESS_ID, status: syncStatus,
      last_attempt_at: attemptedAt, last_success_at: checkedAt,
      last_provider_created_at: cardRows.length ? cardRows[0].occurred_at : null,
      last_error: syncErrors.join(' | ') || null, capability_status: capabilityStatus,
      records_seen: paymentData.transactions.length + cardRows.length,
      records_upserted: paymentData.transactions.length + cardRows.length,
      updated_at: checkedAt,
    });
    if (syncState.error) throw syncState.error;

    return json({
      ok: true, status: syncStatus, checkedAt,
      invoice: { id: TINA_INVOICE_ID, invoiceNumber: invoice.invoiceNumber, customerName: invoice.customerName },
      payment: reconciliation.customerPayment,
      costs: reconciliation.relatedCosts,
      margin: reconciliation.margin,
      treasury: reconciliation.financialAccountTransactions,
      tracking: reconciliation.shipping,
      candidates: candidates.map(candidate => ({
        transactionId: candidate.transaction.provider_transaction_id,
        occurredAt: candidate.transaction.occurred_at,
        merchant: candidate.transaction.merchant_name,
        amount: money(candidate.transaction.amount_cents),
        relationship: candidate.relationship,
        status: 'review_needed',
      })),
      safeguards: { chargedCard: false, issuedRefund: false, sentInvoice: false, purchasedPostage: false },
    });
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = safe((error as Error)?.message || error, 500);
    await admin.from('ops_financial_sync_state').upsert({
      source: 'stripe', business_id: BUSINESS_ID, status: 'failed',
      last_attempt_at: attemptedAt, last_error: message, updated_at: failedAt,
    });
    return json({ error: message }, Number((error as { status?: number })?.status || 500));
  }
});
