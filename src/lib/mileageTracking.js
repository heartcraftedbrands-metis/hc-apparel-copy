import { isMileageTestRecord, MILEAGE_TEST_NOTE } from './heartCommandMileage.js';

export const GPS_ACCURACY_LIMIT_METERS = 100;
export const GPS_GAP_LIMIT_MS = 5 * 60 * 1000;
export const GPS_MAX_PLAUSIBLE_MPH = 120;

const radians = (degrees) => (degrees * Math.PI) / 180;

export function haversineMiles(a, b) {
  if (!a || !b) return 0;
  const earthMiles = 3958.7613;
  const latitude = radians(b.latitude - a.latitude);
  const longitude = radians(b.longitude - a.longitude);
  const value = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.min(1, Math.sqrt(value)));
}

function warning(message, recordedAt) {
  return `${recordedAt}: ${message}`;
}

export function appendTrackedPoint(trip, point) {
  const recordedAt = point.recordedAt || new Date(point.timestamp || Date.now()).toISOString();
  const normalized = {
    id: point.id || globalThis.crypto?.randomUUID?.() || `point-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    recordedAt,
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    accuracy: Number(point.accuracy || 0),
    altitude: point.altitude == null ? null : Number(point.altitude),
    speed: point.speed == null ? null : Number(point.speed),
    heading: point.heading == null ? null : Number(point.heading),
    isMocked: point.isMocked === true,
  };
  const notes = [...(trip.trackingGapNotes || [])];
  let gapCount = Number(trip.trackingGapCount || 0);
  let increment = 0;
  const inaccurate = normalized.accuracy > GPS_ACCURACY_LIMIT_METERS;
  const usable = !inaccurate && !normalized.isMocked;
  const previous = trip.lastUsablePoint;

  if (normalized.isMocked) {
    gapCount += 1;
    notes.push(warning('Mock location was rejected.', recordedAt));
  } else if (inaccurate) {
    gapCount += 1;
    notes.push(warning(`GPS accuracy was ${normalized.accuracy.toFixed(0)} m; point excluded.`, recordedAt));
  } else if (previous) {
    const elapsedMs = new Date(recordedAt).getTime() - new Date(previous.recordedAt).getTime();
    if (elapsedMs > GPS_GAP_LIMIT_MS) {
      gapCount += 1;
      notes.push(warning(`${(elapsedMs / 60000).toFixed(1)} minute tracking interruption; missing distance was not estimated.`, recordedAt));
    } else if (elapsedMs > 0) {
      const distance = haversineMiles(previous, normalized);
      const speedMph = distance / (elapsedMs / 3_600_000);
      if (speedMph > GPS_MAX_PLAUSIBLE_MPH) {
        gapCount += 1;
        notes.push(warning(`Implausible ${speedMph.toFixed(0)} mph GPS jump was excluded.`, recordedAt));
      } else {
        increment = distance;
      }
    }
  }

  return {
    ...trip,
    points: [...(trip.points || []), normalized],
    gpsDistanceMiles: Number(trip.gpsDistanceMiles || 0) + increment,
    lastPoint: normalized,
    lastUsablePoint: usable ? normalized : trip.lastUsablePoint,
    latestAccuracy: normalized.accuracy,
    trackingGapCount: gapCount,
    trackingGapNotes: notes,
    updatedAt: recordedAt,
  };
}

export function markTrackingInterruption(trip, reason, at = new Date().toISOString()) {
  return {
    ...trip,
    lastUsablePoint: null,
    trackingGapCount: Number(trip.trackingGapCount || 0) + 1,
    trackingGapNotes: [...(trip.trackingGapNotes || []), warning(reason, at)],
    updatedAt: at,
  };
}

export function formatElapsed(startedAt, endedAt = Date.now()) {
  const seconds = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
}

export function mileageSummary(trips, { year, vehicleId } = {}) {
  const categories = { business: 0, personal: 0, commuting: 0, unclassified: 0 };
  const sources = { gps: 0, odometer: 0, manual: 0, route_estimate: 0 };
  const included = (trips || []).filter((trip) => {
    if (isMileageTestRecord(trip)) return false;
    if (year && String(trip.started_at || '').slice(0, 4) !== String(year)) return false;
    if (vehicleId && trip.vehicle_id !== vehicleId) return false;
    return true;
  });
  for (const trip of included) {
    const miles = Number(trip.final_distance_miles || 0);
    const category = trip.classification === 'needs_review' ? 'unclassified' : trip.classification;
    if (category in categories) categories[category] += miles;
    if (trip.measurement_source in sources) sources[trip.measurement_source] += miles;
  }
  return {
    included,
    categories,
    sources,
    recordedMiles: Object.values(categories).reduce((sum, value) => sum + value, 0),
    incompleteCount: included.filter((trip) => trip.status === 'active' || trip.status === 'interrupted' || Number(trip.tracking_gap_count || 0) > 0).length,
    missingPurposeCount: included.filter((trip) => trip.classification === 'business' && !String(trip.business_purpose || '').trim()).length,
  };
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function mileageCsv(trips, vehicles = [], businesses = []) {
  const safeTrips = (trips || []).filter((trip) => !isMileageTestRecord(trip));
  const header = ['Trip reference', 'Date', 'Origin', 'Destination', 'Business purpose', 'Business/entity', 'Vehicle', 'Classification', 'Status', 'Miles', 'Mileage source', 'Start odometer', 'End odometer', 'Tracking gaps', 'Gap/correction notes', 'Review status', 'Last updated'];
  const rows = safeTrips.map((trip) => {
    const vehicle = vehicles.find((item) => item.id === trip.vehicle_id);
    const business = businesses.find((item) => item.id === trip.business_id);
    return [trip.id, String(trip.started_at || '').slice(0, 10), trip.start_location_label, trip.destination_label, trip.business_purpose, business?.name || trip.business_id, vehicle?.nickname || '', trip.classification === 'needs_review' ? 'unclassified' : trip.classification, trip.status, trip.final_distance_miles, trip.measurement_source, trip.start_odometer, trip.end_odometer, trip.tracking_gap_count, trip.tracking_gap_notes || String(trip.notes || '').replace(MILEAGE_TEST_NOTE, '').trim(), trip.review_status, trip.updated_at];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
