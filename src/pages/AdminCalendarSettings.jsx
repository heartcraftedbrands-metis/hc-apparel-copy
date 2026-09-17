import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { calendarAction } from '@/lib/productivityCalendar';

export default function AdminCalendarSettings() {
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [choice, setChoice] = useState('');
  const { data: status, error: statusError } = useQuery({ queryKey: ['calendar-status'], queryFn: () => calendarAction('status') });
  const { data: list, refetch: loadCalendars, error: calendarError } = useQuery({ queryKey: ['calendar-list'], queryFn: () => calendarAction('calendars'), enabled: Boolean(status?.connected), retry: false });
  const act = async (action, values) => {
    setBusy(true); setMessage('');
    try { const result = await calendarAction(action, values); await client.invalidateQueries({ queryKey: ['calendar-status'] }); if (action === 'disconnect') await client.invalidateQueries({ queryKey: ['calendar-list'] }); setMessage(action === 'select_calendar' ? `Selected ${result.selected.name}.` : 'Google Calendar disconnected.'); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const connect = async () => {
    setBusy(true); setMessage('');
    try { const result = await calendarAction('start'); window.location.assign(result.authorization_url); }
    catch (error) { setMessage(error.message); setBusy(false); }
  };
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10"><div><Link className="text-sm text-primary underline" to="/AdminDashboard">Admin Dashboard</Link><h1 className="mt-3 text-3xl font-bold">Calendar Settings</h1><p className="text-muted-foreground">Connect heartfamilyco@gmail.com. No calendars or events are created automatically.</p></div>
    <section className="space-y-4 rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">Google Calendar connection</h2>{statusError && <p role="alert">Could not load connection status. Check function deployment.</p>}{status && <><p>Status: <strong>{status.connected ? `Connected as ${status.connection.google_email}` : 'Not connected'}</strong></p><p>OAuth secrets: {status.google_configured ? 'Configured' : 'Setup required'} · OpenAI: {status.openai_configured ? 'Configured' : 'Not configured'}</p><p className="break-all text-xs text-muted-foreground">Google Cloud redirect URI: {status.redirect_uri}</p>{status.connection?.selected_calendar_name && <p>Selected calendar: <strong>{status.connection.selected_calendar_name}</strong></p>}{!status.connected ? <button className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50" disabled={busy || !status.google_configured} onClick={connect}>Connect Google Calendar</button> : <><button className="rounded-lg border px-4 py-2" disabled={busy} onClick={() => loadCalendars()}>Refresh calendars</button><div className="space-y-2"><label className="block text-sm font-medium" htmlFor="calendar-choice">Calendar with write access</label><select id="calendar-choice" className="w-full rounded-lg border p-2" value={choice} onChange={event => setChoice(event.target.value)}><option value="">Choose a calendar</option>{(list?.calendars || []).map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name} ({calendar.access_role})</option>)}</select>{calendarError && <p role="alert" className="text-sm text-red-700">Could not load calendars. Reconnect if authorization expired.</p>}<button className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50" disabled={busy || !choice} onClick={() => act('select_calendar', { calendar_id: choice })}>Use selected calendar</button></div><button className="text-sm text-red-700 underline" disabled={busy} onClick={() => { if (window.confirm('Disconnect Google Calendar? Saved tasks remain in HC Apparel.')) act('disconnect'); }}>Disconnect</button></>}</>}{message && <p role="status" className="text-sm">{message}</p>}{params.get('calendar') === 'connected' && <p role="status">Google account connected. Select a writable calendar before creating events.</p>}{params.get('calendar') === 'error' && <p role="alert">{params.get('reason') || 'Google connection failed.'}</p>}</section>
    <section className="rounded-xl border bg-[#f8f6ef] p-5 text-sm"><h2 className="font-semibold">Suggested calendars</h2><p>HC Apparel Operations, HC Apparel Orders, HC Apparel Production, and HC Apparel Follow-ups. Choose an existing calendar above; this setup will not create a new calendar.</p></section>
  </main>;
}
