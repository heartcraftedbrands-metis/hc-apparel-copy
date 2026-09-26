import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock3, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { getPublicProductName } from '@/lib/productDisplayName';
import { useCustomerPricing } from '@/lib/useCustomerPricing';

const money = value => `$${Number(value).toFixed(2)}`;
const productUrl = item => `/ProductDetail?id=${encodeURIComponent(item.product_id)}`;

function PriceAndAction({ item, isAuthenticated, large = false }) {
  return (
    <div className={large ? 'rounded-2xl border border-[#dac27d] bg-[#fffaf0] p-5 sm:p-6' : ''}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6a735c]">HC Apparel Customer Price</p>
      <p className={`mt-1 font-black tracking-tight text-[#26351f] ${large ? 'text-4xl sm:text-5xl' : 'text-3xl'}`}>{money(item.price)}</p>
      {!isAuthenticated && <p className="mt-2 max-w-sm text-xs leading-relaxed text-[#586251]">Sign in or create an account to get this price.</p>}
      <Link to={productUrl(item)} className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d89a00] font-black text-[#182312] shadow-md transition hover:-translate-y-0.5 hover:bg-[#efb11a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#26351f] ${large ? 'px-7 py-4 text-base' : 'px-5 py-3 text-sm'}`}>
        Shop Deal <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function Spotlight({ item, isAuthenticated }) {
  const name = getPublicProductName(item);
  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-white/15 bg-white shadow-2xl lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <Link to={productUrl(item)} className="group relative block min-h-[340px] overflow-hidden bg-gradient-to-br from-[#f9f7f0] via-white to-[#e4ddc9] sm:min-h-[460px] lg:min-h-[540px]">
        <div className="absolute left-5 top-5 z-10 rounded-full bg-[#c9232d] px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white shadow-lg sm:left-7 sm:top-7">Limited-time S&amp;S sale</div>
        <img src={item.image_url} alt={name} className="absolute inset-0 h-full w-full object-contain p-8 transition duration-500 group-hover:scale-[1.03] sm:p-12 lg:p-14" loading="eager" />
      </Link>
      <div className="flex flex-col justify-center bg-white p-6 sm:p-9 lg:p-12">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9d7b35]">{item.brand} · Style {item.style_number}</p>
        <h3 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight text-[#26351f] sm:text-4xl lg:text-[2.75rem]">{name}</h3>
        <p className="mt-4 text-base leading-relaxed text-[#586251]">{item.subtitle || 'A current S&S sale style available through HC Apparel while supplies last.'}</p>
        <div className="mt-6"><PriceAndAction item={item} isAuthenticated={isAuthenticated} large /></div>
        <div className="mt-5 grid gap-3 text-sm text-[#34472c] sm:grid-cols-2">
          <p className="flex items-center gap-2 rounded-xl bg-[#f6f3e9] px-4 py-3 font-bold"><Clock3 className="h-4 w-4 text-[#b48200]" /> While supplies last</p>
          <p className="flex items-center gap-2 rounded-xl bg-[#f6f3e9] px-4 py-3 font-bold"><Sparkles className="h-4 w-4 text-[#b48200]" /> Available now</p>
        </div>
      </div>
    </article>
  );
}

