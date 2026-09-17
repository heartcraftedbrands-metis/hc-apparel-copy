import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminRows } from '@/lib/productivityCalendar';

export default function AdminTeamProductivity() {
  const { data: team = [], isLoading, error } = useQuery({ queryKey: ['productivity-team'], queryFn: () => adminRows('team_members', 'created_at', 20) });
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
    <div><Link className="text-sm text-primary underline" to="/AdminDashboard">Admin Dashboard</Link><h1 className="mt-3 text-3xl font-bold">Team & Productivity Settings</h1><p className="text-muted-foreground">Internal assignments only. Google Calendar uses the primary account first; no separate YHO login or attendee invite is created.</p></div>
    {isLoading ? <p>Loading staff…</p> : error ? <p role="alert">Could not load staff profiles. Check that the productivity migration is deployed.</p> : <div className="grid gap-4 md:grid-cols-2">{team.map(person => <article key={person.id} className="rounded-2xl border bg-white p-6"><div className="flex items-start justify-between gap-2"><div><h2 className="text-xl font-bold">{person.name}</h2><p className="text-sm text-muted-foreground">{person.title}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">{person.is_active ? 'Active' : 'Inactive'}</span></div><dl className="mt-4 space-y-3 text-sm"><div><dt className="font-semibold">Company email</dt><dd className="break-all">{person.email}{person.email_is_placeholder && ' (placeholder; no email sent)'}</dd></div><div><dt className="font-semibold">Calendar assignment</dt><dd>{person.calendar_assignment}</dd></div><div><dt className="font-semibold">Responsibilities</dt><dd><ul className="mt-1 list-inside list-disc space-y-1">{(person.responsibilities || []).map(item => <li key={item}>{item}</li>)}</ul></dd></div></dl></article>)}</div>}
    <p className="text-sm text-muted-foreground">YHO / Mario may be assigned internal tasks without connecting another Google account. The optional alias mario@ilovehcapparel.net is a reference only, not a verified mailbox.</p>
  </main>;
}
