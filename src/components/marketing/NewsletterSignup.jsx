import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const INTERESTS = ['Apparel Blanks', 'Bulk Orders', 'Custom Printing', 'Brand/Creator Drops', 'School/Team Orders'];

export default function NewsletterSignup({ source = 'home' }) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [interests, setInterests] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    if (!consent) { setError('Please agree to receive HC Apparel updates.'); return; }
    setBusy(true); setError(''); setResult('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('marketing-foundation', {
        body: { action: 'subscribe', email, first_name: firstName, interests, consent, source },
      });
      if (invokeError || !data?.saved) throw new Error(data?.error || 'Signup could not be saved.');
      setResult(data.sync_status === 'pending_double_opt_in' ? 'Signup saved. Confirmation is required before joining the Brevo list.' : 'Thanks for joining HC Apparel updates!');
      setEmail(''); setFirstName(''); setInterests([]); setConsent(false);
    } catch (issue) { setError(issue.message || 'Signup failed. Please try again.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" aria-label="HC Apparel newsletter signup">
    <h2 className="text-xl font-bold text-primary">HC Apparel updates</h2>
    <p className="mt-1 text-sm text-muted-foreground">Blank apparel, optional printing, bulk order tips, and product drops.</p>
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Email *<Input type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} autoComplete="email" className="mt-1" /></label><label className="text-sm font-medium">First name (optional)<Input value={firstName} onChange={event => setFirstName(event.target.value)} maxLength={80} autoComplete="given-name" className="mt-1" /></label></div>
      <fieldset><legend className="text-sm font-medium">Interests (optional)</legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{INTERESTS.map(tag => <label key={tag} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={interests.includes(tag)} onChange={event => setInterests(current => event.target.checked ? [...current, tag] : current.filter(item => item !== tag))} />{tag}</label>)}</div></fieldset>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required className="mt-0.5" /><span>Join HC Apparel updates for blanks, printing, bulk order tips, and product drops. Unsubscribe anytime.</span></label>
      <Button type="submit" disabled={busy || !consent}>{busy ? 'Saving…' : 'Join updates'}</Button>
      {result && <p role="status" className="text-sm text-green-700">{result}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  </section>;
}
