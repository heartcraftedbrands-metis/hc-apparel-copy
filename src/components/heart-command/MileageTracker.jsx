import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CarFront, CheckCircle2, Clock3, LocateFixed, Navigation, PauseCircle, PlayCircle, RefreshCw, Save, ShieldCheck, Smartphone } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { appendTrackedPoint, formatElapsed, markTrackingInterruption } from '@/lib/mileageTracking';
import { MILEAGE_TEST_NOTE } from '@/lib/heartCommandMileage';

const fieldClass = 'mt-2 min-h-12 w-full rounded-xl border border-[#cfc5aa] bg-white px-4 py-3 text-base text-[#183d2c] shadow-sm outline-none focus:border-[#b58a2a] focus:ring-4 focus:ring-[#d7aa43]/20';
const labelClass = 'block text-sm font-bold text-[#183d2c]';
const TACOMA_ID = '24ac0a24-4e24-4ac4-8244-000000000001';

function locationPoint(position) {
  return {
    id: globalThis.crypto?.randomUUID?.(),
    timestamp: position.timestamp,
    recordedAt: new Date(position.timestamp).toISOString(),
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    speed: position.coords.speed,
    heading: position.coords.heading,
    isMocked: false,
  };
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 }));
}

function permissionMessage(error) {
  if (error?.code === 1) return 'Location permission is denied. Use manual entry, or enable Precise Location for Safari in iPhone Settings.';
  if (error?.code === 2) return 'GPS is unavailable. Move to an open area or use manual entry.';
  if (error?.code === 3) return 'GPS timed out. Try again outdoors or use manual entry.';
  return error?.message || 'Location tracking could not start.';
}

