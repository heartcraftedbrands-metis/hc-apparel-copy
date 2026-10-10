import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';

import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { digitalMockupsRequest } from '@/lib/digitalMockups';
import { calculateMockupPromotion } from '@/lib/mockupPromotion';

function attemptKey(productIds) {
  const signature = [...productIds].sort().join('|');
  const storageKey = `hc_digital_checkout_attempt:${signature}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const value = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

export default function DigitalCheckout({ cart }) {
  const promotion = useMemo(() => calculateMockupPromotion(cart), [cart]);
  const [form, setForm] = useState({ customer_name: '', customer_email: '', billing_city: '', billing_state: '', billing_zip: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      setForm(current => ({ ...current, customer_name: data.user.user_metadata?.full_name || current.customer_name, customer_email: data.user.email || current.customer_email }));
    });
    return () => { active = false; };
  }, []);
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const productIds = cart.map(item => item.product_id || item.id);
      const result = await digitalMockupsRequest({ action: 'create_checkout', ...form, checkout_attempt_key: attemptKey(productIds), product_ids: productIds });
      if (!result.checkout_url || new URL(result.checkout_url).hostname !== 'checkout.stripe.com') throw new Error('Secure payment checkout did not return a valid link.');
      try { window.localStorage.setItem(`hc_digital_access:${result.order_id}`, result.access_token); } catch { /* Email access remains available. */ }
      window.location.assign(result.checkout_url);
    } catch (requestError) {
      setError(requestError.message || 'Checkout could not be started.');
      setSubmitting(false);
    }
  };

  return <div className="min-h-screen bg-background"><div className="container mx-auto max-w-5xl px-4 py-10">
    <Button variant="ghost" asChild className="mb-5"><Link to="/DigitalMockups"><ArrowLeft className="mr-2 h-4 w-4" />Continue shopping</Link></Button>
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card><CardHeader><CardTitle>Secure digital checkout</CardTitle></CardHeader><CardContent className="space-y-5">
        <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"><Download className="mr-2 inline h-4 w-4 text-primary" />No shipping charge or shipping address is required for this digital-only order.</p>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="digital-name">Name</Label><Input id="digital-name" autoComplete="name" value={form.customer_name} onChange={update('customer_name')} required /></div><div><Label htmlFor="digital-email">Email</Label><Input id="digital-email" type="email" autoComplete="email" value={form.customer_email} onChange={update('customer_email')} required /></div></div>
        <fieldset className="space-y-3"><legend className="font-semibold">Billing location for sales tax</legend><p className="text-xs text-muted-foreground">Only city, state, and ZIP are needed here. The secure payment page separately collects the billing details required by your payment method.</p><div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="digital-city">City</Label><Input id="digital-city" autoComplete="address-level2" value={form.billing_city} onChange={update('billing_city')} required /></div><div><Label htmlFor="digital-state">State</Label><Input id="digital-state" autoComplete="address-level1" maxLength={2} placeholder="GA" value={form.billing_state} onChange={event => setForm(current => ({ ...current, billing_state: event.target.value.toUpperCase() }))} required /></div><div><Label htmlFor="digital-zip">ZIP</Label><Input id="digital-zip" inputMode="numeric" autoComplete="postal-code" value={form.billing_zip} onChange={update('billing_zip')} required /></div></div></fieldset>
        <p className="flex gap-2 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Downloads unlock only after HC Apparel verifies successful payment on the server. The return page alone never unlocks a file.</p>
      </CardContent></Card>
      <div className="space-y-4"><Card><CardHeader><CardTitle>Your mockups</CardTitle></CardHeader><CardContent className="space-y-4">{cart.map(item => <div className="flex gap-3 border-b pb-3 last:border-0" key={item.product_id || item.id}><img src={item.image_url} alt="" className={`${item.view_type === 'front_back' || item.presentation_type === 'flat_lay' ? 'w-20 object-contain' : 'w-14 object-cover object-top'} h-16 rounded bg-muted`} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-snug">{item.name}</p><p className="text-xs text-muted-foreground">{item.view_type === 'front_back' ? 'Front + Back · ' : 'Single View · '}Original PNG after payment</p></div><p className="font-bold">${Number(item.price).toFixed(2)}</p></div>)}<div className="space-y-2 border-t pt-4 text-sm"><div className="flex justify-between"><span>Catalog subtotal</span><span>${promotion.catalogTotal.toFixed(2)}</span></div>{promotion.savings > 0 && <div className="flex justify-between font-semibold text-primary"><span>{promotion.name}</span><span>-${promotion.savings.toFixed(2)}</span></div>}<div className="flex justify-between font-bold"><span>Discounted mockup subtotal</span><span>${promotion.total.toFixed(2)}</span></div><p className="rounded-md bg-primary/5 p-2 text-xs text-muted-foreground">{promotion.progress}</p><div className="flex justify-between"><span>Shipping</span><span>$0.00</span></div><div className="flex justify-between"><span>Applicable tax</span><span>Calculated securely</span></div></div></CardContent></Card>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="min-h-12 w-full" disabled={submitting}>{submitting ? 'Opening secure checkout…' : 'Continue to secure payment'}</Button>
        <p className="text-center text-xs text-muted-foreground">The secure checkout shows the final total before payment. Different mockups can be purchased together; duplicate copies are not added.</p>
      </div>
    </form>
  </div></div>;
}
