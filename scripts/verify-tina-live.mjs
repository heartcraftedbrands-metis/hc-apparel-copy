import assert from 'node:assert/strict';

const baseUrl = (process.env.HC_APPAREL_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.HC_APPAREL_SUPABASE_SERVICE_ROLE_KEY || '';
if (!baseUrl || !serviceKey) throw new Error('Supabase URL and service-role key are required.');

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
async function get(path) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const invoiceId = 'invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0';
const addedIds = new Set([
  'expense-tina-michaels-20261014-1196',
  'expense-tina-perfecpress-tpjahhv8t',
  'expense-tina-usps-9505506617716287884250',
  'expense-racetrac-2329-20261014-254',
  'receipt-tina-michaels-financial-account-20261014',
  'receipt-tina-perfecpress-tpjahhv8t',
  'receipt-tina-usps-financial-account-20261014',
  'receipt-racetrac-2329-financial-account-20261014',
]);

const [records, allocations, shipments, transactions, matches, files, syncRows] = await Promise.all([
  get('ops_shared_records?select=id,record_type,status,source_system,payload&order=record_type.asc,id.asc'),
  get(`ops_cost_allocations?shared_record_id=eq.${invoiceId}&select=id,expense_record_id,relationship,allocated_amount_cents,allocation_status,payment_verification_status&order=relationship.asc`),
  get(`ops_shipments?shared_record_id=eq.${invoiceId}&select=carrier,tracking_number,service,shipment_status,status_summary,postage_cents,expected_delivery_date,expected_delivery_is_estimate,last_checked_at,status_source`),
  get('ops_financial_transactions?business_id=eq.hc-apparel&select=id,provider_transaction_id,transaction_kind,amount_cents,occurred_at,merchant_name,source_status,source_type,review_status&order=occurred_at.desc'),
  get(`ops_reconciliation_matches?shared_record_id=eq.${invoiceId}&select=financial_transaction_id,relationship,match_status,confidence,review_notes&order=relationship.asc`),
  get('ops_receipt_files?business_id=eq.hc-apparel&select=record_id,storage_path,original_filename,media_type,byte_size,checksum_sha256&order=record_id.asc'),
  get('ops_financial_sync_state?source=eq.stripe&business_id=eq.hc-apparel&select=status,last_attempt_at,last_success_at,last_error,records_seen,records_upserted,capability_status'),
]);

const invoice = records.find(record => record.id === invoiceId)?.payload;
assert.ok(invoice, 'Tina invoice is missing.');
assert.equal(invoice.invoiceNumber, 'HCA-2026-0002');
assert.equal(Number(invoice.total), 83.70);
assert.equal(invoice.paymentHistory?.[0]?.paymentIntentId, 'pi_3UMKvy77O18gAiWR03l77Mlk');
assert.equal(Number(invoice.financialReconciliation?.customerPayment?.processingFee), 2.73);
assert.equal(Number(invoice.financialReconciliation?.relatedCosts?.verifiedActualCosts), 58.76);
assert.equal(Number(invoice.financialReconciliation?.margin?.knownAmountAfterVerifiedCosts), 22.21);
assert.equal(invoice.financialReconciliation?.margin?.complete, false);

assert.equal(records.filter(record => !addedIds.has(record.id)).length, 7, 'Original synchronized record count changed.');
assert.equal(records.filter(record => record.record_type === 'invoice').length, 2);
assert.equal(records.filter(record => record.record_type === 'expense').length, 8);
assert.equal(records.filter(record => record.record_type === 'receipt').length, 5);

assert.deepEqual(
  allocations.map(row => [row.relationship, Number(row.allocated_amount_cents), row.allocation_status]),
  [
    ['blank_garments', 1196, 'confirmed'],
    ['postage', 1500, 'confirmed'],
    ['transfers_printing', 3180, 'confirmed'],
  ],
);
assert.equal(shipments.length, 1);
assert.equal(shipments[0].tracking_number, '9505506617716287884250');
assert.equal(Number(shipments[0].postage_cents), 1500);
assert.ok(shipments[0].last_checked_at, 'USPS status has not been checked.');

const evidenceFiles = files.filter(file => addedIds.has(file.record_id));
assert.equal(evidenceFiles.length, 4);
assert.ok(evidenceFiles.every(file => file.checksum_sha256 && file.storage_path), 'A private evidence file is incomplete.');

const michaels = transactions.find(row => row.id === 'stripe:evidence:michaels-5082:20261014:1196');
const usps = transactions.find(row => row.id === 'stripe:evidence:usps-kiosk-1204599557:20261014:1500');
const racetrac = transactions.find(row => row.id === 'stripe:evidence:racetrac-2329:20261014:254');
assert.equal(michaels?.review_status, 'confirmed');
assert.equal(usps?.review_status, 'review_needed');
assert.equal(racetrac?.review_status, 'review_needed');
assert.ok(matches.some(row => row.relationship === 'postage' && row.match_status === 'review_needed'));

const sync = syncRows[0] || {};
assert.equal(sync.capability_status?.uspsTrackingRead, true);

console.log(JSON.stringify({
  sharedRecords: {
    total: records.length,
    originalPreserved: records.filter(record => !addedIds.has(record.id)).length,
    invoices: records.filter(record => record.record_type === 'invoice').length,
    expenses: records.filter(record => record.record_type === 'expense').length,
    receipts: records.filter(record => record.record_type === 'receipt').length,
  },
  tinaInvoice: {
    id: invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    grossCollected: invoice.financialReconciliation.customerPayment.grossCollected,
    processingFee: invoice.financialReconciliation.customerPayment.processingFee,
    netAfterStripe: invoice.financialReconciliation.customerPayment.netAfterStripe,
    verifiedActualCosts: invoice.financialReconciliation.relatedCosts.verifiedActualCosts,
    knownMargin: invoice.financialReconciliation.margin.knownAmountAfterVerifiedCosts,
    complete: invoice.financialReconciliation.margin.complete,
    missing: invoice.financialReconciliation.relatedCosts.missing,
  },
  allocations,
  shipment: shipments[0],
  privateEvidenceFiles: evidenceFiles.map(file => ({
    recordId: file.record_id,
    storagePath: file.storage_path,
    byteSize: file.byte_size,
    checksumVerified: true,
  })),
  reviewQueue: {
    uspsCardMatch: usps.review_status,
    raceTrac: racetrac.review_status,
    perfecPressPayment: 'unverified — Visa 6216 is not forced into Stripe Mastercard data',
  },
  automaticSync: {
    status: sync.status,
    lastAttemptAt: sync.last_attempt_at,
    lastSuccessAt: sync.last_success_at,
    recordsSeen: sync.records_seen,
    treasuryTransactionsRead: sync.capability_status?.treasuryTransactionsRead ?? false,
    uspsTrackingRead: sync.capability_status?.uspsTrackingRead ?? false,
    requiredPermission: sync.capability_status?.requiredPermission || null,
    error: sync.last_error || null,
  },
}, null, 2));
