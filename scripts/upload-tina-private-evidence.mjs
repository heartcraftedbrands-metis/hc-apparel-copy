import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const supabaseUrl = (process.env.HC_APPAREL_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.HC_APPAREL_SUPABASE_SERVICE_ROLE_KEY || '';
const evidenceDirectory = process.env.HC_EVIDENCE_DIRECTORY || path.join(process.env.USERPROFILE || '', 'Downloads');

if (!supabaseUrl || !serviceKey) {
  throw new Error('HC_APPAREL_SUPABASE_URL and HC_APPAREL_SUPABASE_SERVICE_ROLE_KEY are required.');
}

const evidence = [
  {
    fileId: '7f1a91c0-c497-4a8e-9da7-b41f6fbaf001',
    recordId: 'receipt-tina-michaels-financial-account-20261014',
    sourceName: 'Screenshot_14-10-2026_17498_dashboard.stripe.com.jpeg',
    storagePath: 'hc-apparel/tina-dunn/2026-10-14/michaels-financial-account.jpeg',
    mediaType: 'image/jpeg',
    expectedHash: '50f5e54f223dcdb05ffff48df8de0bb59461c006a00b3b38ec19b52059a211ef',
  },
  {
    fileId: '7f1a91c0-c497-4a8e-9da7-b41f6fbaf002',
    recordId: 'receipt-tina-perfecpress-tpjahhv8t',
    sourceName: 'Screenshot_14-10-2026_15390_perfecpresshtv.com.jpeg',
    storagePath: 'hc-apparel/tina-dunn/perfecpress-confirmation-tpjahhv8t.jpeg',
    mediaType: 'image/jpeg',
    expectedHash: 'a56356e6086258774e7b5524892c234a942ada83b9ffdedf8e7ea1708cffd194',
  },
  {
    fileId: '7f1a91c0-c497-4a8e-9da7-b41f6fbaf003',
    recordId: 'receipt-tina-usps-financial-account-20261014',
    sourceName: 'Screenshot_14-10-2026_174851_dashboard.stripe.com.jpeg',
    storagePath: 'hc-apparel/tina-dunn/2026-10-14/usps-financial-account.jpeg',
    mediaType: 'image/jpeg',
    expectedHash: '24cda26438aed23629391631057ae6fc2f894f75e5e4df7ed28646e11ea1f5ca',
  },
  {
    fileId: '7f1a91c0-c497-4a8e-9da7-b41f6fbaf004',
    recordId: 'receipt-racetrac-2329-financial-account-20261014',
    sourceName: 'screenshot-1792014514795.png',
    storagePath: 'hc-apparel/review/2026-10-14/racetrac-financial-account.png',
    mediaType: 'image/png',
    expectedHash: 'd07307f6f2653bd90e098cc823064ff532ef000737d8a6d6d3d1b855ed215580',
  },
];

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

const profiles = await request(`${supabaseUrl}/rest/v1/profiles?select=id,role&role=eq.admin&limit=1`);
const uploadedBy = profiles?.[0]?.id;
if (!uploadedBy) throw new Error('No existing HC Apparel admin profile is available to own private evidence files.');

const results = [];
for (const item of evidence) {
  const sourcePath = path.join(evidenceDirectory, item.sourceName);
  const bytes = await readFile(sourcePath);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== item.expectedHash) throw new Error(`Checksum mismatch for ${item.sourceName}.`);

  const encodedPath = item.storagePath.split('/').map(encodeURIComponent).join('/');
  await request(`${supabaseUrl}/storage/v1/object/business-receipts/${encodedPath}`, {
    method: 'POST',
    headers: { 'Content-Type': item.mediaType, 'x-upsert': 'true' },
    body: bytes,
  });

  const row = {
    id: item.fileId,
    record_id: item.recordId,
    business_id: 'hc-apparel',
    storage_path: item.storagePath,
    original_filename: item.sourceName,
    media_type: item.mediaType,
    page_number: 1,
    byte_size: bytes.byteLength,
    checksum_sha256: actualHash,
    uploaded_by: uploadedBy,
    reviewed_at: new Date().toISOString(),
    reviewed_by: uploadedBy,
  };
  await request(`${supabaseUrl}/rest/v1/ops_receipt_files?on_conflict=storage_path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  results.push({ recordId: item.recordId, storagePath: item.storagePath, byteSize: bytes.byteLength, checksumVerified: true });
}

console.log(JSON.stringify({ uploaded: results.length, bucket: 'business-receipts', private: true, evidence: results }, null, 2));
