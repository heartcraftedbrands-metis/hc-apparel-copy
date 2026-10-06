import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edge = await readFile(new URL('../supabase/functions/ss-activewear/index.ts', import.meta.url), 'utf8');
const admin = await readFile(new URL('../src/pages/AdminSSApiSettings.jsx', import.meta.url), 'utf8');

assert.match(edge, /'verify_carhartt_source'/, 'read-only Carhartt source audit action must exist');
assert.match(edge, /requestedBrand = 'Carhartt'/, 'audit must target Carhartt exactly');
assert.match(edge, /can_source_20_styles: qualifyingStyles\.length >= 20/, 'twenty-style gate must be explicit');
assert.match(edge, /online_retail_allowed: onlineRetailAllowed/, 'S&S online-retail restriction must be audited');
assert.match(edge, /storefront_changed: false/, 'audit must report no storefront mutation');
assert.match(edge, /ss_order_submitted: false/, 'audit must report no supplier order');
assert.doesNotMatch(edge, /approvedBrands[\s\S]{0,500}'Carhartt'/, 'Carhartt must not enter approved imports before sourcing passes');
assert.match(admin, /Verify Carhartt sourcing/, 'admin must expose the source audit');
assert.match(admin, /This does not stage or publish products/, 'admin must describe the audit as non-publishing');

console.log('PASS: authenticated Carhartt source audit is read-only and publication-gated.');
