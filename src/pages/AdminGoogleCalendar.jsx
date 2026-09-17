import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { calendarAction } from '@/lib/productivityCalendar';

const displayTime = event => {
  if (!event.start) return 'Time unavailable';
  if (event.all_day) return `${new Date(`${event.start}T00:00:00`).toLocaleDateString()} · All day`;
  return new Date(event.start).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export default function AdminGoogleCalendar() {
  const [calendarId, setCalendarId] = useState('__hc__');
  const [days, setDays] = useState(30);
  const { data: status, error: statusError } = useQuery({ queryKey: ['calendar-status'], queryFn: () => calendarAction('status'), retry: false });
  const { data: calendars, error: calendarsError } = useQuery({ queryKey: ['calendar-list'], queryFn: () => calendarAction('calendars'), enabled: Boolean(status?.connected), retry: false });
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ['google-calendar-events', calendarId, days],
    queryFn: () => calendarAction('calendar_events', { calendar_id: calendarId, window_days: days }),
    enabled: Boolean(status?.connected && calendars?.calendars?.length), retry: false,
  });
  const assignedIds = [status?.connection?.king_calendar_id, status?.connection?.yho_calendar_id, status?.connection?.shared_calendar_id].filter(Boolean);
  const connectedCalendars = calendars?.calendars || [];

  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
    <header>
      <Link className="text-sm text-primary underline" to="/AdminDashboard">Admin Dashboard</Link>
      <h1 className="mt-3 text-3xl font-bold">Google Calendar</h1>
      <p className="text-muted-foreground">Read-only view of connected calendars. Viewing events does not create, change, or email anything.</p>
    </header>

    <section className="space-y-4 rounded-2xl border bg-white p-5 sm:p-6">
      {statusError && <p role="alert" className="text-red-700">Could not check the Google connection: {statusError.message}</p>}
      {status && !status.connected && <p>Google Calendar is not connected. <Link className="text-primary underline" to="/AdminCalendarSettings">Open Calendar Settings</Link>.</p>}
      {status?.connected && <>
        <p className="text-sm">Connected as <strong>{status.connection.google_email}</strong></p>
        {calendarsError && <p role="alert" className="text-red-700">Could not list calendars: {calendarsError.message}</p>}
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 space-y-1 text-sm"><span className="font-semibold">Calendar</span>
            <select className="w-full rounded-lg border p-2" value={calendarId} onChange={event => setCalendarId(event.target.value)}>
              <option value="__hc__">All HC Apparel team calendars</option>
              {connectedCalendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}{assignedIds.includes(calendar.id) ? ' · HC Apparel' : ''}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span className="font-semibold">Look ahead</span>
            <select className="w-full rounded-lg border p-2" value={days} onChange={event => setDays(Number(event.target.value))}>
              <option value={30}>30 days</option><option value={90}>90 days</option>
            </select>
          </label>
          <button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" disabled={isFetching || !status?.connected} onClick={() => refetch()}>Refresh events</button>
        </div>
        <p className="text-xs text-muted-foreground">Includes the past 7 days and the selected upcoming period. Event details remain in Google Calendar.</p>
      </>}
    </section>

    {status?.connected && <section className="rounded-2xl border bg-white p-5 sm:p-6">
      <h2 className="text-xl font-bold">Calendar events</h2>
      {isFetching && <p className="mt-3 text-sm">Loading Google Calendar events…</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">Could not load events: {error.message}</p>}
      {!isFetching && !error && data?.events?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No events in this period for the selected calendar.</p>}
      {!isFetching && !error && data?.events?.length > 0 && <ul className="mt-4 divide-y">
        {data.events.map(event => <li className="py-3" key={`${event.calendar_id}:${event.id}`}>
          <p className="font-semibold">{event.url ? <a className="text-primary underline" href={event.url} target="_blank" rel="noopener noreferrer">{event.title}</a> : event.title}</p>
          <p className="text-sm text-muted-foreground">{displayTime(event)} · {event.calendar_name}</p>
        </li>)}
      </ul>}
      {data?.has_more && <p className="mt-4 text-sm text-amber-800">This view shows the first 250 events per calendar for this period. Open Google Calendar for more.</p>}
    </section>}
  </main>;
}
