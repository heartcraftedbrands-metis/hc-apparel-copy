import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { calendarAction } from '@/lib/productivityCalendar';

const names = { king: 'HC Apparel — King Terik', yho: 'HC Apparel — YHO Operations', shared: 'HC Apparel Operations' };

export default function AdminCalendarSettings() {
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [choices, setChoices] = useState({ king: '', yho: '', shared: '' });
  const { data: status, error: statusError } = useQuery({ queryKey: ['calendar-status'], queryFn: () => calendarAction('status'), retry: false });
  const { data: list, refetch: loadCalendars, error: calendarError } = useQuery({ queryKey: ['calendar-list'], queryFn: () => calendarAction('calendars'), enabled: Boolean(status?.connected), retry: false });
  const writable = (list?.calendars || []).filter(calendar => ['owner', 'writer'].includes(calendar.access_role));

  useEffect(() => {
    if (!list?.calendars) return;
    setChoices(current => {
      if (current.king || current.yho || current.shared) return current;
      const choose = (target, optional = false) => {
        const saved = status?.connection?.[`${target}_calendar_id`];
        if (saved && writable.some(calendar => calendar.id === saved)) return saved;
        const existing = writable.find(calendar => calendar.name === names[target]);
        return existing?.id || (optional ? '' : '__create__');
      };
      return { king: choose('king'), yho: choose('yho'), shared: choose('shared', true) };
    });
  }, [list, status, writable]);

  const connect = async () => {
    setBusy(true); setMessage('');
    try { const result = await calendarAction('start'); window.location.assign(result.authorization_url); }
    catch (error) { setMessage(error.message); setBusy(false); }
  };
  const configure = async () => {
    if (!choices.king || !choices.yho) { setMessage('Choose or create both team calendars.'); return; }
    const creating = Object.values(choices).includes('__create__');
    if (!window.confirm(creating ? 'Create these Google calendars under heartfamilyco@gmail.com?' : 'Save these team calendar assignments under heartfamilyco@gmail.com?')) return;
    setBusy(true); setMessage('');
    try {
      const result = await calendarAction('configure_team_calendars', { king_calendar_id: choices.king, yho_calendar_id: choices.yho, shared_calendar_id: choices.shared, confirmed: true });
      await Promise.all([client.invalidateQueries({ queryKey: ['calendar-status'] }), client.invalidateQueries({ queryKey: ['calendar-list'] })]);
      setChoices({ king: result.selected.king.id, yho: result.selected.yho.id, shared: result.selected.shared?.id || '' });
      setMessage('Team calendars saved. No calendar event or email was created.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Calendar? Saved tasks remain in HC Apparel.')) return;
    setBusy(true); setMessage('');
    try {
      await calendarAction('disconnect');
      setChoices({ king: '', yho: '', shared: '' });
      await Promise.all([client.invalidateQueries({ queryKey: ['calendar-status'] }), client.invalidateQueries({ queryKey: ['calendar-list'] })]);
      setMessage('Google Calendar disconnected.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const selector = (target, optional = false) => <label className="block space-y-1 text-sm" key={target}>
    <span className="font-semibold">{names[target]}{optional ? ' (optional shared fallback)' : ' (required)'}</span>
    <select className="w-full rounded-lg border p-2" value={choices[target]} onChange={event => setChoices(value => ({ ...value, [target]: event.target.value }))}>
      <option value="">{optional ? 'No shared calendar' : 'Choose a calendar'}</option>
      <option value="__create__">Create {names[target]}</option>
      {writable.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name} ({calendar.access_role})</option>)}
    </select>
  </label>;

  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
    <div><Link className="text-sm text-primary underline" to="/AdminDashboard">Admin Dashboard</Link><h1 className="mt-3 text-3xl font-bold">Calendar Settings</h1><p className="text-muted-foreground">Connect heartfamilyco@gmail.com. Calendar creation requires your confirmation; no events or emails are automatic.</p></div>
    <section className="space-y-4 rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">Google Calendar connection</h2>
      {statusError && <p role="alert" className="text-red-700">Could not load connection status: {statusError.message}</p>}
      {status && <>
        <p>Status: <strong>{status.connected ? `Connected as ${status.connection.google_email}` : 'Not connected'}</strong></p>
        <p>OAuth secrets: {status.google_configured ? 'Configured' : 'Setup required'} · OpenAI: {status.openai_configured ? 'Configured' : 'Not configured'}</p>
        <p className="break-all text-xs text-muted-foreground">Google Cloud redirect URI: {status.redirect_uri}</p>
        {!status.connected ? <button className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50" disabled={busy || !status.google_configured} onClick={connect}>Connect Google Calendar</button> : <>
          <p className="text-sm text-muted-foreground">Only calendars with writer or owner access can be assigned. YHO does not need a separate Google login.</p>
          <div className="flex flex-wrap gap-2"><button className="rounded-lg border px-4 py-2" disabled={busy} onClick={() => loadCalendars()}>Refresh calendars</button><button className="rounded-lg border px-4 py-2" disabled={busy || !status.google_configured} onClick={connect}>Reconnect Google Calendar</button></div>
          {calendarError && <p role="alert" className="text-sm text-red-700">{calendarError.message}</p>}
          <p className="text-sm">{list?.calendars?.length ?? 0} Google calendar(s) found.</p>
          <div className="space-y-4">{selector('king')}{selector('yho')}{selector('shared', true)}</div>
          <button className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50" disabled={busy || !list || !choices.king || !choices.yho || (choices.king === choices.yho && choices.king !== '__create__')} onClick={configure}>Save team calendars</button>
          <div className="rounded-lg bg-[#f8f6ef] p-3 text-sm"><p>King Terik: {status.connection.king_calendar_name || 'Not assigned'}</p><p>YHO / Mario: {status.connection.yho_calendar_name || 'Not assigned'}</p><p>Shared fallback: {status.connection.shared_calendar_name || 'None'}</p></div>
          <button className="text-sm text-red-700 underline" disabled={busy} onClick={disconnect}>Disconnect</button>
        </>}
      </>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {params.get('calendar') === 'connected' && <p role="status">Google account connected. Review and save each team calendar assignment.</p>}
      {params.get('calendar') === 'error' && <p role="alert">{params.get('reason') || 'Google connection failed.'}</p>}
    </section>
  </main>;
}
