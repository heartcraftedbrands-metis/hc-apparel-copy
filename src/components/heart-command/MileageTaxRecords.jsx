import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Download, Gauge, Save } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { mileageCsv, mileageSummary } from '@/lib/mileageTracking';

const fieldClass = 'mt-2 min-h-12 w-full rounded-xl border border-[#cfc5aa] bg-white px-4 py-3 text-base text-[#183d2c] shadow-sm outline-none focus:border-[#b58a2a] focus:ring-4 focus:ring-[#d7aa43]/20';
const labelClass = 'block text-sm font-bold text-[#183d2c]';

export default function MileageTaxRecords({ user, trips, vehicles, businesses }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [readings, setReadings] = useState([]);
  const [beginning, setBeginning] = useState('');
  const [ending, setEnding] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (!vehicleId && vehicles[0]) setVehicleId(vehicles[0].id); }, [vehicleId, vehicles]);
  useEffect(() => {
    let active = true;
    supabase.from('ops_vehicle_year_odometer').select('*').then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError('Annual odometer readings could not be loaded.');
      else setReadings(data || []);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const row = readings.find((item) => item.vehicle_id === vehicleId && Number(item.tax_year) === Number(year));
    setBeginning(row?.beginning_odometer ?? '');
    setEnding(row?.ending_odometer ?? '');
  }, [readings, vehicleId, year]);

  const summary = useMemo(() => mileageSummary(trips, { year, vehicleId }), [trips, vehicleId, year]);
  const annualMiles = beginning !== '' && ending !== '' && Number(ending) >= Number(beginning) ? Number(ending) - Number(beginning) : null;
  const gap = annualMiles == null ? null : annualMiles - summary.recordedMiles;

  const saveOdometer = async () => {
    if (!vehicleId) { setError('Select a vehicle.'); return; }
    if (beginning !== '' && ending !== '' && Number(ending) < Number(beginning)) { setError('Ending odometer cannot be less than beginning odometer.'); return; }
    setSaving(true); setError(''); setMessage('');
    const { data, error: saveError } = await supabase.from('ops_vehicle_year_odometer').upsert({ vehicle_id: vehicleId, tax_year: Number(year), beginning_odometer: beginning === '' ? null : Number(beginning), ending_odometer: ending === '' ? null : Number(ending), recorded_by: user.id, recorded_at: new Date().toISOString(), notes: 'Annual vehicle mileage reference; not a deduction calculation.' }, { onConflict: 'vehicle_id,tax_year' }).select('*').single();
    setSaving(false);
    if (saveError) { setError(saveError.message || 'Odometer readings were not saved.'); return; }
    setReadings((current) => [...current.filter((item) => !(item.vehicle_id === data.vehicle_id && Number(item.tax_year) === Number(data.tax_year))), data]);
    setMessage('Annual odometer readings saved.');
  };

  const exportCsv = () => {
    const content = mileageCsv(trips.filter((trip) => String(trip.started_at || '').slice(0, 4) === String(year)), vehicles, businesses);
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `Heart-Command-Mileage-${year}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const categoryCards = [['Business', summary.categories.business], ['Personal', summary.categories.personal], ['Commuting', summary.categories.commuting], ['Unclassified', summary.categories.unclassified]];

  return (
    <section className="mt-6 rounded-3xl border border-[#ddd2b8] bg-white p-5 shadow-lg sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b711b]">Tax preparation records</p><h2 className="mt-1 text-xl font-black">Annual mileage organization</h2></div><button type="button" onClick={exportCsv} className="flex min-h-11 items-center rounded-xl border border-[#9b711b] px-4 text-sm font-black"><Download className="mr-2" size={17} />Export CSV</button></div>
      <p className="mt-3 text-sm text-[#626861]">This log organizes records only. It does not calculate or claim a tax deduction, and commuting miles remain separate from business miles.</p>
      {message && <div className="mt-4 flex gap-2 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-900"><CheckCircle2 size={18} />{message}</div>}
      {error && <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-900"><AlertTriangle size={18} />{error}</div>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className={labelClass}>Tax year<select className={fieldClass} value={year} onChange={(event) => setYear(Number(event.target.value))}>{[currentYear, currentYear - 1, currentYear - 2].map((item) => <option key={item}>{item}</option>)}</select></label><label className={labelClass}>Vehicle<select className={fieldClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Select vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.nickname}</option>)}</select></label></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className={labelClass}>Beginning odometer<input className={fieldClass} type="number" inputMode="decimal" step="0.1" min="0" value={beginning} onChange={(event) => setBeginning(event.target.value)} /></label><label className={labelClass}>Ending odometer<input className={fieldClass} type="number" inputMode="decimal" step="0.1" min="0" value={ending} onChange={(event) => setEnding(event.target.value)} /></label></div>
      <button type="button" disabled={saving} onClick={saveOdometer} className="mt-4 flex min-h-12 items-center rounded-xl bg-[#234d38] px-5 font-black text-white"><Save className="mr-2" size={18} />{saving ? 'Saving…' : 'Save annual readings'}</button>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{categoryCards.map(([label, miles]) => <div key={label} className="rounded-2xl bg-[#f3eee2] p-4"><BarChart3 size={18} /><p className="mt-2 text-xs font-bold">{label}</p><p className="text-xl font-black">{Number(miles).toFixed(1)} mi</p></div>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-[#d9ceb7] p-4"><Gauge size={18} /><p className="mt-2 text-sm font-bold">Annual odometer miles</p><p className="text-xl font-black">{annualMiles == null ? 'Not available' : `${annualMiles.toFixed(1)} mi`}</p></div><div className="rounded-2xl border border-[#d9ceb7] p-4"><p className="text-sm font-bold">Recorded trip miles</p><p className="text-xl font-black">{summary.recordedMiles.toFixed(1)} mi</p><p className="mt-1 text-xs text-[#666]">GPS, odometer, and manual sources remain distinct in the CSV.</p></div><div className={`rounded-2xl border p-4 ${gap != null && Math.abs(gap) > 0.1 ? 'border-amber-300 bg-amber-50' : 'border-[#d9ceb7]'}`}><p className="text-sm font-bold">Unexplained odometer gap</p><p className="text-xl font-black">{gap == null ? 'Not available' : `${gap.toFixed(1)} mi`}</p><p className="mt-1 text-xs text-[#666]">Never assigned to business automatically.</p></div></div>
      {(summary.incompleteCount > 0 || summary.missingPurposeCount > 0) && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Needs attention:</strong> {summary.incompleteCount} incomplete/interrupted trip(s); {summary.missingPurposeCount} business trip(s) missing a purpose.</div>}
    </section>
  );
}