export default function MileageTracker({ user, memberships, businesses, vehicles, onSaved, onVehicleAdded }) {
  const key = `heart-command-active-web-trip:${user.id}`;
  const watchRef = useRef(null);
  const tripRef = useRef(null);
  const [trip, setTrip] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
  });
  const [vehicleId, setVehicleId] = useState('');
  const [startOdometer, setStartOdometer] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState('00:00:00');
  const [review, setReview] = useState({ classification: 'needs_review', businessId: memberships.find((item) => item.business_id === 'hc-apparel')?.business_id || memberships[0]?.business_id || '', purpose: '', origin: '', destination: '', endOdometer: '', measurementSource: 'gps', manualMiles: '' });
  const [settingUpVehicle, setSettingUpVehicle] = useState(false);
  const testMode = user.role === 'admin' && new URLSearchParams(window.location.search).get('testMileage') === '1';

  useEffect(() => { tripRef.current = trip; if (trip) window.localStorage.setItem(key, JSON.stringify(trip)); else window.localStorage.removeItem(key); }, [key, trip]);
  useEffect(() => {
    if (!trip?.startedAt || trip.phase !== 'tracking') return undefined;
    const update = () => setElapsed(formatElapsed(trip.startedAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [trip?.phase, trip?.startedAt]);

  const stopWatcher = useCallback(() => {
    if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);

  const handlePoint = useCallback((position) => {
    setTrip((current) => current?.phase === 'tracking' ? appendTrackedPoint(current, locationPoint(position)) : current);
  }, []);

  const startWatcher = useCallback(() => {
    stopWatcher();
    if (!navigator.geolocation) throw new Error('This browser does not support location tracking. Use manual entry.');
    watchRef.current = navigator.geolocation.watchPosition(handlePoint, (gpsError) => {
      setError(permissionMessage(gpsError));
      setTrip((current) => current?.phase === 'tracking' ? markTrackingInterruption(current, permissionMessage(gpsError)) : current);
    }, { enableHighAccuracy: true, maximumAge: 3_000, timeout: 20_000 });
  }, [handlePoint, stopWatcher]);

  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === 'hidden' && tripRef.current?.phase === 'tracking') {
        setTrip((current) => markTrackingInterruption(current, 'Safari was backgrounded or the screen was locked; missing distance was not estimated.'));
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); stopWatcher(); };
  }, [stopWatcher]);

  const provisionalBusiness = memberships.find((item) => item.business_id === 'hc-apparel')?.business_id || memberships[0]?.business_id;

  const ensureTacoma = async () => {
    const existing = vehicles.find((vehicle) => vehicle.model_year === 2024 && String(vehicle.make).toLowerCase() === 'toyota' && String(vehicle.model).toLowerCase().includes('tacoma'));
    if (existing) { setVehicleId(existing.id); return; }
    setSettingUpVehicle(true);
    setError('');
    const { data, error: vehicleError } = await supabase.from('ops_vehicles').upsert({ id: TACOMA_ID, business_id: null, nickname: '2024 Toyota Tacoma 4×4', make: 'Toyota', model: 'Tacoma 4×4', model_year: 2024, active: true }, { onConflict: 'id' }).select('*').single();
    setSettingUpVehicle(false);
    if (vehicleError) { setError(vehicleError.message || 'The Tacoma could not be configured.'); return; }
    setVehicleId(data.id);
    setMessage('2024 Toyota Tacoma 4×4 is ready. Trips are classified after driving; it is not treated as business-only.');
    await onVehicleAdded();
  };

  const syncStart = async (active) => {
    if (!navigator.onLine) return { ...active, syncState: 'offline' };
    const { error: startError } = await supabase.rpc('mobile_start_drive', { trip_id: active.id, target_business: active.businessId, target_vehicle: active.vehicleId, start_time: active.startedAt, start_label: active.origin || null, start_lat: active.startLatitude, start_lng: active.startLongitude, odometer: active.startOdometer, client_time: active.startedAt });
    return { ...active, syncState: startError ? 'pending' : 'synced', syncError: startError?.message || '' };
  };

  const startTrip = async () => {
    if (busy || trip) return;
    if (!vehicleId) { setError('Select the vehicle before starting.'); return; }
    setBusy(true); setError(''); setMessage('Requesting precise location…');
    try {
      const position = await getCurrentPosition();
      const first = locationPoint(position);
      let active = appendTrackedPoint({ id: globalThis.crypto.randomUUID(), phase: 'tracking', vehicleId, businessId: provisionalBusiness, startedAt: new Date().toISOString(), startOdometer: startOdometer === '' ? null : Number(startOdometer), origin: `GPS ${first.latitude.toFixed(5)}, ${first.longitude.toFixed(5)}`, startLatitude: first.latitude, startLongitude: first.longitude, gpsDistanceMiles: 0, trackingGapCount: 0, trackingGapNotes: [], points: [], syncState: 'pending', isTest: testMode }, first);
      active = await syncStart(active);
      setTrip(active);
      startWatcher();
      setMessage(testMode ? 'TEST TRACKING ACTIVE — excluded from summaries and CSV.' : 'Trip tracking started. Keep this page open for Safari foreground tracking.');
    } catch (startError) {
      setError(permissionMessage(startError));
    } finally { setBusy(false); }
  };

  const resumeTrip = () => {
    if (trip?.phase !== 'tracking') return;
    setTrip((current) => markTrackingInterruption(current, 'Tracking resumed after app/page interruption; missing distance was not estimated.'));
    startWatcher();
    setMessage('Foreground tracking resumed. Review the interruption warning after the trip.');
  };

  const endTrip = () => {
    if (busy || trip?.phase !== 'tracking') return;
    stopWatcher();
    const ended = { ...trip, phase: 'review', endedAt: new Date().toISOString(), endLatitude: trip.lastPoint?.latitude ?? null, endLongitude: trip.lastPoint?.longitude ?? null };
    setTrip(ended);
    setReview((current) => ({ ...current, origin: trip.origin || '', destination: trip.lastPoint ? `GPS ${trip.lastPoint.latitude.toFixed(5)}, ${trip.lastPoint.longitude.toFixed(5)}` : '', endOdometer: '' }));
    setMessage('Trip ended locally. Review and save it below.');
  };

  const uploadPoints = async (active) => {
    if (!active.points?.length) return;
    const rows = active.points.map((point) => ({ id: point.id, trip_id: active.id, client_point_id: point.id, recorded_at: point.recordedAt, latitude: point.latitude, longitude: point.longitude, accuracy_meters: point.accuracy, altitude_meters: point.altitude, speed_mps: point.speed, heading_degrees: point.heading, is_mocked: false }));
    const { error: pointError } = await supabase.from('ops_mileage_points').upsert(rows, { onConflict: 'trip_id,client_point_id', ignoreDuplicates: true });
    if (pointError) throw pointError;
  };

  const saveReview = async () => {
    if (busy || trip?.phase !== 'review') return;
    if (review.classification === 'business' && (!review.businessId || !review.purpose.trim())) { setError('Business trips require an entity and a specific business purpose.'); return; }
    if (!navigator.onLine) { setError('You are offline. This completed trip remains on this device; reconnect and retry save.'); return; }
    setBusy(true); setError(''); setMessage('Saving the completed trip…');
    try {
      const started = await syncStart(trip);
      if (started.syncState !== 'synced') throw new Error(started.syncError || 'The trip start could not sync.');
      await uploadPoints(trip);
      const odometerMiles = trip.startOdometer != null && review.endOdometer !== '' ? Number(review.endOdometer) - Number(trip.startOdometer) : null;
      if (review.measurementSource === 'odometer' && (!(odometerMiles > 0))) throw new Error('Ending odometer must be greater than the starting odometer.');
      if (review.measurementSource === 'manual' && !(Number(review.manualMiles) > 0)) throw new Error('Enter the corrected manual miles.');
      const { data, error: endError } = await supabase.rpc('mobile_end_drive', { trip_id: trip.id, end_time: trip.endedAt, end_label: review.destination || null, end_lat: trip.endLatitude, end_lng: trip.endLongitude, gps_miles: Number(trip.gpsDistanceMiles || 0), ending_odometer: review.endOdometer === '' ? null : Number(review.endOdometer), manual_miles: review.manualMiles === '' ? null : Number(review.manualMiles), selected_source: review.measurementSource, purpose: review.purpose || null, selected_classification: review.classification, gap_count: Number(trip.trackingGapCount || 0), gap_notes: (trip.trackingGapNotes || []).join('\n') || null, client_time: new Date().toISOString() });
      if (endError) throw endError;
      const notes = [trip.isTest ? MILEAGE_TEST_NOTE : '', data.notes || ''].filter(Boolean).join('\n') || null;
      const { data: reviewedTrip, error: reviewError } = await supabase
        .from('ops_mileage_trips')
        .update({ business_id: review.businessId || trip.businessId, start_location_label: review.origin || trip.origin, destination_label: review.destination || null, review_status: trip.trackingGapCount > 0 || review.classification === 'needs_review' ? 'flagged' : 'reviewed', notes, client_updated_at: new Date().toISOString() })
        .eq('id', trip.id)
        .eq('sync_revision', data.sync_revision)
        .select('id')
        .maybeSingle();
      if (reviewError) throw reviewError;
      if (!reviewedTrip) throw new Error('This trip changed on another device. Reload it before saving your review.');
      setTrip(null);
      setMessage(`Trip saved — ${Number(review.measurementSource === 'odometer' ? odometerMiles : review.measurementSource === 'manual' ? review.manualMiles : trip.gpsDistanceMiles).toFixed(1)} miles. Ref ${trip.id.slice(0, 8)}.`);
      setReview((current) => ({ ...current, classification: 'needs_review', purpose: '', origin: '', destination: '', endOdometer: '', measurementSource: 'gps', manualMiles: '' }));
      await onSaved();
    } catch (saveError) {
      setError(`${saveError.message || 'Save failed.'} The completed trip remains on this device; retry safely.`);
      setTrip((current) => ({ ...current, syncState: 'failed', syncError: saveError.message }));
    } finally { setBusy(false); }
  };

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
  const accuracy = trip?.latestAccuracy;
  const statusText = trip?.phase === 'tracking' ? 'Foreground tracking active' : trip?.phase === 'review' ? 'Ended — review required' : 'Ready';
  const canBackground = false;

  return (
    <section id="trip-tracker" className="mb-6 rounded-3xl border border-[#d5c7a8] bg-white p-5 shadow-xl shadow-[#234d38]/10 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b711b]">Actual trip tracking</p><h2 className="mt-1 text-2xl font-black">Start and end a trip</h2></div><span className={`rounded-full px-3 py-2 text-xs font-black ${trip?.phase === 'tracking' ? 'bg-green-100 text-green-900' : 'bg-[#f1ead9] text-[#5f624f]'}`}>{statusText}</span></div>
      <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><Smartphone className="shrink-0" size={22} /><p><strong>Safari is foreground-only.</strong> Keep this page open and the screen awake. Locking the iPhone or switching apps may interrupt GPS; the trip will be flagged and missing distance will not be invented. A signed native build is required for dependable background tracking.</p></div>
      {testMode && <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-black text-blue-900">TEST MODE — saved records are marked and excluded from on-page totals and CSV.</div>}
      {message && <div role="status" className="mt-4 flex gap-2 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-900"><CheckCircle2 size={18} className="shrink-0" />{message}</div>}
      {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900"><div className="flex gap-2"><AlertTriangle size={18} className="shrink-0" />{error}</div>{trip && <button type="button" onClick={trip.phase === 'review' ? saveReview : resumeTrip} className="mt-3 min-h-11 rounded-xl border border-red-300 bg-white px-4 font-black"><RefreshCw className="mr-2 inline" size={17} />Retry / recover</button>}</div>}

      {!trip && <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className={labelClass}>Vehicle<select className={fieldClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Select vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{[vehicle.nickname, vehicle.model_year, vehicle.make, vehicle.model].filter(Boolean).join(' · ')}</option>)}</select></label><label className={labelClass}>Starting odometer (optional)<input className={fieldClass} type="number" inputMode="decimal" min="0" step="0.1" value={startOdometer} onChange={(event) => setStartOdometer(event.target.value)} /></label></div>}
      {!trip && !selectedVehicle && <button type="button" disabled={settingUpVehicle} onClick={ensureTacoma} className="mt-4 flex min-h-12 items-center rounded-xl border border-[#b58a2a] bg-[#fff9e9] px-4 font-black text-[#5f4815]"><CarFront className="mr-2" size={19} />{settingUpVehicle ? 'Configuring Tacoma…' : 'Use my 2024 Toyota Tacoma 4×4'}</button>}

      {trip?.phase === 'tracking' && <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-[#f1eddf] p-4"><Clock3 size={19} /><p className="mt-2 text-xs font-bold">Elapsed</p><p className="text-xl font-black tabular-nums">{elapsed}</p></div><div className="rounded-2xl bg-[#e5eddf] p-4"><Navigation size={19} /><p className="mt-2 text-xs font-bold">Tracked</p><p className="text-xl font-black">{Number(trip.gpsDistanceMiles || 0).toFixed(2)} mi</p></div><div className="rounded-2xl bg-[#f1eddf] p-4"><LocateFixed size={19} /><p className="mt-2 text-xs font-bold">Accuracy</p><p className="text-xl font-black">{accuracy == null ? '—' : `${Math.round(accuracy)} m`}</p></div><div className={`rounded-2xl p-4 ${trip.trackingGapCount ? 'bg-amber-100' : 'bg-[#e5eddf]'}`}><PauseCircle size={19} /><p className="mt-2 text-xs font-bold">Interruptions</p><p className="text-xl font-black">{trip.trackingGapCount || 0}</p></div></div>}
      {trip?.trackingGapNotes?.length > 0 && <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><summary className="cursor-pointer font-black text-amber-950">GPS/interruption warnings ({trip.trackingGapNotes.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{trip.trackingGapNotes.map((note) => <li key={note}>{note}</li>)}</ul></details>}

      {!trip && <button type="button" disabled={busy} onClick={startTrip} className="mt-6 flex min-h-16 w-full items-center justify-center rounded-2xl bg-[#237143] px-5 text-lg font-black text-white shadow-lg disabled:opacity-60"><PlayCircle className="mr-2" />{busy ? 'Starting GPS…' : 'Start Trip'}</button>}
      {trip?.phase === 'tracking' && <button type="button" disabled={busy} onClick={endTrip} className="mt-6 flex min-h-16 w-full items-center justify-center rounded-2xl bg-[#a33b2f] px-5 text-lg font-black text-white shadow-lg"><PauseCircle className="mr-2" />End Trip</button>}

      {trip?.phase === 'review' && <div className="mt-6 rounded-2xl border border-[#d8ccb3] bg-[#faf7ef] p-4 sm:p-5"><h3 className="text-lg font-black">Review before saving</h3><p className="mt-1 text-sm text-[#64695f]">GPS tracked {Number(trip.gpsDistanceMiles || 0).toFixed(2)} miles. Choose the final category and mileage source.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className={labelClass}>Classification<select className={fieldClass} value={review.classification} onChange={(event) => setReview({ ...review, classification: event.target.value })}><option value="needs_review">Unclassified</option><option value="business">Business</option><option value="personal">Personal</option><option value="commuting">Commuting</option></select></label>{review.classification === 'business' && <label className={labelClass}>Business / entity<select className={fieldClass} value={review.businessId} onChange={(event) => setReview({ ...review, businessId: event.target.value })}>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></label>}<label className={labelClass}>Origin<input className={fieldClass} value={review.origin} onChange={(event) => setReview({ ...review, origin: event.target.value })} /></label><label className={labelClass}>Destination<input className={fieldClass} value={review.destination} onChange={(event) => setReview({ ...review, destination: event.target.value })} /></label></div><label className={`${labelClass} mt-4`}>{review.classification === 'business' ? 'Specific business purpose' : 'Trip notes (optional)'}<textarea className={`${fieldClass} min-h-20`} value={review.purpose} onChange={(event) => setReview({ ...review, purpose: event.target.value })} /></label><div className="mt-4 grid gap-4 sm:grid-cols-3"><label className={labelClass}>Mileage source<select className={fieldClass} value={review.measurementSource} onChange={(event) => setReview({ ...review, measurementSource: event.target.value })}><option value="gps">GPS tracked</option><option value="odometer">Odometer correction</option><option value="manual">Manual correction</option></select></label>{review.measurementSource === 'odometer' && <label className={labelClass}>Ending odometer<input className={fieldClass} type="number" inputMode="decimal" step="0.1" value={review.endOdometer} onChange={(event) => setReview({ ...review, endOdometer: event.target.value })} /></label>}{review.measurementSource === 'manual' && <label className={labelClass}>Corrected miles<input className={fieldClass} type="number" inputMode="decimal" step="0.1" value={review.manualMiles} onChange={(event) => setReview({ ...review, manualMiles: event.target.value })} /></label>}</div><button type="button" disabled={busy} onClick={saveReview} className="mt-5 flex min-h-14 w-full items-center justify-center rounded-xl bg-[#234d38] px-5 font-black text-white"><Save className="mr-2" size={20} />{busy ? 'Saving trip…' : 'Save reviewed trip'}</button></div>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e1d7c2] pt-4 text-sm"><a href="#manual-entry" className="min-h-11 py-3 font-black text-[#6b5118] underline">Use manual entry instead</a><span className="flex items-center gap-2 text-[#647062]"><ShieldCheck size={17} />Location records require authorized sign-in.</span></div>
      {!canBackground && <p className="sr-only">Background tracking is not available in this web version.</p>}
    </section>
  );
}
