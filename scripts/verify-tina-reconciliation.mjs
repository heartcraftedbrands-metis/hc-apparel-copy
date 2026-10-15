import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/202610140005_tina_costs_and_shipment.sql', import.meta.url), 'utf8');
const worker = await readFile(new URL('../supabase/functions/operations-financial-sync/index.ts', import.meta.url), 'utf8');

const requiredMigrationEvidence = [
  "'HCA-2026-0002'",
  "'expense-tina-michaels-20261014-1196'",
  "'expense-tina-perfecpress-tpjahhv8t'",
  "'expense-tina-usps-9505506617716287884250'",
  "'expense-racetrac-2329-20261014-254'",
  "'recordedActualCostTotal',58.76",
  "'knownAmountAfterVerifiedCosts',22.21",
  "'paperReceiptFileAvailable',false",
  "'purchaseDate',null",
  "'linkedToTinaInvoice',false",
  'customer_invoice_shipments',
];

for (const marker of requiredMigrationEvidence) {
  assert.ok(migration.includes(marker), `Migration is missing required marker: ${marker}`);
}

assert.match(worker, /\/v1\/treasury\/financial_accounts/);
assert.match(worker, /\/v1\/treasury\/transactions/);
assert.match(worker, /\/v1\/treasury\/received_debits/);
assert.match(worker, /tracking\/v3r2\/tracking/);
assert.match(worker, /paymentVerificationSeparate:\s*true/);
assert.match(worker, /chargedCard:\s*false/);
assert.match(worker, /issuedRefund:\s*false/);
assert.match(worker, /sentInvoice:\s*false/);
assert.match(worker, /purchasedPostage:\s*false/);

for (const forbidden of [
  "fetch('https://api.stripe.com/v1/payment_intents', { method: 'POST'",
  "fetch('https://api.stripe.com/v1/refunds', { method: 'POST'",
  'send_invoice',
]) {
  assert.ok(!worker.includes(forbidden), `Financial verification worker contains forbidden mutation marker: ${forbidden}`);
}

const customerFunction = migration.slice(
  migration.indexOf('create or replace function public.customer_invoice_shipments'),
  migration.indexOf('revoke all on function public.customer_invoice_shipments'),
);
for (const privateField of ['postage_cents', 'evidence jsonb', 'receipt_printed_at', 'insurance_cents']) {
  assert.ok(!customerFunction.includes(privateField), `Customer shipment RPC leaks private field: ${privateField}`);
}

console.log('Tina reconciliation static verification passed.');
