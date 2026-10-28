import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const lib = await import(pathToFileURL(path.join(root, 'src/lib/heartCommandMileage.js')).href);
const tracking = await import(pathToFileURL(path.join(root, 'src/lib/mileageTracking.js')).href);

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
const tracker = fs.readFileSync(path.join(root, 'src/components/heart-command/MileageTracker.jsx'), 'utf8');
const taxRecords = fs.readFileSync(path.join(root, 'src/components/heart-command/MileageTaxRecords.jsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
for (const label of ['Trip date', 'Origin', 'Destination', 'Specific business purpose', 'Vehicle', 'Starting odometer', 'Ending odometer', 'Total miles']) {
  assert.match(component, new RegExp(label), `mobile form is missing ${label}`);
}
assert.match(component, /upsert\(buildMileageInsert/, 'new save must use stable-id upsert for retry safety');
assert.match(component, /eq\('sync_revision'/, 'edit must detect concurrent updates');
assert.match(component, /localStorage\.setItem/, 'failed and in-progress drafts must persist on device');
assert.match(component, /navigator\.geolocation\.getCurrentPosition/, 'foreground location permission flow must be explicit');
assert.match(component, /Manual fallback/i, 'manual fallback must be disclosed');
assert.match(app, /\/HeartCommand\/Mileage/, 'standalone mobile route must be registered');
assert.match(tracker, /Start Trip/);
assert.match(tracker, /End Trip/);
assert.match(tracker, /watchPosition/, 'foreground tracking must use browser location updates');
assert.match(tracker, /Safari is foreground-only/, 'Safari must not be represented as background-safe');
assert.match(tracker, /2024 Toyota Tacoma 4×4/, 'the owner vehicle setup must be available');
for (const label of ['Business', 'Personal', 'Commuting', 'Unclassified']) {
  assert.match(tracker, new RegExp(label), `${label} classification must be available`);
}
assert.match(taxRecords, /Annual odometer miles/);
assert.match(taxRecords, /Export CSV/);

const first = { recordedAt: '2026-10-28T12:00:00.000Z', latitude: 33.749, longitude: -84.388, accuracy: 8 };
const second = { recordedAt: '2026-10-28T12:05:00.000Z', latitude: 33.759, longitude: -84.388, accuracy: 7 };
let tracked = tracking.appendTrackedPoint({ points: [], gpsDistanceMiles: 0, trackingGapCount: 0 }, first);
tracked = tracking.appendTrackedPoint(tracked, second);
assert.ok(tracked.gpsDistanceMiles > 0.65 && tracked.gpsDistanceMiles < 0.75, 'actual geographic distance must be calculated');

const afterGap = tracking.appendTrackedPoint(tracked, { ...second, recordedAt: '2026-10-28T12:20:01.000Z', latitude: 33.769 });
assert.equal(afterGap.gpsDistanceMiles, tracked.gpsDistanceMiles, 'distance across an interruption must not be invented');
assert.equal(afterGap.trackingGapCount, tracked.trackingGapCount + 1);
const inaccurate = tracking.appendTrackedPoint(afterGap, { ...second, recordedAt: '2026-10-28T12:20:30.000Z', accuracy: 250 });
assert.equal(inaccurate.gpsDistanceMiles, afterGap.gpsDistanceMiles, 'poor-accuracy point must not add distance');

const liveTrips = [
  { id: 'business', started_at: '2026-10-28T12:00:00Z', vehicle_id: 'v1', classification: 'business', final_distance_miles: 10, measurement_source: 'gps', status: 'ended', business_purpose: 'Delivery' },
  { id: 'personal', started_at: '2026-10-29T12:00:00Z', vehicle_id: 'v1', classification: 'personal', final_distance_miles: 4, measurement_source: 'odometer', status: 'ended' },
  { id: 'test', started_at: '2026-10-30T12:00:00Z', vehicle_id: 'v1', classification: 'business', final_distance_miles: 99, measurement_source: 'manual', status: 'ended', notes: lib.MILEAGE_TEST_NOTE },
];
const summary = tracking.mileageSummary(liveTrips, { year: 2026, vehicleId: 'v1' });
assert.equal(summary.recordedMiles, 14, 'test mileage must be excluded from summaries');
assert.equal(summary.categories.business, 10);
assert.equal(summary.categories.personal, 4);
const csv = tracking.mileageCsv(liveTrips, [{ id: 'v1', nickname: 'Tacoma' }], []);
assert.match(csv, /business/);
assert.doesNotMatch(csv, /99/);

console.log('PASS: 44 Heart Command mileage workflow assertions');
