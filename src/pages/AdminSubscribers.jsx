import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { marketingAdmin, csvCell } from '@/lib/marketingAdmin';
import { Button } from '@/components/ui/button';

export default function AdminSubscribers() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const refresh = () => marketingAdmin('subscribers').then(result => setRows(result.subscribers));
  useEffect(() => { refresh().catch(issue => setError(issue.message)); }, []);
  const act = async (action, row) => { if (action === 'mark_inactive' && !window.confirm(`Mark ${row.email} inactive locally?`)) return; setBusy(row.id); setError(''); try { const result = await marketingAdmin(action, { id: row.id }); await refresh(); setNotice(action === 'retry_sync' ? `Brevo sync: ${result.status}.` : 'Marked inactive locally. Brevo contact was not changed.'); } catch (issue) { setError(issue.message); } finally { setBusy(''); } };
  const exportCsv = () => {
    const columns = ['email','first_name','interests','source','consent_status','is_active','brevo_sync_status','brevo_contact_id','created_date'];
    const csv = [columns.join(','), ...rows.map(row => columns.map(key => csvCell(row[key])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'hc-apparel-subscribers.csv'; anchor.click(); URL.revokeObjectURL(url);
  };
  return <main className="min-h-screen bg-[#f6f3ea] p-4 md:p-8"><div className="mx-auto max-w-7xl space-y-5"><Link to="/AdminDashboard" className="text-sm text-primary underline">Admin Dashboard</Link><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold text-primary">Subscribers</h1><p className="text-sm text-muted-foreground">Consent-based HC Apparel signups and Brevo sync status.</p></div><Button variant="outline" onClick={exportCsv} disabled={!rows.length}>Export subscribers CSV</Button></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{notice}</p>}
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[950px] w-full text-left text-sm"><thead className="bg-stone-100"><tr>{['Email','Name','Interests','Source','Consent','Brevo sync','Brevo ID','Created','Actions'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.email}</td><td className="p-3">{row.first_name || '—'}</td><td className="p-3">{row.interests?.join(', ') || '—'}</td><td className="p-3">{row.source}</td><td className="p-3">{row.is_active ? row.consent_status : 'Inactive'}</td><td className="p-3">{row.brevo_sync_status}{row.brevo_last_error && <span className="block text-xs text-red-700">{row.brevo_last_error}</span>}</td><td className="p-3">{row.brevo_contact_id || '—'}</td><td className="p-3">{new Date(row.created_date).toLocaleDateString()}</td><td className="p-3"><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy === row.id || !row.is_active || row.consent_status !== 'consented'} onClick={() => act('retry_sync', row)}>Retry sync</Button><Button size="sm" variant="outline" disabled={busy === row.id || !row.is_active} onClick={() => act('mark_inactive', row)}>Mark inactive</Button></div></td></tr>)}</tbody></table>{!rows.length && <p className="p-6 text-center text-muted-foreground">No consented signups yet.</p>}</div></div></main>;
}
