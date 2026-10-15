const base = String(process.env.HC_APPAREL_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.HC_APPAREL_SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('HC_APPAREL_SUPABASE_URL and HC_APPAREL_SUPABASE_SERVICE_ROLE_KEY are required.');
const headers = { apikey: key, authorization: `Bearer ${key}` };
async function get(path) {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const hash = 'b5039c15c8986e19546492f4dc0d6d836f6266c495fb8c7ba1db883ee49dd734';
const [transactions, imports, accounts, rules, invoiceRows, feeExpenses, allocations] = await Promise.all([
  get('ops_financial_transactions?business_id=eq.hc-apparel&select=id,provider_transaction_id,provider_account_id,transaction_kind,direction,amount_cents,occurred_at,posted_at,source_timezone,source_status,source_type,source_data,review_status,chart_account_id,suggested_chart_account_id,spend_classification,transfer_pair_id&order=occurred_at.asc'),
  get(`ops_financial_imports?business_id=eq.hc-apparel&source_hash=eq.${hash}&select=*`),
  get('ops_chart_accounts?business_id=eq.hc-apparel&select=id,account_code,name,account_type,parent_account_id,active&order=account_code'),
  get('ops_categorization_rules?business_id=eq.hc-apparel&select=id,name,enabled,auto_apply,target_chart_account_id&order=priority'),
  get('ops_shared_records?id=eq.invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0&select=id,payload,revision,sync_state'),
  get('ops_shared_records?id=in.(expense-stripe-invoicing-starter-20261007-033,expense-stripe-radar-standard-20261007-005)&select=id,payload,sync_state&order=id'),
  get('ops_cost_allocations?shared_record_id=eq.invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0&select=id,relationship,allocated_amount_cents,payment_verification_status&order=id'),
]);
const imported = transactions.filter(row => row.source_type?.startsWith('stripe_balance_history_csv:'));
const exactIds = new Set([
  'trxn_65VZrfLw9IRQ8SJfwPT16VVewI8jSQktioeEIDXETLcCGO','trxn_65VZucChdIhd3ZNmiSZ16VVewI8jSQktioeEIDXETLc5Ym',
  'trxn_65VZs6AoA7kjYnQYYs016VVewI8jSQktioeEIDXETLcXQ8','trxn_65VZeKzj2cEh1YSkJIN16VVewI8jSQktioeEIDXETLc3cG',
  'txn_1UQGNd77O18gAiWRt60sKzmb','txn_3UMKvy77O18gAiWR01WF2Ng5','txn_1UO9Z977O18gAiWRn126UGAr','txn_1UNm8s77O18gAiWR0a4K9ETU',
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(imported.length === 8, `Expected 8 imported rows, found ${imported.length}.`);
assert(imported.every(row => exactIds.has(row.provider_transaction_id)), 'An imported Stripe transaction ID does not match the source export.');
assert(imported.every(row => row.source_timezone === 'UTC'), 'Every imported row must preserve UTC source timezone.');
assert(imports.length === 1 && imports[0].rows_upserted === 8 && imports[0].status === 'completed', 'The immutable import batch is not complete.');
const cardExpenses = imported.filter(row => row.transaction_kind === 'card_expense');
assert(cardExpenses.length === 3 && cardExpenses.every(row => row.source_status === 'posted' && row.posted_at), 'The three card expenses are not all posted.');
const transfers = imported.filter(row => row.transaction_kind === 'transfer');
assert(transfers.length === 2 && transfers.every(row => row.amount_cents === 8059 && row.review_status === 'excluded' && row.transfer_pair_id === 'stripe:transfer:20261014:8059'), 'Transfer pair is not balanced and excluded.');
const fees = imported.filter(row => row.transaction_kind === 'account_fee');
assert(fees.reduce((sum, row) => sum + row.amount_cents, 0) === 38 && fees.every(row => row.chart_account_id === 'hc-apparel-5800'), 'Account fees are not independently mapped to 5800.');
const settlement = imported.find(row => row.transaction_kind === 'payment_settlement');
assert(settlement?.amount_cents === 8097 && Number(settlement.source_data.amount_gross) === 83.7 && Number(settlement.source_data.amount_fee) === 2.73, 'Settlement gross, charge fee, or net does not match.');
const raceTrac = imported.find(row => row.provider_transaction_id.startsWith('trxn_65VZrf'));
assert(raceTrac?.review_status === 'review_needed'
  && raceTrac.spend_classification === 'business'
  && raceTrac.manual_category_override === true
  && !raceTrac.chart_account_id
  && !raceTrac.suggested_chart_account_id,
'RaceTrac must remain an uncategorized, manually classified business expense in review.');
assert(accounts.length >= 25 && rules.length >= 3, 'Chart of Accounts or rule seed is incomplete.');
assert(feeExpenses.length === 2 && feeExpenses.every(row => row.sync_state === 'synced'), 'The two separate platform-fee expenses are not synchronized.');
const invoice = invoiceRows[0]?.payload;
assert(invoice?.financialReconciliation?.margin?.knownAmountAfterVerifiedCostsAndFees === 21.83, 'Tina incomplete remainder is not $21.83.');
assert(invoice?.financialReconciliation?.transferReconciliation?.balanced === true, 'Tina transfer tie-out is not marked balanced.');
assert(allocations.some(row => row.relationship === 'transfers_printing' && row.allocated_amount_cents === 3180), 'The $31.80 DTF cost was not preserved.');
assert(allocations.filter(row => row.relationship === 'platform_fee').reduce((sum, row) => sum + row.allocated_amount_cents, 0) === 38, 'The two platform-fee allocations do not total $0.38.');
process.stdout.write(`${JSON.stringify({
  verified: true, importedRows: imported.length, sourceTimezone: 'UTC', postedCardExpenses: cardExpenses.length,
  transferPair: { legs: transfers.length, amountEach: 80.59, excludedFromIncomeAndExpenses: true },
  tina: { gross: 83.70, chargeProcessingFee: 2.73, net: 80.97, separatePlatformFees: .38, transfer: 80.59, knownIncompleteRemainder: 21.83, dtfCostPreserved: 31.80 },
  chartAccounts: accounts.length, categorizationRules: rules.length, reviewQueue: [raceTrac.provider_transaction_id], importStatus: imports[0].status,
}, null, 2)}\n`);
