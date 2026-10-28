import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BriefcaseBusiness,
  CarFront,
  CheckCircle2,
  CircleUserRound,
  Edit3,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Save,
  TriangleAlert,
} from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import MileageTracker from '@/components/heart-command/MileageTracker';
import MileageTaxRecords from '@/components/heart-command/MileageTaxRecords';
import {
  buildMileageInsert,
  buildMileageUpdate,
  calculateMileage,
  mileageDraftStorageKey,
  newMileageDraft,
  tripToMileageDraft,
  validateMileageDraft,
} from '@/lib/heartCommandMileage';

const fieldClass = 'mt-2 min-h-12 w-full rounded-xl border border-[#cfc5aa] bg-white px-4 py-3 text-base text-[#183d2c] shadow-sm outline-none transition focus:border-[#b58a2a] focus:ring-4 focus:ring-[#d7aa43]/20';
const labelClass = 'block text-sm font-bold text-[#183d2c]';

function displayVehicle(vehicle) {
  return [vehicle.nickname, vehicle.model_year, vehicle.make, vehicle.model].filter(Boolean).join(' · ');
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(value));
}

function locationMessage(error) {
  if (error?.code === 1) return 'Location permission was denied. Type the location manually instead.';
  if (error?.code === 2) return 'Your location is unavailable. Type the location manually instead.';
  if (error?.code === 3) return 'Location took too long. Type it manually or try again.';
  return 'Location could not be read. Manual entry is still available.';
}

export function HeartCommandSignIn() {
  const { checkAppState } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError) {
      setSaving(false);
      setError('Sign-in failed. Check your email and password, or use password recovery.');
      return;
    }
    await checkAppState();
    setSaving(false);
  };

  const openPasswordHelp = () => {
    window.sessionStorage.setItem('hc_login_return_to', window.location.href);
    window.location.assign('/Login');
  };

  return (
    <main className="min-h-screen bg-[#f8f3e8] px-4 py-10 text-[#183d2c]">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#234d38] text-[#f5d77c]"><BriefcaseBusiness /></div>
          <div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#9b711b]">Heart Command Center</p><h1 className="text-2xl font-black">Secure sign in</h1></div>
        </div>
        <form onSubmit={submit} className="rounded-3xl border border-[#ddd2b8] bg-white p-6 shadow-xl shadow-[#234d38]/10">
          <h2 className="text-xl font-black">Open Mileage</h2>
          <p className="mt-2 text-sm text-[#5f685f]">Use your individual Heart Command account. Your current page will open after sign-in.</p>
          {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}
          <label className={`${labelClass} mt-5`}>Email<input className={fieldClass} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className={`${labelClass} mt-4`}>Password<input className={fieldClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#234d38] px-4 font-extrabold text-white disabled:opacity-60" disabled={saving}>
            {saving ? <Loader2 className="mr-2 animate-spin" size={18} /> : <ArrowRight className="mr-2" size={18} />} Open Mileage
          </button>
          <button type="button" onClick={openPasswordHelp} className="mt-4 block min-h-11 w-full py-3 text-center text-sm font-bold text-[#6d531c] underline">Password help</button>
        </form>
      </div>
    </main>
  );
}

