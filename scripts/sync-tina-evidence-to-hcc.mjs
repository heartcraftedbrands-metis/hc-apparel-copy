import { readFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.HCC_BASE_URL || 'http://127.0.0.1:4176').replace(/\/$/, '');
const evidenceDirectory = process.env.HC_EVIDENCE_DIRECTORY || path.join(process.env.USERPROFILE || '', 'Downloads');

const evidence = [
  {
    receiptId: 'receipt-tina-michaels-financial-account-20261014',
    expenseId: 'expense-tina-michaels-20261014-1196',
    sourceName: 'Screenshot_14-10-2026_17498_dashboard.stripe.com.jpeg',
    paymentSourceType: 'Business',
    paymentMethodLabel: 'Stripe Financial Account card ending 6373',
  },
  {
    receiptId: 'receipt-tina-perfecpress-tpjahhv8t',
    expenseId: 'expense-tina-perfecpress-tpjahhv8t',
    sourceName: 'Screenshot_14-10-2026_15390_perfecpresshtv.com.jpeg',
    paymentSourceType: 'Business',
    paymentMethodLabel: 'Visa ending 6216',
  },
  {
    receiptId: 'receipt-tina-usps-financial-account-20261014',
    expenseId: 'expense-tina-usps-9505506617716287884250',
    sourceName: 'Screenshot_14-10-2026_174851_dashboard.stripe.com.jpeg',
    paymentSourceType: 'Business',
    paymentMethodLabel: 'Payment source under review (card ending mismatch)',
  },
  {
    receiptId: 'receipt-racetrac-2329-financial-account-20261014',
    expenseId: 'expense-racetrac-2329-20261014-254',
    sourceName: 'screenshot-1792014514795.png',
    paymentSourceType: 'Business',
    paymentMethodLabel: 'Stripe Financial Account card ending 6373',
  },
];

async function readJson(response) {
  const body = await response.text();
  const parsed = body ? JSON.parse(body) : null;
  if (!response.ok) throw new Error(parsed?.error || `${response.status} ${response.statusText}`);
  return parsed;
}

const session = await readJson(await fetch(`${baseUrl}/api/session`, { headers: { accept: 'application/json' } }));
if (!session?.sessionToken) throw new Error('Heart Command Center did not provide its existing same-origin session.');
const shared = await readJson(await fetch(`${baseUrl}/api/local-records`, { headers: { accept: 'application/json' } }));
const receipts = new Map((shared.receipts || []).map(record => [record.id, record]));
const expenses = new Map((shared.expenses || []).map(record => [record.id, record]));

async function upsert(store, record) {
  return readJson(await fetch(`${baseUrl}/api/local-records/upsert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hcc-session': session.sessionToken },
    body: JSON.stringify({ store, record }),
  }));
}

const results = [];
for (const item of evidence) {
  const receipt = receipts.get(item.receiptId);
  const expense = expenses.get(item.expenseId);
  if (!receipt || !expense) throw new Error(`Stable HCC receipt/expense pair is unavailable for ${item.receiptId}.`);
  const bytes = await readFile(path.join(evidenceDirectory, item.sourceName));
  const mimeType = item.sourceName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const upload = await readJson(await fetch(`${baseUrl}/api/receipts/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hcc-session': session.sessionToken },
    body: JSON.stringify({
      receiptId: item.receiptId,
      fileName: item.sourceName,
      mimeType,
      base64: bytes.toString('base64'),
    }),
  }));
  const updatedAt = new Date().toISOString();
  const receiptRecord = {
    ...receipt,
    ...upload,
    expenseId: item.expenseId,
    paymentSourceType: item.paymentSourceType,
    paymentMethodLabel: item.paymentMethodLabel,
    fileSize: upload.size || bytes.byteLength,
    previewUrl: upload.previewUrl || `/api/receipts/file/${upload.fileId}`,
    updatedAt,
  };
  await upsert('receipts', receiptRecord);
  await upsert('expenses', { ...expense, receiptId: item.receiptId, receiptName: receiptRecord.fileName, updatedAt });
  results.push({ receiptId: item.receiptId, expenseId: item.expenseId, fileId: upload.fileId, byteSize: bytes.byteLength });
}

console.log(JSON.stringify({ ok: true, recordsUpdated: results.length, duplicateExpensesCreated: 0, evidence: results }, null, 2));
