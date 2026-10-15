import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (quoted) throw new Error('CSV ended inside a quoted field.');
  const [header, ...records] = rows.filter((values) => values.some((value) => value !== ''));
  if (!header) return [];
  return records.map((values) => Object.fromEntries(header.map((name, index) => [name.replace(/^\uFEFF/, ''), values[index] ?? ''])));
}

const filePath = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node scripts/import-stripe-balance-export.mjs <stripe-csv-path>');

const supabaseUrl = process.env.HC_APPAREL_SUPABASE_URL;
const serviceRoleKey = process.env.HC_APPAREL_SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('HC_APPAREL_SUPABASE_URL and HC_APPAREL_SUPABASE_SERVICE_ROLE_KEY are required.');

const bytes = await readFile(filePath);
const sourceHash = createHash('sha256').update(bytes).digest('hex');
const rows = parseCsv(bytes.toString('utf8'));
const required = ['id', 'category', 'amount', 'currency', 'created', 'posted_at', 'flow_id', 'financial_account_id'];
for (const [index, row] of rows.entries()) {
  for (const key of required) {
    if (!(key in row)) throw new Error(`CSV is missing required column ${key}.`);
  }
  if (!row.id) throw new Error(`CSV row ${index + 2} is missing its Stripe transaction ID.`);
}

const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/ops_import_stripe_balance_export`, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
    'x-client-info': 'hc-apparel-stripe-balance-import/1.0',
  },
  body: JSON.stringify({
    p_rows: rows,
    p_source_hash: sourceHash,
    p_original_filename: basename(filePath),
    p_imported_by: null,
  }),
});

const responseText = await response.text();
if (!response.ok) throw new Error(`Stripe balance import failed (${response.status}): ${responseText}`);
const result = responseText ? JSON.parse(responseText) : null;
process.stdout.write(`${JSON.stringify({ file: basename(filePath), sourceHash, inputRows: rows.length, result }, null, 2)}\n`);
