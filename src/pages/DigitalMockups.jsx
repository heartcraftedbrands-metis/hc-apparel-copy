import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileImage, Search, ShieldCheck, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { useCart } from '@/components/shop/CartContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { digitalMockupsRequest, formatFileSize, mockupCartItem } from '@/lib/digitalMockups';

const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export default function DigitalMockups() {
  const { addToCart } = useCart();
  const [items, setItems] = useState([]);
  const [hero, setHero] = useState(null);
  const [filters, setFilters] = useState({ garment_types: [], colors: [] });
  const [search, setSearch] = useState('');
  const [garmentType, setGarmentType] = useState('');
  const [colorName, setColorName] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const queryKey = useMemo(() => JSON.stringify({ search, garmentType, colorName, sort }), [search, garmentType, colorName, sort]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await digitalMockupsRequest({ action: 'catalog', search, garment_type: garmentType, color_name: colorName, sort, page, per_page: 12 });
        if (!active) return;
        setItems(current => page === 1 ? result.items : [...current, ...result.items]);
        setHero(result.hero);
        setFilters(result.filters);
        setHasMore(result.has_more);
        setTotal(result.total);
        setError('');
      } catch (requestError) {
        if (active) setError(requestError.message || 'Digital Mockups could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }, page === 1 ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [queryKey, page]);

  useEffect(() => setPage(1), [queryKey]);

  const add = item => {
    addToCart(mockupCartItem(item));
    toast.success('Mockup added to your cart. Each digital image can be purchased once per order.');
  };

  const featured = hero?.featured;

  return <div className="min-h-screen bg-background">
    <section className="relative overflow-hidden border-b bg-background">
      <div className="absolute left-0 top-20 h-48 w-28 bg-secondary/55 md:h-64 md:w-44" aria-hidden="true" />
      <div className="absolute bottom-0 right-[7%] h-32 w-52 bg-accent/25 md:h-44 md:w-80" aria-hidden="true" />
      <div className="container relative mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[0.9fr_1.1fr] md:items-center md:py-20">
        <div className="relative z-10 max-w-2xl space-y-6">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-primary">Digital image collection</p>
          <h1 className="text-5xl font-black leading-[0.94] tracking-tight text-foreground sm:text-6xl lg:text-7xl">{hero?.heading || 'HeartCrafted Mockups'}</h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">{hero?.description || 'Bring your designs to life with downloadable apparel mockups. Get a full-resolution, watermark-free PNG for just $1.20 per image.'}</p>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button size="lg" className="min-h-12 px-7" onClick={() => document.getElementById('mockup-catalog')?.scrollIntoView({ behavior: 'smooth' })}>{hero?.button_label || 'Shop Mockups'}</Button>
            <p className="text-sm font-semibold text-foreground">{hero?.supporting_text || 'Instant downloads after payment • $1.20 each'}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Secure payment verification</span>
            <span className="inline-flex items-center gap-2"><Download className="h-4 w-4 text-primary" />Original PNG after payment</span>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -left-5 -top-5 h-[72%] w-[54%] bg-primary/90" aria-hidden="true" />
          <div className="absolute -bottom-5 -right-5 h-[58%] w-[58%] bg-secondary" aria-hidden="true" />
          <div className="relative overflow-hidden border-8 border-background bg-card shadow-2xl">
            {featured?.preview_url ? <img src={featured.preview_url} alt={`Watermarked preview of ${featured.title}`} className="aspect-[4/5] w-full object-cover object-top" /> : <div className="flex aspect-[4/5] items-center justify-center bg-muted"><FileImage className="h-16 w-16 text-muted-foreground/40" /></div>}
          </div>
          <div className="relative mt-7 space-y-2 text-center md:text-left">
            <h2 className="whitespace-pre-line text-3xl font-black leading-tight text-primary">{hero?.right_headline || 'Crafted with Heart.\nReady for Your Art.'}</h2>
            <p className="font-bold text-foreground">{hero?.quality_label || 'Quality 2000px Images'}</p>
            <p className="text-sm text-muted-foreground">{hero?.launch_detail || 'Launch collection: measured full-resolution PNG downloads'}</p>
          </div>
        </div>
      </div>
    </section>

    <main id="mockup-catalog" className="container mx-auto max-w-7xl scroll-mt-24 px-4 py-12">
      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Browse the collection</p><h2 className="text-3xl font-black">Digital Mockups</h2><p className="mt-1 text-sm text-muted-foreground">Watermarked previews shown. Purchased downloads are full-resolution and watermark-free.</p></div>
        <p className="text-sm font-semibold text-muted-foreground">{total} mockup{total === 1 ? '' : 's'}</p>
      </div>
      <div className="mb-8 grid gap-3 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <label className="relative"><span className="sr-only">Search mockups</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search mockups" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <select aria-label="Garment type" className="h-10 rounded-md border bg-background px-3 text-sm" value={garmentType} onChange={event => setGarmentType(event.target.value)}><option value="">All garment types</option>{filters.garment_types.map(value => <option value={value} key={value}>{label(value)}</option>)}</select>
        <select aria-label="Color" className="h-10 rounded-md border bg-background px-3 text-sm" value={colorName} onChange={event => setColorName(event.target.value)}><option value="">All colors</option>{filters.colors.map(value => <option value={value} key={value}>{label(value)}</option>)}</select>
        <select aria-label="Sort mockups" className="h-10 rounded-md border bg-background px-3 text-sm" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option></select>
      </div>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {!error && !loading && items.length === 0 && <div className="rounded-xl border bg-card p-12 text-center"><p className="font-semibold">No published mockups match those filters.</p><button type="button" className="mt-2 text-sm font-semibold text-primary underline" onClick={() => { setSearch(''); setGarmentType(''); setColorName(''); }}>Clear filters</button></div>}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-lg">
          <Link to={`/DigitalMockups/${item.slug}`} className="block overflow-hidden bg-muted"><img src={item.preview_url} alt={`Watermarked preview of ${item.title}`} loading="lazy" className="aspect-[4/5] w-full object-cover object-top transition-transform duration-300 hover:scale-[1.02]" /></Link>
          <div className="space-y-3 p-4">
            <div><p className="text-xs font-bold uppercase tracking-wider text-primary">{label(item.garment_type)} · {item.color_name}</p><Link to={`/DigitalMockups/${item.slug}`}><h3 className="mt-1 font-bold leading-snug hover:text-primary">{item.title}</h3></Link></div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{item.pixel_width} × {item.pixel_height}px</span><span>{String(item.file_extension).toUpperCase()}</span><span>{formatFileSize(item.file_size_bytes)}</span></div>
            <p className="text-xs text-muted-foreground">Digital image download. No physical garment included.</p>
            <div className="flex items-center justify-between gap-3"><p className="text-xl font-black text-primary">${Number(item.price).toFixed(2)}</p><Button size="sm" onClick={() => add(item)}><ShoppingCart className="mr-2 h-4 w-4" />Add to cart</Button></div>
          </div>
        </article>)}
      </div>
      {loading && <div className="py-10 text-center text-sm text-muted-foreground">Loading mockups…</div>}
      {hasMore && !loading && <div className="pt-8 text-center"><Button variant="outline" size="lg" onClick={() => setPage(value => value + 1)}>Load more</Button></div>}
    </main>
  </div>;
}
