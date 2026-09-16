import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { marketingAdmin } from '@/lib/marketingAdmin';
import { Button } from '@/components/ui/button';

export default function AdminEmailMarketingSettings() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { Promise.all([marketingAdmin('status'), marketingAdmin('settings')]).then(([a, b]) => { setStatus(a); setSettings(b); }).catch(issue => setError(issue.message)); }, []);
  const save = async () => { setBusy(true); setError(''); try { await marketingAdmin('update_settings', settings); setNotice('Email marketing settings saved. No campaign was sent.'); } catch (issue) { setError(issue.message); } finally { setBusy(false); } };
  return <main className="min-h-screen bg-[#f6f3ea] p-4 md:p-8"><div className="mx-auto max-w-4xl space-y-5"><Link to="/AdminDashboard" className="text-sm text-primary underline">Admin Dashboard</Link><h1 className="text-3xl font-bold text-primary">Email Marketing Settings</h1><p className="text-sm text-muted-foreground">Brevo subscriber sync only. Campaigns remain manual.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{notice}</p>}
    <div className="grid gap-4 sm:grid-cols-2">{[['Provider','Brevo'], ['Brevo API key configured',status?.api_key_configured ? 'Yes' : 'No'], ['Brevo list ID configured',status?.list_id_configured ? 'Yes' : 'No'], ['Last subscriber sync result',status?.last_sync?.brevo_sync_status || 'None'], ['Last error',status?.last_sync?.brevo_last_error || 'None']].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}</div>
    {settings && <div className="rounded-xl border bg-white p-5"><label className="flex items-center gap-2"><input type="checkbox" checked={settings.double_opt_in} onChange={event => setSettings(current => ({ ...current, double_opt_in: event.target.checked }))} />Double opt-in: {settings.double_opt_in ? 'On' : 'Off'}</label><p className="mt-2 text-xs text-amber-800">When on, new signups are held locally pending confirmation; Brevo sync is paused. Confirmation emails are not sent automatically.</p><Button className="mt-4" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button></div>}
    <div className="flex gap-4 text-sm"><Link className="text-primary underline" to="/AdminSubscribers">Subscribers &amp; export CSV</Link><Link className="text-primary underline" to="/AdminMarketingAnalytics">Marketing Analytics</Link></div>
  </div></main>;
}
