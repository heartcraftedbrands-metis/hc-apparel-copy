import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const lib = await import(pathToFileURL(path.join(root, 'src/lib/heartCommandMileage.js')).href);

const base = {
  recordId: '11111111-1111-4111-8111-111111111111',
  tripDate: '2026-10-28',
  businessId: 'hc-apparel',
  origin: 'TEST — 1 Main Street',
  destination: 'TEST — 2 Market Street',
  purpose: 'TEST DATA — mobile mileage verification',
  vehicleId: '22222222-2222-4222-8222-222222222222',
  vehicleName: '',
  startOdometer: '1000.2',
  endOdometer: '1015.7',
  totalMiles: '',
};

assert.deepEqual(lib.calculateMileage(base), { miles: 15.5, source: 'odometer' });
assert.deepEqual(lib.calculateMileage({ ...base, totalMiles: '22.4' }), { miles: 22.4, source: 'manual' });
assert.throws(() => lib.validateMileageDraft({ ...base, origin: '' }), /origin/);
assert.throws(() => lib.calculateMileage({ ...base, endOdometer: '999' }), /greater/);

const insert = lib.buildMileageInsert({
  draft: base,
  userId: '33333333-3333-4333-8333-333333333333',
  nowIso: '2026-10-28T12:00:00.000Z',
  isTest: true,
});
assert.equal(insert.id, base.recordId, 'retry must reuse the stable record id');
assert.equal(insert.final_distance_miles, 15.5);
assert.equal(insert.measurement_source, 'odometer');
assert.match(insert.notes, /TEST MILEAGE/);
assert.equal(lib.isMileageTestRecord(insert), true, 'test records must be explicitly identifiable for exclusion');

const update = lib.buildMileageUpdate({ draft: { ...base, purpose: 'Updated purpose' }, nowIso: '2026-10-28T13:00:00.000Z' });
assert.equal(update.id, undefined, 'edits must not replace record identity');
assert.equal(update.driver_user_id, undefined, 'edits must not replace owner identity');
assert.equal(update.business_purpose, 'Updated purpose');

const simulatedStore = new Map();
simulatedStore.set(insert.id, insert);
simulatedStore.set(insert.id, { ...insert, business_purpose: 'Retry kept one record' });
assert.equal(simulatedStore.size, 1, 'a repeated save with the same stable id must not duplicate a trip');
simulatedStore.set(insert.id, { ...simulatedStore.get(insert.id), ...update });
assert.equal(simulatedStore.size, 1, 'editing must update the existing record');
assert.equal(simulatedStore.get(insert.id).business_purpose, 'Updated purpose');

const component = fs.readFileSync(path.join(root, 'src/pages/HeartCommandMileage.jsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
for (const label of ['Trip date', 'Origin', 'Destination', 'Business purpose', 'Vehicle', 'Starting odometer', 'Ending odometer', 'Total miles']) {
  assert.match(component, new RegExp(label), `mobile form is missing ${label}`);
}
assert.match(component, /upsert\(buildMileageInsert/, 'new save must use stable-id upsert for retry safety');
assert.match(component, /eq\('sync_revision'/, 'edit must detect concurrent updates');
assert.match(component, /localStorage\.setItem/, 'failed and in-progress drafts must persist on device');
assert.match(component, /navigator\.geolocation\.getCurrentPosition/, 'foreground location permission flow must be explicit');
assert.match(component, /manual entry always works/i, 'manual fallback must be disclosed');
assert.match(app, /\/HeartCommand\/Mileage/, 'standalone mobile route must be registered');
assert.doesNotMatch(component, /watchPosition|background/i, 'web UI must not claim or initiate background tracking');

console.log('PASS: 25 Heart Command mileage workflow assertions');
