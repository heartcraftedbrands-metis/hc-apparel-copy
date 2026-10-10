import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Mail } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import DownloadsPanel from '@/components/mockups/DownloadsPanel';
import { useCart } from '@/components/shop/CartContext';
import { Button } from '@/components/ui/button';
import { digitalMockupsRequest } from '@/lib/digitalMockups';

export default function DigitalOrderConfirmation() {
  const [params] = useSearchParams();
  const orderId = params.get('orderId') || '';
  const sessionId = params.get('session_id') || '';
  const access = params.get('access') || window.localStorage.getItem(`hc_digital_access:${orderId}`) || '';
  const { clearCart } = useCart();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!orderId || !sessionId || !access) { setError('This confirmation link is incomplete. Use the secure link from your purchase email.'); return undefined; }
    digitalMockupsRequest({ action: 'verify_payment', order_id: orderId, session_id: sessionId, access })
      .then(async verified => {
        if (!active) return;
        setResult(verified);
        if (verified.paid) await clearCart();
      })
      .catch(requestError => active && setError(requestError.message || 'Payment could not be verified.'));
    return () => { active = false; };
  }, [access, clearCart, orderId, sessionId]);

  if (!result && !error) return <main className="container mx-auto max-w-3xl px-4 py-24 text-center"><Clock3 className="mx-auto h-12 w-12 animate-pulse text-primary" /><h1 className="mt-4 text-2xl font-bold">Verifying payment…</h1><p className="mt-2 text-sm text-muted-foreground">Downloads remain locked until the payment provider confirms success.</p></main>;
  if (error || !result?.paid) return <main className="container mx-auto max-w-3xl px-4 py-20 text-center"><Clock3 className="mx-auto h-12 w-12 text-amber-600" /><h1 className="mt-4 text-2xl font-bold">Payment is not confirmed</h1><p className="mt-2 text-muted-foreground">{error || 'The payment is still pending. No files have been unlocked.'}</p><Button className="mt-6" asChild><Link to="/DigitalMockups">Return to Digital Mockups</Link></Button></main>;
  return <main className="min-h-[70vh] bg-background"><div className="container mx-auto max-w-4xl px-4 py-10 md:py-14">
    <header className="mb-8 text-center"><CheckCircle2 className="mx-auto h-16 w-16 text-primary" /><h1 className="mt-4 text-3xl font-black">Payment confirmed</h1><p className="mt-2 text-muted-foreground">Your original, watermark-free mockup files are ready.</p>{Number(result.mockup_promotion?.discount_amount || 0) > 0 && <p className="mx-auto mt-3 max-w-sm rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 font-bold text-primary">3 for $2 Mockup Deal saved you ${Number(result.mockup_promotion.discount_amount).toFixed(2)}.</p>}<p className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold"><Mail className="h-3.5 w-3.5" />Email status: {String(result.email_status || 'pending').replaceAll('_', ' ')}</p></header>
    <DownloadsPanel orderId={orderId} access={access} />
  </div></main>;
}