export default function HeartCommandMileage() {
  const { user, logout } = useAuth();
  const [memberships, setMemberships] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState(() => newMileageDraft());
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [locationState, setLocationState] = useState({ field: '', message: '' });

  const storageKey = useMemo(() => mileageDraftStorageKey(user?.id), [user?.id]);
  const allowedBusinessIds = useMemo(() => memberships.map((item) => item.business_id), [memberships]);
  const availableVehicles = useMemo(
    () => vehicles.filter((vehicle) => !draft.businessId || !vehicle.business_id || vehicle.business_id === draft.businessId),
    [vehicles, draft.businessId],
  );

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError('');
    const membershipResult = await supabase
      .from('ops_business_memberships')
      .select('business_id,access_role,can_manage_mileage')
      .eq('user_id', user.id)
      .eq('can_manage_mileage', true);

    if (membershipResult.error) {
      setLoadError('Mileage access could not be verified. Try again or ask the owner to confirm your mileage permission.');
      setLoading(false);
      return;
    }

    const nextMemberships = membershipResult.data || [];
    const ids = nextMemberships.map((item) => item.business_id);
    setMemberships(nextMemberships);
    if (!ids.length) {
      setLoading(false);
      return;
    }

    const [businessResult, vehicleResult, tripResult] = await Promise.all([
      supabase.from('ops_businesses').select('id,name').in('id', ids).eq('active', true),
      supabase.from('ops_vehicles').select('id,business_id,nickname,make,model,model_year,active').eq('active', true).order('nickname'),
      supabase.from('ops_mileage_trips').select('id,driver_user_id,business_id,vehicle_id,started_at,ended_at,start_location_label,destination_label,start_latitude,start_longitude,end_latitude,end_longitude,business_purpose,classification,status,start_odometer,end_odometer,gps_distance_miles,odometer_distance_miles,manual_distance_miles,final_distance_miles,measurement_source,tracking_gap_count,tracking_gap_notes,review_status,notes,sync_revision,updated_at').order('started_at', { ascending: false }).limit(500),
    ]);

    const firstError = businessResult.error || vehicleResult.error || tripResult.error;
    if (firstError) {
      setLoadError('Mileage records could not be loaded. No information was changed.');
      setLoading(false);
      return;
    }

    setBusinesses(businessResult.data || []);
    setVehicles(vehicleResult.data || []);
    setTrips(tripResult.data || []);
    setDraft((current) => ({ ...current, businessId: current.businessId || ids.find((id) => id === 'hc-apparel') || ids[0] }));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setDraft((current) => ({ ...current, ...JSON.parse(saved) }));
    } catch {
      // A damaged device-only draft must not block server records.
    }
  }, [storageKey, user?.id]);

  useEffect(() => {
    if (!user?.id || success) return;
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey, success, user?.id]);

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSuccess('');
    setSaveError('');
  };

  const locate = (field) => {
    setLocationState({ field, message: '' });
    if (!navigator.geolocation) {
      setLocationState({ field: '', message: 'This browser does not provide location access. Type the location manually.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const label = `Current location (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`;
        setDraft((current) => ({
          ...current,
          [field]: current[field] || label,
          [field === 'origin' ? 'startLatitude' : 'endLatitude']: coords.latitude,
          [field === 'origin' ? 'startLongitude' : 'endLongitude']: coords.longitude,
        }));
        setLocationState({ field: '', message: 'Location captured. You can replace the label with a street address.' });
      },
      (error) => setLocationState({ field: '', message: locationMessage(error) }),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const resetForm = () => {
    const businessId = allowedBusinessIds.find((id) => id === 'hc-apparel') || allowedBusinessIds[0] || '';
    const next = newMileageDraft({ businessId });
    setDraft(next);
    setEditing(null);
    setSaveError('');
    setSuccess('');
    window.localStorage.removeItem(storageKey);
  };

  const save = async (event) => {
    event?.preventDefault?.();
    setSaveError('');
    setSuccess('');
    let mileage;
    try {
      mileage = validateMileageDraft(draft);
    } catch (error) {
      setSaveError(error.message);
      return;
    }
    setSaving(true);
    const nowIso = new Date().toISOString();
    let result;
    if (editing) {
      result = await supabase
        .from('ops_mileage_trips')
        .update(buildMileageUpdate({ draft, nowIso }))
        .eq('id', editing.id)
        .eq('sync_revision', editing.sync_revision)
        .select('*')
        .maybeSingle();
      if (!result.error && !result.data) result.error = new Error('This trip changed on another device. Refresh and review it before saving again.');
    } else {
      result = await supabase
        .from('ops_mileage_trips')
        .upsert(buildMileageInsert({ draft, userId: user.id, nowIso }), { onConflict: 'id' })
        .select('*')
        .single();
    }
    setSaving(false);

    if (result.error) {
      setSaveError(result.error.message || 'The trip did not save. Your entries are still here; retry when ready.');
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
      return;
    }

    window.localStorage.removeItem(storageKey);
    setSuccess(`${editing ? 'Trip updated' : 'Trip saved'} — ${mileage.miles.toFixed(1)} business miles.`);
    const businessId = draft.businessId;
    setDraft(newMileageDraft({ businessId }));
    setEditing(null);
    await load();
  };

  const editTrip = (trip) => {
    setEditing(trip);
    setDraft(tripToMileageDraft(trip, vehicles));
    setSaveError('');
    setSuccess('Editing the selected trip. Saving will update this record, not create another.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const previewMiles = (() => {
    try { return calculateMileage(draft).miles; } catch { return null; }
  })();

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f8f3e8] text-[#234d38]"><Loader2 className="animate-spin" size={34} aria-label="Loading Mileage" /></div>;

  if (loadError && !memberships.length) {
    return (
      <main className="min-h-screen bg-[#f8f3e8] px-4 py-12 text-[#183d2c]">
        <div className="mx-auto max-w-lg rounded-3xl border border-red-200 bg-white p-7 shadow-lg">
          <TriangleAlert className="text-red-700" size={32} />
          <h1 className="mt-4 text-2xl font-black">Mileage could not load</h1>
          <p className="mt-2 text-[#626861]">{loadError}</p>
          <button onClick={() => void load()} className="mt-6 flex min-h-12 items-center rounded-xl border border-[#234d38] px-5 font-bold"><RefreshCw className="mr-2" size={18} /> Retry</button>
        </div>
      </main>
    );
  }

  if (!memberships.length) {
    return (
      <main className="min-h-screen bg-[#f8f3e8] px-4 py-12 text-[#183d2c]">
        <div className="mx-auto max-w-lg rounded-3xl border border-[#decda7] bg-white p-7 shadow-lg">
          <TriangleAlert className="text-[#a76c00]" size={32} />
          <h1 className="mt-4 text-2xl font-black">Mileage access needs approval</h1>
          <p className="mt-2 text-[#626861]">You are signed in, but this account does not have mileage permission for a Heart Command business.</p>
          <button onClick={() => void logout()} className="mt-6 min-h-12 rounded-xl border border-[#234d38] px-5 font-bold">Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f3e8] pb-24 text-[#183d2c]">
      <header id="top" className="sticky top-0 z-30 border-b border-[#d6c7a7] bg-[#234d38] text-white shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#f5d77c] text-[#234d38]"><BriefcaseBusiness size={21} /></div><div><p className="text-[10px] font-black uppercase tracking-[0.19em] text-[#f5d77c]">Heart Command Center</p><h1 className="text-lg font-black">Mileage</h1></div></div>
          <button onClick={() => void logout()} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-3 text-sm font-bold"><LogOut size={17} /> <span className="hidden sm:inline">Sign out</span></button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {loadError && <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"><span>{loadError}</span><button onClick={() => void load()} className="min-h-10 whitespace-nowrap rounded-lg border border-red-300 px-3">Retry</button></div>}
        <section className="mb-5 rounded-3xl bg-[#183d2c] p-5 text-white shadow-lg sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f1c75b]">Mixed-use vehicle records</p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">Track a trip from your phone</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#e7eadf]">Start and end actual foreground GPS trips, then classify each drive as Business, Personal, Commuting, or Unclassified. Manual entry remains available when GPS cannot be used.</p>
        </section>

        <MileageTracker user={user} memberships={memberships} businesses={businesses} vehicles={vehicles} onSaved={load} onVehicleAdded={load} />

        <form id="manual-entry" onSubmit={save} className="rounded-3xl border border-[#ddd2b8] bg-white p-5 shadow-lg sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b711b]">{editing ? 'Update existing trip' : 'Manual fallback'}</p><h2 className="mt-1 text-xl font-black">{editing ? 'Edit trip' : 'Enter a trip manually'}</h2><p className="mt-1 text-sm text-[#686e65]">Use total miles or odometer readings when foreground GPS was unavailable.</p></div>
            {editing && <button type="button" onClick={resetForm} className="min-h-11 rounded-xl border border-[#c9bea4] px-4 text-sm font-bold">Cancel edit</button>}
          </div>

          {success && <div role="status" className="mt-5 flex gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 font-semibold text-green-900"><CheckCircle2 className="shrink-0" /> <span>{success}</span></div>}
          {saveError && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900"><div className="flex gap-3"><TriangleAlert className="shrink-0" /><div><p className="font-bold">Trip not saved</p><p className="mt-1 text-sm">{saveError}</p><p className="mt-2 text-sm font-semibold">Your entries remain on this device.</p></div></div><button type="button" onClick={() => void save()} className="mt-4 flex min-h-11 items-center rounded-xl border border-red-300 bg-white px-4 font-bold"><RefreshCw className="mr-2" size={17} /> Retry save</button></div>}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className={labelClass}>Trip date<input className={fieldClass} type="date" value={draft.tripDate} onChange={(event) => updateDraft('tripDate', event.target.value)} required /></label>
            <label className={labelClass}>Business<select className={fieldClass} value={draft.businessId} onChange={(event) => updateDraft('businessId', event.target.value)} required><option value="">Choose business</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></label>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="mileage-origin">Origin</label><div className="relative"><MapPin className="pointer-events-none absolute left-4 top-6 text-[#6e785d]" size={18} /><input id="mileage-origin" className={`${fieldClass} pl-11 pr-14`} value={draft.origin} onChange={(event) => updateDraft('origin', event.target.value)} placeholder="Street, city, or place" required /><button type="button" aria-label="Use current location for origin" onClick={() => locate('origin')} className="absolute right-1 top-3 grid min-h-11 min-w-11 place-items-center rounded-lg text-[#234d38]">{locationState.field === 'origin' ? <Loader2 className="animate-spin" size={19} /> : <LocateFixed size={19} />}</button></div></div>
            <div><label className={labelClass} htmlFor="mileage-destination">Destination</label><div className="relative"><Navigation className="pointer-events-none absolute left-4 top-6 text-[#6e785d]" size={18} /><input id="mileage-destination" className={`${fieldClass} pl-11 pr-14`} value={draft.destination} onChange={(event) => updateDraft('destination', event.target.value)} placeholder="Street, city, or place" required /><button type="button" aria-label="Use current location for destination" onClick={() => locate('destination')} className="absolute right-1 top-3 grid min-h-11 min-w-11 place-items-center rounded-lg text-[#234d38]">{locationState.field === 'destination' ? <Loader2 className="animate-spin" size={19} /> : <LocateFixed size={19} />}</button></div></div>
          </div>
          {locationState.message && <p role="status" className="mt-3 rounded-xl bg-[#f3eddf] p-3 text-sm font-semibold text-[#5d604e]">{locationState.message}</p>}

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className={labelClass}>Classification<select className={fieldClass} value={draft.classification} onChange={(event) => updateDraft('classification', event.target.value)}><option value="needs_review">Unclassified</option><option value="business">Business</option><option value="personal">Personal</option><option value="commuting">Commuting</option></select></label>
            <label className={labelClass}>{draft.classification === 'business' ? 'Specific business purpose' : 'Trip notes (optional)'}<textarea className={`${fieldClass} min-h-24`} value={draft.purpose} onChange={(event) => updateDraft('purpose', event.target.value)} placeholder={draft.classification === 'business' ? 'Customer meeting, supply pickup, delivery…' : 'Optional notes'} required={draft.classification === 'business'} /></label>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className={labelClass}>Vehicle<select className={fieldClass} value={draft.vehicleId} onChange={(event) => { updateDraft('vehicleId', event.target.value); if (event.target.value) updateDraft('vehicleName', ''); }}><option value="">Other / enter vehicle</option>{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{displayVehicle(vehicle)}</option>)}</select></label>
            {!draft.vehicleId && <label className={labelClass}>Vehicle name<input className={fieldClass} value={draft.vehicleName} onChange={(event) => updateDraft('vehicleName', event.target.value)} placeholder="Example: 2023 Honda CR-V" required /></label>}
          </div>

          <fieldset className="mt-6 rounded-2xl border border-[#ded4bd] bg-[#faf7ef] p-4 sm:p-5">
            <legend className="px-2 text-sm font-black text-[#183d2c]">Miles — use either method</legend>
            <label className={labelClass}>Total miles<input className={fieldClass} inputMode="decimal" type="number" min="0" step="0.1" value={draft.totalMiles} onChange={(event) => updateDraft('totalMiles', event.target.value)} placeholder="Example: 24.6" /></label>
            <div className="my-4 flex items-center gap-3 text-xs font-black uppercase tracking-wider text-[#77796d]"><span className="h-px flex-1 bg-[#d9d1be]" />or use odometer<span className="h-px flex-1 bg-[#d9d1be]" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Starting odometer<input className={fieldClass} inputMode="decimal" type="number" min="0" step="0.1" value={draft.startOdometer} onChange={(event) => updateDraft('startOdometer', event.target.value)} /></label>
              <label className={labelClass}>Ending odometer<input className={fieldClass} inputMode="decimal" type="number" min="0" step="0.1" value={draft.endOdometer} onChange={(event) => updateDraft('endOdometer', event.target.value)} /></label>
            </div>
            {previewMiles !== null && <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#e6eddd] p-3 text-sm font-black"><Route size={18} /> {previewMiles.toFixed(1)} recorded miles · {draft.classification === 'needs_review' ? 'Unclassified' : draft.classification}</div>}
          </fieldset>

          <button type="submit" disabled={saving} className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#234d38] px-5 text-base font-black text-white shadow-lg shadow-[#234d38]/20 disabled:opacity-60">
            {saving ? <Loader2 className="mr-2 animate-spin" size={20} /> : <Save className="mr-2" size={20} />} {saving ? 'Saving trip…' : editing ? 'Update this trip' : 'Save manual trip'}
          </button>
        </form>

        <section className="mt-6 rounded-3xl border border-[#ddd2b8] bg-white p-5 shadow-lg sm:p-7">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b711b]">Saved records</p><h2 className="mt-1 text-xl font-black">Recent mileage</h2></div><button onClick={() => void load()} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#c9bea4]" aria-label="Refresh saved trips"><RefreshCw size={18} /></button></div>
          {!trips.length ? <p className="mt-5 rounded-2xl bg-[#f5f0e4] p-5 text-sm text-[#64695f]">No saved mileage trips are available for this account.</p> : <div className="mt-5 space-y-3">{trips.map((trip) => {
            const vehicle = vehicles.find((item) => item.id === trip.vehicle_id);
            return <article key={trip.id} className="rounded-2xl border border-[#ded4bd] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{trip.start_location_label || 'Origin'} <span aria-hidden="true">→</span> {trip.destination_label || 'Destination'}</p><p className="mt-1 text-sm text-[#686e65]">{formatDate(trip.started_at)} · {Number(trip.final_distance_miles || 0).toFixed(1)} mi · {trip.classification === 'needs_review' ? 'Unclassified' : trip.classification}</p></div><button onClick={() => editTrip(trip)} className="flex min-h-11 items-center rounded-xl border border-[#c9bea4] px-3 text-sm font-bold"><Edit3 className="mr-2" size={16} /> Edit</button></div><p className="mt-3 text-sm"><span className="font-bold">Purpose:</span> {trip.business_purpose || 'Not provided'}</p><p className="mt-1 text-sm"><span className="font-bold">Vehicle:</span> {vehicle ? displayVehicle(vehicle) : String(trip.notes || '').match(/Manual vehicle: ([^\n]+)/)?.[1] || 'Not listed'}</p><p className="mt-1 text-sm"><span className="font-bold">Source:</span> {trip.measurement_source || 'Unknown'}{trip.tracking_gap_count ? ` · ${trip.tracking_gap_count} interruption(s)` : ''}</p><p className="mt-2 break-all text-xs text-[#7d8177]">Reference {trip.id}</p></article>;
          })}</div>}
        </section>

        <MileageTaxRecords user={user} trips={trips} vehicles={vehicles} businesses={businesses} />
      </main>

      <nav aria-label="Heart Command mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d4c8ad] bg-[#fffdf8]/95 px-3 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_25px_rgba(35,77,56,0.12)] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <a href="#top" className="flex min-h-14 flex-col items-center justify-center rounded-xl text-xs font-bold text-[#66705e]"><BriefcaseBusiness size={20} /><span>Home</span></a>
          <a href="/HeartCommand/Mileage" aria-current="page" className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-[#234d38] text-xs font-black text-white"><CarFront size={20} /><span>Mileage</span></a>
          <Link to="/Profile" className="flex min-h-14 flex-col items-center justify-center rounded-xl text-xs font-bold text-[#66705e]"><CircleUserRound size={20} /><span>Account</span></Link>
        </div>
      </nav>
    </div>
  );
}
