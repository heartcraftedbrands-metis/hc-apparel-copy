import { useEffect, useState } from 'react';
import { Download, FileImage, LockKeyhole } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { digitalMockupsRequest, downloadDigitalMockup, formatFileSize } from '@/lib/digitalMockups';

export default function DownloadsPanel({ orderId = '', access = '' }) {
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let active = true;
    digitalMockupsRequest({ action: 'downloads', order_id: orderId, access })
      .then(result => { if (active) { setDownloads(result.downloads || []); setError(''); } })
      .catch(requestError => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [access, orderId]);

  const download = async entitlement => {
    setBusy(entitlement.id);
    setError('');
    try {
      const result = await downloadDigitalMockup({ entitlement_id: entitlement.id, order_id: orderId, access });
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = result.fileName || `${entitlement.product?.name || 'HC Apparel Digital Mockup'}.png`;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (requestError) {
      setError(requestError.message || 'The secure download link could not be created.');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading secure downloads…</p>;
  if (error && !downloads.length) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"><LockKeyhole className="mb-2 h-5 w-5" /><p className="font-bold">Downloads are still locked</p><p className="mt-1">{error}</p></div>;
  if (!downloads.length) return <div className="rounded-xl border bg-card p-8 text-center"><FileImage className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">No purchased mockups were found.</p></div>;
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {downloads.map(item => <article key={item.id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
      {item.product?.image_url ? <img src={item.product.image_url} alt="" className="h-28 w-24 rounded-lg object-cover object-top" /> : <div className="flex h-28 w-24 items-center justify-center rounded-lg bg-muted"><FileImage /></div>}
      <div className="min-w-0 flex-1"><h2 className="font-bold">{item.product?.name || 'Purchased digital mockup'}</h2><p className="mt-1 text-sm text-muted-foreground">{item.file?.pixel_width} × {item.file?.pixel_height} px · {String(item.file?.file_extension || '').toUpperCase()} · {formatFileSize(item.file?.file_size_bytes)}</p><p className="mt-1 text-xs text-muted-foreground">Original purchased version · watermark-free</p></div>
      <Button className="min-h-11" onClick={() => download(item)} disabled={busy === item.id}><Download className="mr-2 h-4 w-4" />{busy === item.id ? 'Preparing…' : 'Download Image'}</Button>
    </article>)}
    <p className="text-xs text-muted-foreground">Each button rechecks the paid purchase and securely delivers the original file with its current product-title filename.</p>
  </div>;
}
