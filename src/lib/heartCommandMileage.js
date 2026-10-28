export const HEART_COMMAND_MILEAGE_PATH = '/HeartCommand/Mileage';
export const MILEAGE_TEST_NOTE = '[TEST MILEAGE — EXCLUDE FROM FINANCIAL REPORTS]';

const numeric = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const today = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

export function newMileageDraft(overrides = {}) {
  return {
    recordId: globalThis.crypto?.randomUUID?.() || `trip-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tripDate: today(),
    businessId: '',
    origin: '',
    destination: '',
    purpose: '',
    classification: 'needs_review',
    vehicleId: '',
    vehicleName: '',
    startOdometer: '',
    endOdometer: '',
    totalMiles: '',
    startLatitude: null,
    startLongitude: null,
    endLatitude: null,
    endLongitude: null,
    existingNotes: '',
    ...overrides,
  };
}

export function mileageDraftStorageKey(userId) {
  return `heart-command-mileage-draft:${userId || 'signed-out'}`;
}

export function calculateMileage(draft) {
  const totalMiles = numeric(draft.totalMiles);
  if (totalMiles !== null) {
    if (totalMiles <= 0) throw new Error('Total miles must be greater than zero.');
    return { miles: Number(totalMiles.toFixed(3)), source: 'manual' };
  }

  const start = numeric(draft.startOdometer);
  const end = numeric(draft.endOdometer);
  if (start === null || end === null) {
    throw new Error('Enter total miles, or enter both starting and ending odometer readings.');
  }
  if (start < 0 || end < 0) throw new Error('Odometer readings cannot be negative.');
  if (end <= start) throw new Error('Ending odometer must be greater than starting odometer.');
  return { miles: Number((end - start).toFixed(3)), source: 'odometer' };
}

export function validateMileageDraft(draft) {
  const missing = [];
  if (!draft.tripDate) missing.push('trip date');
  if (!String(draft.origin || '').trim()) missing.push('origin');
  if (!String(draft.destination || '').trim()) missing.push('destination');
  if (draft.classification === 'business' && !String(draft.purpose || '').trim()) missing.push('business purpose');
  if (!draft.businessId) missing.push('business');
  if (!draft.vehicleId && !String(draft.vehicleName || '').trim()) missing.push('vehicle');
  if (missing.length) throw new Error(`Enter ${missing.join(', ')}.`);
  return calculateMileage(draft);
}

function tripTime(date) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Enter a valid trip date.');
  return parsed.toISOString();
}

function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

export function buildMileageInsert({ draft, userId, nowIso = new Date().toISOString(), isTest = false }) {
  const { miles, source } = validateMileageDraft(draft);
  const startedAt = tripTime(draft.tripDate);
  const customVehicle = draft.vehicleId ? '' : cleanText(draft.vehicleName, 120);
  const preservedNotes = cleanText(draft.existingNotes, 2_000)
    .split('\n')
    .filter((line) => line && !line.startsWith('Manual vehicle:'))
    .join('\n');
  const notes = [
    isTest ? MILEAGE_TEST_NOTE : '',
    preservedNotes,
    customVehicle ? `Manual vehicle: ${customVehicle}` : '',
  ].filter(Boolean).join('\n') || null;

  return {
    id: draft.recordId,
    driver_user_id: userId,
    business_id: draft.businessId,
    vehicle_id: draft.vehicleId || null,
    started_at: startedAt,
    ended_at: startedAt,
    display_timezone: 'America/New_York',
    start_location_label: cleanText(draft.origin, 240),
    destination_label: cleanText(draft.destination, 240),
    start_latitude: numeric(draft.startLatitude),
    start_longitude: numeric(draft.startLongitude),
    end_latitude: numeric(draft.endLatitude),
    end_longitude: numeric(draft.endLongitude),
    business_purpose: cleanText(draft.purpose, 500) || null,
    classification: ['business', 'personal', 'commuting', 'needs_review'].includes(draft.classification) ? draft.classification : 'needs_review',
    status: 'ended',
    start_odometer: numeric(draft.startOdometer),
    end_odometer: numeric(draft.endOdometer),
    odometer_distance_miles: source === 'odometer' ? miles : null,
    manual_distance_miles: source === 'manual' ? miles : null,
    final_distance_miles: miles,
    measurement_source: source,
    review_status: draft.classification === 'needs_review' ? 'needs_review' : 'reviewed',
    notes,
    client_created_at: nowIso,
    client_updated_at: nowIso,
  };
}

export function buildMileageUpdate({ draft, nowIso = new Date().toISOString() }) {
  const insert = buildMileageInsert({ draft, userId: '00000000-0000-0000-0000-000000000000', nowIso });
  const {
    id,
    driver_user_id,
    client_created_at,
    ...update
  } = insert;
  void id;
  void driver_user_id;
  void client_created_at;
  return update;
}

export function tripToMileageDraft(trip, vehicles = []) {
  const vehicle = vehicles.find((item) => item.id === trip.vehicle_id);
  const manualVehicle = String(trip.notes || '').match(/(?:^|\n)Manual vehicle: ([^\n]+)/)?.[1] || '';
  return newMileageDraft({
    recordId: trip.id,
    tripDate: String(trip.started_at || '').slice(0, 10),
    businessId: trip.business_id || '',
    origin: trip.start_location_label || '',
    destination: trip.destination_label || '',
    purpose: trip.business_purpose || '',
    classification: trip.classification || 'needs_review',
    vehicleId: trip.vehicle_id || '',
    vehicleName: vehicle?.nickname || manualVehicle,
    startOdometer: trip.start_odometer ?? '',
    endOdometer: trip.end_odometer ?? '',
    totalMiles: trip.measurement_source === 'manual' ? (trip.final_distance_miles ?? '') : '',
    startLatitude: trip.start_latitude ?? null,
    startLongitude: trip.start_longitude ?? null,
    endLatitude: trip.end_latitude ?? null,
    endLongitude: trip.end_longitude ?? null,
    existingNotes: trip.notes || '',
  });
}

export function isMileageTestRecord(trip) {
  return String(trip?.notes || '').includes(MILEAGE_TEST_NOTE);
}
