import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileImage, Search, ShieldCheck, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { useCart } from '@/components/shop/CartContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { digitalMockupsRequest, formatFileSize, mockupCartItem } from '@/lib/digitalMockups';
import { calculateMockupPromotion } from '@/lib/mockupPromotion';

const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export default function DigitalMockups() {
  const { addToCart, cart } = useCart();
  const [items, setItems] = useState([]);
  const [hero, setHero] = useState(null);
  const [filters, setFilters] = useState({ garment_types: [], colors: [], view_types: [], presentation_types: [] });
  const [search, setSearch] = useState('');
  const [garmentType, setGarmentType] = useState('');
  const [colorName, setColorName] = useState('');
  const [viewType, setViewType] = useState('');
  const [presentationType, setPresentationType] = useState('');
  const [dealEligible, setDealEligible] = useState(false);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const queryKey = useMemo(() => JSON.stringify({ search, garmentType, colorName, viewType, presentationType, dealEligible, sort }), [search, garmentType, colorName, viewType, presentationType, dealEligible, sort]);
  const promotion = useMemo(() => calculateMockupPromotion(cart), [cart]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await digitalMockupsRequest({ action: 'catalog', search, garment_type: garmentType, color_name: colorName, view_type: viewType, presentation_type: presentationType, deal_eligible: dealEligible, sort, page, per_page: 12 });
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

  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [queryKey]);

  const add = item => {
    addToCart(mockupCartItem(item));
    toast.success('Mockup added to your cart. Each digital image can be purchased once per order.');
  };

  const featured = hero?.featured;
  const showQualityLabel = featured && (Number(featured.pixel_width) >= 2000 || Number(featured.pixel_height) >= 2000);

  return <div className="min-h-screen bg-background">
    <section className="relative overflow-hidden border-b bg-background">
      <div className="absolute left-0 top-20 h-48 w-28 bg-secondary/55 md:h-64 md:w-44" aria-hidden="true" />
      <div className="absolute bottom-0 right-[7%] h-32 w-52 bg-accent/25 md:h-44 md:w-80" aria-hidden="true" />
      <div className="container relative mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[0.9fr_1.1fr] md:items-center md:py-20">
        <div className="relative z-10 max-w-2xl space-y-6">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-primary">Digital image collection</p>
          <h1 className="text-5xl font-black leading-[0.94] tracking-tight text-foreground sm:text-6xl lg:text-7xl">{hero?.heading || 'HeartCrafted Mockups'}</h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">{hero?.description || 'Bring your designs to life with downloadable apparel mockups. Choose a single view or front-and-back image and get the original, watermark-free PNG after payment.'}</p>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button size="lg" className="min-h-12 px-7" onClick={() => document.getElementById('mockup-catalog')?.scrollIntoView({ behavior: 'smooth' })}>{hero?.button_label || 'Shop Mockups'}</Button>
            <p className="text-sm font-semibold text-foreground">{hero?.supporting_text || 'Single-view mockups $0.99 • Front + back mockups $1.20'}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Secure payment verification</span>
            <span className="inline-flex items-center gap-2"><Download className="h-4 w-4 text-primary" />Original PNG after payment</span>
          </div>
          <div className="max-w-xl rounded-2xl border border-primary/25 bg-card/90 p-5 shadow-sm"><p className="text-2xl font-black text-primary">Pick 3. Pay $2.</p><p className="mt-1 text-sm text-muted-foreground">Mix &amp; match any three $0.99 mockups. Your savings apply automatically at checkout.</p><p className="mt-3 text-sm font-semibold">{promotion.eligibleCount > 0 ? promotion.progress : 'Add any three eligible Single View mockups to unlock the deal.'}</p><Button className="mt-4" variant="outline" onClick={() => { setDealEligible(true); setViewType('single_view'); document.getElementById('mockup-catalog')?.scrollIntoView({ behavior: 'smooth' }); }}>Choose Your 3</Button></div>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -left-5 -top-5 h-[72%] w-[54%] bg-primary/90" aria-hidden="true" />
          <div className="absolute -bottom-5 -right-5 h-[58%] w-[58%] bg-secondary" aria-hidden="true" />
          <div className="relative overflow-hidden border-8 border-background bg-card shadow-2xl">
            {(hero?.hero_image_url || featured?.preview_url) ? <img src={hero?.hero_image_url || featured.preview_url} alt={featured ? `${featured.title} digital mockup collection` : 'HC Apparel digital mockup collection'} className="aspect-[4/5] w-full object-cover object-top" /> : <div className="flex aspect-[4/5] items-center justify-center bg-muted"><FileImage className="h-16 w-16 text-muted-foreground/40" /></div>}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pb-6 pt-24 text-white sm:px-7 sm:pb-8 sm:pt-32">
              <h2 className="whitespace-pre-line text-3xl font-black leading-[0.95] tracking-tight drop-shadow-sm sm:text-4xl lg:text-5xl">{hero?.right_headline || 'Crafted with Heart.\nReady for Your Art.'}</h2>
              {showQualityLabel && <p className="mt-3 text-base font-extrabold tracking-wide text-white/95 drop-shadow-sm sm:text-lg">{hero?.quality_label || 'Quality 2000px Images'}</p>}
            </div>
          </div>
        </div>
      </div>
    </section>

    <main id="mockup-catalog" className="container mx-auto max-w-7xl scroll-mt-24 px-4 py-12">
      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Browse the collection</p><h2 className="text-3xl font-black">Digital Mockups</h2><p className="mt-1 text-sm text-muted-foreground">Watermarked previews shown. Purchased downloads are full-resolution and watermark-free.</p></div>
        <p className="text-sm font-semibold text-muted-foreground">{total} mockup{total === 1 ? '' : 's'}</p>
      </div>
      <div className="mb-8 grid gap-3 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <label className="relative"><span className="sr-only">Search mockups</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search mockups" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <select aria-label="Garment type" className="h-10 rounded-md border bg-background px-3 text-sm" value={garmentType} onChange={event => setGarmentType(event.target.value)}><option value="">All garment types</option>{filters.garment_types.map(value => <option value={value} key={value}>{label(value)}</option>)}</select>
        <select aria-label="Color" className="h-10 rounded-md border bg-background px-3 text-sm" value={colorName} onChange={event => setColorName(event.target.value)}><option value="">All colors</option>{filters.colors.map(value => <option value={value} key={value}>{label(value)}</option>)}</select>
        <select aria-label="View type" className="h-10 rounded-md border bg-background px-3 text-sm" value={viewType} onChange={event => setViewType(event.target.value)}><option value="">All views</option><option value="single_view">Single View</option><option value="front_back">Front + Back</option></select>
        <select aria-label="Presentation type" className="h-10 rounded-md border bg-background px-3 text-sm" value={presentationType} onChange={event => setPresentationType(event.target.value)}><option value="">All presentation styles</option><option value="flat_lay">Flat Lay</option><option value="lifestyle">Lifestyle</option></select>
        <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-semibold"><input type="checkbox" checked={dealEligible} onChange={event => setDealEligible(event.target.checked)} />3 for $2 eligible</label>
        <select aria-label="Sort mockups" className="h-10 rounded-md border bg-background px-3 text-sm" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option></select>
      </div>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {!error && !loading && items.length === 0 && <div className="rounded-xl border bg-card p-12 text-center"><p className="font-semibold">No published mockups match those filters.</p><button type="button" className="mt-2 text-sm font-semibold text-primary underline" onClick={() => { setSearch(''); setGarmentType(''); setColorName(''); setViewType(''); setPresentationType(''); setDealEligible(false); }}>Clear filters</button></div>}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-lg">
          <Link to={`/DigitalMockups/${item.slug}`} className="relative flex overflow-hidden bg-muted"><img src={item.preview_url} alt={`Watermarked preview of ${item.title}`} loading="lazy" className={`${item.view_type === 'front_back' || item.presentation_type === 'flat_lay' ? 'aspect-[4/3] object-contain' : 'aspect-[4/5] object-cover object-top'} w-full transition-transform duration-300 hover:scale-[1.02]`} /><span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-black text-foreground shadow-sm">{item.view_type === 'front_back' ? 'Front + Back' : 'Single View'}</span>{item.presentation_type && item.presentation_type !== 'studio' && <span className="absolute right-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-black text-foreground shadow-sm">{label(item.presentation_type)}</span>}</Link>
          <div className="space-y-3 p-4">
            <div><p className="text-xs font-bold uppercase tracking-wider text-primary">{label(item.garment_type)} · {item.color_name}</p><Link to={`/DigitalMockups/${item.slug}`}><h3 className="mt-1 font-bold leading-snug hover:text-primary">{item.title}</h3></Link></div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{item.pixel_width} × {item.pixel_height}px</span><span>{String(item.file_extension).toUpperCase()}</span><span>{formatFileSize(item.file_size_bytes)}</span></div>
            <p className="text-xs text-muted-foreground">Digital image download. No physical garment included.</p>
            <div className="flex items-center justify-between gap-3"><div><p className="text-xl font-black text-primary">${Number(item.price).toFixed(2)}</p>{Number(item.price) === 0.99 && <p className="text-[11px] font-bold text-primary">Eligible for 3 for $2</p>}</div><Button size="sm" onClick={() => add(item)}><ShoppingCart className="mr-2 h-4 w-4" />Add to cart</Button></div>
          </div>
        </article>)}
      </div>
      {loading && <div className="py-10 text-center text-sm text-muted-foreground">Loading mockups…</div>}
      {hasMore && !loading && <div className="pt-8 text-center"><Button variant="outline" size="lg" onClick={() => setPage(value => value + 1)}>Load more</Button></div>}
    </main>
  </div>;
}
