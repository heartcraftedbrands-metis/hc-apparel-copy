import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { adminRows, calendarAction } from '@/lib/productivityCalendar';

const dateInput = value => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const displayDate = value => value ? new Date(value).toLocaleString() : 'Unscheduled';
const calendarFor = (connection, target) => {
  if (!connection) return null;
  const key = ['king', 'yho', 'shared'].includes(target) ? target : 'yho';
  return { id: connection[`${key}_calendar_id`], name: connection[`${key}_calendar_name`] };
};

export default function AdminProductivityDashboard() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [reviewed, setReviewed] = useState({});
  const [fields, setFields] = useState({});
  const { data: team = [] } = useQuery({ queryKey: ['productivity-team'], queryFn: () => adminRows('team_members', 'created_at', 20) });
  const { data: status, error: statusError } = useQuery({ queryKey: ['calendar-status'], queryFn: () => calendarAction('status'), retry: false });
  const { data: tasks = [], error: tasksError } = useQuery({ queryKey: ['productivity-tasks'], queryFn: () => adminRows('productivity_tasks') });
  const { data: suggestions = [], error: suggestionsError } = useQuery({ queryKey: ['calendar-suggestions'], queryFn: () => adminRows('calendar_event_suggestions') });
  const { data: events = [] } = useQuery({ queryKey: ['calendar-events'], queryFn: () => adminRows('created_calendar_events', 'created_at', 10) });
  const { data: vendorDrafts = [] } = useQuery({ queryKey: ['productivity-vendor-drafts'], queryFn: () => adminRows('vendor_order_drafts', 'created_date', 100) });
  const { data: quotes = [] } = useQuery({ queryKey: ['productivity-quotes'], queryFn: () => adminRows('quote_requests', 'created_date', 100) });
  const { data: orders = [] } = useQuery({ queryKey: ['productivity-orders'], queryFn: () => adminRows('orders', 'created_date', 100) });
  const today = new Date().toDateString();
  const activeTasks = tasks.filter(task => !['completed', 'dismissed'].includes(task.status));
  const todayTasks = activeTasks.filter(task => task.due_date && new Date(task.due_date).toDateString() === today);
  const upcoming = activeTasks.filter(task => task.due_date && new Date(task.due_date).getTime() > Date.now()).slice(0, 10);
  const draftsPending = vendorDrafts.filter(row => !row.is_sample && ['draft', 'ready_to_order'].includes(row.vendor_status));
  const quotesPending = quotes.filter(row => !row.is_sample && ['new', 'reviewing', 'waiting_on_customer'].includes(row.status));
  const orderReviews = orders.filter(row => !row.is_sample && row.payment_status === 'paid' && !['completed', 'canceled', 'refunded'].includes(row.status));
  const staffNames = useMemo(() => new Map(team.map(person => [person.id, person.name])), [team]);

  const action = async (operation) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); await Promise.all(['calendar-suggestions', 'productivity-tasks', 'calendar-events'].map(queryKey => client.invalidateQueries({ queryKey: [queryKey] }))); }
    catch (issue) { setError(issue.message || 'Could not save this action.'); }
    finally { setBusy(false); }
  };
  const update = (id, changes) => action(async () => {
    const { error: saveError } = await supabase.from('calendar_event_suggestions').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id);
    if (saveError) throw saveError;
    setMessage('Suggestion updated inside HC Apparel. No Google event was created.');
  });
  const edit = suggestion => { setEditing(suggestion.id); setFields({ title: suggestion.title, description: suggestion.description, priority: suggestion.priority, assigned_to: suggestion.assigned_to || '', calendar_target: suggestion.calendar_target || 'yho', scheduled_start: dateInput(suggestion.scheduled_start), scheduled_end: dateInput(suggestion.scheduled_end) }); setError(''); };
  const saveEdit = suggestion => action(async () => {
    if (!fields.title?.trim() || !fields.scheduled_start || !fields.scheduled_end || new Date(fields.scheduled_end) <= new Date(fields.scheduled_start)) throw new Error('Enter a title and a valid start/end time.');
    const { error: saveError } = await supabase.from('calendar_event_suggestions').update({ title: fields.title.trim().slice(0, 140), description: (fields.description || '').trim().slice(0, 1000), priority: fields.priority, assigned_to: fields.assigned_to || null, calendar_target: fields.calendar_target, scheduled_start: new Date(fields.scheduled_start).toISOString(), scheduled_end: new Date(fields.scheduled_end).toISOString(), due_date: new Date(fields.scheduled_start).toISOString(), status: 'suggested', updated_at: new Date().toISOString() }).eq('id', suggestion.id).in('status', ['suggested','approved']);
    if (saveError) throw saveError;
    setEditing(null); setReviewed(value => ({ ...value, [suggestion.id]: false })); setMessage('Edits saved. Review and approve again before creating an event.');
  });
  const saveTask = suggestion => action(async () => {
    const { error: saveError } = await supabase.from('productivity_tasks').insert({ title: suggestion.title, description: suggestion.description, assigned_to: suggestion.assigned_to, calendar_target: suggestion.calendar_target || 'yho', priority: suggestion.priority, status: 'approved', due_date: suggestion.scheduled_start, related_order_id: suggestion.related_order_id, related_quote_id: suggestion.related_quote_id, related_vendor_draft_id: suggestion.related_vendor_draft_id });
    if (saveError) throw saveError;
    await supabase.from('calendar_event_suggestions').update({ status: 'dismissed' }).eq('id', suggestion.id);
    setMessage('Saved as an internal task only. No Google event was created.');
  });
  const createEvent = suggestion => action(async () => {
    const targetCalendar = calendarFor(status?.connection, suggestion.calendar_target);
    if (!targetCalendar?.id || !reviewed[suggestion.id] || !window.confirm(`Create ONE real event on ${targetCalendar.name}? This will not email customers.`)) return;
    const result = await calendarAction('create_event', { suggestion_id: suggestion.id, confirmed: true });
    setReviewed(value => ({ ...value, [suggestion.id]: false }));
    setMessage(result.warning || `Google event created: ${result.event_id}`);
  });

  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-10"><header><Link className="text-sm text-primary underline" to="/AdminDashboard">Admin Dashboard</Link><h1 className="mt-3 text-3xl font-bold">Productivity Dashboard</h1><p className="text-muted-foreground">Private HC Apparel tasks and calendar suggestions. Nothing is sent to Google without a separate, reviewed approval.</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>}{statusError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">Calendar status unavailable: {statusError.message}</p>}{message && <p role="status" className="rounded-lg border bg-white p-3">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Today’s tasks', todayTasks.length], ['Paid order reviews', orderReviews.length], ['Vendor drafts to review', draftsPending.length], ['Bulk quote follow-ups', quotesPending.length]].map(([label, count]) => <div key={label} className="rounded-xl border bg-white p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-bold">{count}</p></div>)}</div>
    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Upcoming & customer follow-ups</h2>{tasksError ? <p>Tasks could not be loaded.</p> : upcoming.length ? <ul className="mt-3 divide-y">{upcoming.map(task => <li className="py-3" key={task.id}><strong>{task.title}</strong><p className="text-sm text-muted-foreground">{displayDate(task.due_date)} · {staffNames.get(task.assigned_to) || 'Unassigned'} · {task.status}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No upcoming tasks yet.</p>}</section><section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Tasks by owner</h2>{team.map(person => <p className="mt-3" key={person.id}>{person.name}: <strong>{activeTasks.filter(task => task.assigned_to === person.id).length}</strong> active</p>)}<p className="mt-4 text-sm">Google Calendar: {status?.connected ? 'Connected' : 'Not connected'}</p><p className="text-sm">King Terik: {status?.connection?.king_calendar_name || 'Not assigned'}</p><p className="text-sm">YHO Operations: {status?.connection?.yho_calendar_name || 'Not assigned'}</p><Link className="text-sm text-primary underline" to="/AdminCalendarSettings">Calendar Settings</Link><p className="mt-4 text-sm">Recently created Google events: {events.length}</p>{events.map(event => <p className="mt-1 text-sm" key={event.id}>{event.title} · {displayDate(event.scheduled_start)}</p>)}</section></div>
    <section className="space-y-4 rounded-2xl border bg-[#f8f6ef] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">AI Schedule Assistant</h2><p className="text-sm text-muted-foreground">Uses real operational IDs, statuses and dates; no payment details or customer email is sent to OpenAI.</p></div><button className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50" disabled={busy || !status?.openai_configured} onClick={() => action(async () => { const result = await calendarAction('suggest'); setMessage(`${result.suggestions.length} private suggestions saved. No Google events created.`); })}>Generate suggestions</button></div>{!status?.openai_configured && <p className="text-sm">Configure OPENAI_API_KEY in Supabase to enable suggestions.</p>}{suggestionsError && <p role="alert">Could not load suggestions; deploy the productivity migration.</p>}
      {suggestions.filter(item => ['suggested','approved'].includes(item.status)).map(item => <article className="space-y-3 rounded-xl border bg-white p-5" key={item.id}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{item.title}</h3><span className="text-xs uppercase text-muted-foreground">{item.priority} · {item.status}</span></div><p className="text-sm">{item.description}</p><p className="text-sm text-muted-foreground">{displayDate(item.scheduled_start)} – {displayDate(item.scheduled_end)} · {staffNames.get(item.assigned_to) || 'Unassigned'} · Calendar: {calendarFor(status?.connection, item.calendar_target)?.name || (item.calendar_target === 'king' ? 'HC Apparel — King Terik' : item.calendar_target === 'shared' ? 'HC Apparel Operations' : 'HC Apparel — YHO Operations')}</p><p className="text-xs text-muted-foreground">Reason: {item.reason || 'Operational follow-up'} · Reference: {item.related_order_id || item.related_quote_id || item.related_vendor_draft_id || 'general operations'}</p>
        {editing === item.id && <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">Title<input className="w-full rounded border p-2" value={fields.title} onChange={e => setFields({ ...fields, title: e.target.value })} /></label><label className="text-sm">Owner<select className="w-full rounded border p-2" value={fields.assigned_to} onChange={e => { const person = team.find(member => member.id === e.target.value); setFields({ ...fields, assigned_to: e.target.value, calendar_target: person?.name === 'King Terik' ? 'king' : person?.name === 'YHO / Mario' ? 'yho' : fields.calendar_target }); }}><option value="">Unassigned</option>{team.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="text-sm">Target calendar<select className="w-full rounded border p-2" value={fields.calendar_target} onChange={e => setFields({ ...fields, calendar_target: e.target.value })}><option value="king">HC Apparel — King Terik</option><option value="yho">HC Apparel — YHO Operations</option><option value="shared">HC Apparel Operations (shared)</option></select></label><label className="text-sm">Start<input className="w-full rounded border p-2" type="datetime-local" value={fields.scheduled_start} onChange={e => setFields({ ...fields, scheduled_start: e.target.value })} /></label><label className="text-sm">End<input className="w-full rounded border p-2" type="datetime-local" value={fields.scheduled_end} onChange={e => setFields({ ...fields, scheduled_end: e.target.value })} /></label><label className="text-sm">Priority<select className="w-full rounded border p-2" value={fields.priority} onChange={e => setFields({ ...fields, priority: e.target.value })}>{['low','normal','high','urgent'].map(priority => <option key={priority}>{priority}</option>)}</select></label><label className="text-sm sm:col-span-2">Description<textarea className="w-full rounded border p-2" value={fields.description} onChange={e => setFields({ ...fields, description: e.target.value })} /></label><button className="rounded border px-3 py-2" disabled={busy} onClick={() => saveEdit(item)}>Save edits</button></div>}
        <div className="flex flex-wrap gap-2 text-sm"><button className="rounded border px-3 py-2" disabled={busy} onClick={() => edit(item)}>Edit Before Creating</button><button className="rounded border px-3 py-2" disabled={busy} onClick={() => saveTask(item)}>Save as Task Only</button><button className="rounded border px-3 py-2" disabled={busy} onClick={() => update(item.id, { status: 'dismissed' })}>Dismiss</button>{item.status === 'suggested' && <button className="rounded border px-3 py-2" disabled={busy || editing === item.id} onClick={() => update(item.id, { status: 'approved' })}>Approve suggestion</button>}</div>
        {item.status === 'approved' && <div className="border-t pt-3"><label className="flex gap-2 text-sm"><input type="checkbox" checked={Boolean(reviewed[item.id])} onChange={e => setReviewed(value => ({ ...value, [item.id]: e.target.checked }))} />I reviewed this event, assigned person, calendar and time. Create one real Google event.</label><button className="mt-3 rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50" disabled={busy || !reviewed[item.id] || !calendarFor(status?.connection, item.calendar_target)?.id} onClick={() => createEvent(item)}>Approve & Create Event</button>{!calendarFor(status?.connection, item.calendar_target)?.id && <p className="text-xs text-muted-foreground">Connect and assign the target Google calendar first.</p>}</div>}</article>)}
    </section>
  </main>;
}
