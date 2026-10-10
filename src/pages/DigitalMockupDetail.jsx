import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, FileImage, ShieldCheck, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { useCart } from '@/components/shop/CartContext';
import { Button } from '@/components/ui/button';
import { digitalMockupsRequest, formatFileSize, mockupCartItem } from '@/lib/digitalMockups';

const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export default function DigitalMockupDetail() {
  const { slug } = useParams();
  const { addToCart } = useCart();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    digitalMockupsRequest({ action: 'detail', slug })
      .then(result => active && setData(result))
      .catch(requestError => active && setError(requestError.message))
    return () => { active = false; };
  }, [slug]);

  if (error) return <main className="container mx-auto max-w-3xl px-4 py-20 text-center"><FileImage className="mx-auto h-12 w-12 text-muted-foreground" /><h1 className="mt-4 text-2xl font-bold">Mockup unavailable</h1><p className="mt-2 text-muted-foreground">{error}</p><Button asChild className="mt-5"><Link to="/DigitalMockups">Browse Digital Mockups</Link></Button></main>;
  if (!data?.item) return <main className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading mockup…</main>;
  const item = data.item;

  const add = () => {
    addToCart(mockupCartItem(item));
    toast.success('Mockup added to your cart.');
    window.dispatchEvent(new Event('hc:open-cart'));
  };

  return <main className="container mx-auto max-w-7xl px-4 py-8 md:py-12">
    <Button variant="ghost" asChild className="mb-6"><Link to="/DigitalMockups"><ArrowLeft className="mr-2 h-4 w-4" />Digital Mockups</Link></Button>
    <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
      <section className="overflow-hidden rounded-2xl border bg-muted shadow-sm"><div className="relative flex"><img src={item.preview_url} alt={`Watermarked preview of ${item.title}`} className={`${item.view_type === 'front_back' || item.presentation_type === 'flat_lay' ? 'aspect-[4/3] object-contain' : 'aspect-[4/5] object-cover object-top'} w-full`} /><span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-black text-foreground shadow-sm">{item.view_type === 'front_back' ? 'Front + Back' : 'Single View'}</span></div><p className="border-t bg-card px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Watermarked preview — purchased file is the original, watermark-free PNG.</p></section>
      <section className="space-y-6 lg:py-5">
        <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">{label(item.garment_type)} · {item.color_name}</p><h1 className="mt-2 text-4xl font-black leading-tight">{item.title}</h1><p className="mt-3 text-3xl font-black text-primary">${Number(item.price).toFixed(2)}</p>{Number(item.price) === 0.99 && <p className="mt-1 font-bold text-primary">Eligible for the 3 for $2 Mockup Deal</p>}</div>
        <p className="leading-relaxed text-muted-foreground">{item.description}</p>
        <div className="rounded-xl border bg-card p-5"><h2 className="font-bold">File details</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Views</dt><dd className="font-semibold">{item.view_type === 'front_back' ? 'Front + Back in one PNG' : 'Single View'}</dd></div><div><dt className="text-muted-foreground">Dimensions</dt><dd className="font-semibold">{item.pixel_width} × {item.pixel_height} px</dd></div><div><dt className="text-muted-foreground">Format</dt><dd className="font-semibold">{String(item.file_extension).toUpperCase()}</dd></div><div><dt className="text-muted-foreground">File size</dt><dd className="font-semibold">{formatFileSize(item.file_size_bytes)}</dd></div><div><dt className="text-muted-foreground">SKU</dt><dd className="font-semibold">{item.sku}</dd></div></dl></div>
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 font-semibold">Digital image download. No physical garment included.</div>
        <ul className="space-y-2 text-sm"><li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Full-resolution original PNG after verified payment</li><li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />No watermark on purchased download</li><li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Secure account or guest purchase access</li></ul>
        <Button size="lg" className="min-h-12 w-full" onClick={add}><ShoppingCart className="mr-2 h-5 w-5" />Add to cart — ${Number(item.price).toFixed(2)}</Button>
        <details className="rounded-xl border bg-card p-4 text-sm"><summary className="cursor-pointer font-bold">Digital mockup license terms</summary><p className="mt-3 leading-relaxed text-muted-foreground">{data.terms?.license_terms}</p>{data.terms?.license_status === 'proposed' && <p className="mt-2 text-xs font-semibold text-amber-700">These terms are proposed for owner review before public sales are enabled.</p>}</details>
      </section>
    </div>
  </main>;
}