export default function SpecialsSection() {
  const { isAuthenticated } = useCustomerPricing();
  const [activeSlide, setActiveSlide] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef(null);
  const resumeTimer = useRef(null);
  const { data: specials = [] } = useQuery({
    queryKey: ['storefront-homepage-specials'],
    queryFn: async () => {
      const { data, error } = await supabase.from('storefront_homepage_specials')
        .select('id,product_id,sku,brand,style_number,name,subtitle,category,image_url,price,badge,promotion_slot,display_order')
        .order('display_order', { ascending: true }).limit(6);
      if (error) throw error;
      return data || [];
    },
  });

  const slideCount = specials.length;
  const hasCarousel = slideCount > 1;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (activeSlide >= slideCount) setActiveSlide(0);
  }, [activeSlide, slideCount]);

  useEffect(() => {
    if (!hasCarousel || hovered || interactionPaused || reducedMotion) return undefined;
    const timer = window.setInterval(() => setActiveSlide(current => (current + 1) % slideCount), 5500);
    return () => window.clearInterval(timer);
  }, [hasCarousel, hovered, interactionPaused, reducedMotion, slideCount]);

  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  const pauseAfterInteraction = () => {
    setInteractionPaused(true);
    window.clearTimeout(resumeTimer.current);
    if (!reducedMotion) resumeTimer.current = window.setTimeout(() => setInteractionPaused(false), 10000);
  };
  const showSlide = index => {
    setActiveSlide((index + slideCount) % slideCount);
    pauseAfterInteraction();
  };
  const handleKeyDown = event => {
    if (!hasCarousel || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    showSlide(activeSlide + (event.key === 'ArrowRight' ? 1 : -1));
  };
  const handleTouchStart = event => { touchStart.current = event.touches[0]?.clientX ?? null; };
  const handleTouchEnd = event => {
    const end = event.changedTouches[0]?.clientX;
    if (touchStart.current !== null && Number.isFinite(end) && Math.abs(end - touchStart.current) > 45) {
      showSlide(activeSlide + (end < touchStart.current ? 1 : -1));
    }
    touchStart.current = null;
  };

  if (!specials.length) return null;
  const activeItem = specials[activeSlide] || specials[0];

  return (
    <section
      className="relative overflow-hidden bg-[#26351f] py-12 text-white md:py-16"
      aria-labelledby="homepage-specials-title"
      aria-roledescription={hasCarousel ? 'carousel' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false); }}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 15% 10%, white 0 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      <div className="container relative mx-auto px-4">
        <div className="mb-7 max-w-3xl md:mb-9">
          <p className="mb-3 inline-flex rounded-full border border-[#efc85d]/50 bg-[#efc85d]/15 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#ffd973]">Limited-time S&amp;S sale picks</p>
          <h2 id="homepage-specials-title" className="text-3xl font-black leading-tight tracking-tight sm:text-4xl md:text-5xl">Catch These Deals Before They’re Gone</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">Special S&amp;S sale styles available through HC Apparel while supplies last.</p>
        </div>
        <div className="relative" aria-live="polite" aria-atomic="true">
          <p className="sr-only">Slide {activeSlide + 1} of {slideCount}: {getPublicProductName(activeItem)}</p>
          <div className="transition-opacity duration-500" role="group" aria-label={`Sale slide ${activeSlide + 1} of ${slideCount}`}>
            <Spotlight key={activeItem.id} item={activeItem} isAuthenticated={isAuthenticated} />
          </div>
          {hasCarousel && <>
            <button type="button" onClick={() => showSlide(activeSlide - 1)} aria-label="Previous sale product" className="absolute left-2 top-[38%] z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-[#26351f]/90 text-2xl font-black text-white shadow-lg transition hover:bg-[#34472c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd973] sm:left-4">&#8249;</button>
            <button type="button" onClick={() => showSlide(activeSlide + 1)} aria-label="Next sale product" className="absolute right-2 top-[38%] z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-[#26351f]/90 text-2xl font-black text-white shadow-lg transition hover:bg-[#34472c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd973] sm:right-4">&#8250;</button>
          </>}
        </div>
        {hasCarousel && <div className="mt-6 flex items-center justify-center gap-3" role="group" aria-label="Choose sale slide">
          {specials.map((item, index) => <button key={item.id} type="button" onClick={() => showSlide(index)} aria-label={`Show slide ${index + 1}: ${getPublicProductName(item)}`} aria-current={index === activeSlide ? 'true' : undefined} className={`h-3 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd973] ${index === activeSlide ? 'w-9 bg-[#ffd973]' : 'w-3 bg-white/45 hover:bg-white/75'}`} />)}
        </div>}
      </div>
    </section>
  );
}
