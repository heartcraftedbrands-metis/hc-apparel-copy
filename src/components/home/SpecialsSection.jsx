import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock3, Sparkles } from 'lucide-react';
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

function SaleCard({ item, isAuthenticated, eager }) {
  const name = getPublicProductName(item);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/15 bg-white shadow-xl">
      <Link to={productUrl(item)} className="group relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-[#f9f7f0] via-white to-[#e4ddc9]">
        <span className="absolute left-4 top-4 z-10 rounded-full bg-[#c9232d] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow">S&amp;S sale</span>
        <img src={item.image_url} alt={name} className="h-full w-full object-contain p-7 transition duration-500 group-hover:scale-105" loading={eager ? 'eager' : 'lazy'} />
      </Link>
      <div className="flex flex-1 flex-col p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9d7b35]">{item.brand} · {item.style_number}</p>
        <h3 className="mt-2 text-2xl font-black leading-tight text-[#26351f]">{name}</h3>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-[#586251]">{item.subtitle || 'Available through HC Apparel while supplies last.'}</p>
        <div className="mt-5"><PriceAndAction item={item} isAuthenticated={isAuthenticated} /></div>
      </div>
    </article>
  );
}

export default function SpecialsSection() {
  const { isAuthenticated } = useCustomerPricing();
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

  if (!specials.length) return null;
  const spotlight = specials.length < 3;

  return (
    <section className="relative overflow-hidden bg-[#26351f] py-12 text-white md:py-16" aria-labelledby="homepage-specials-title">
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 15% 10%, white 0 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      <div className="container relative mx-auto px-4">
        <div className="mb-7 max-w-3xl md:mb-9">
          <p className="mb-3 inline-flex rounded-full border border-[#efc85d]/50 bg-[#efc85d]/15 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#ffd973]">Limited-time S&amp;S sale picks</p>
          <h2 id="homepage-specials-title" className="text-3xl font-black leading-tight tracking-tight sm:text-4xl md:text-5xl">Catch These Deals Before They’re Gone</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">Special S&amp;S sale styles available through HC Apparel while supplies last.</p>
        </div>
        {spotlight ? (
          <div className={specials.length === 2 ? 'grid gap-6 lg:grid-cols-2' : ''}>
            {specials.map((item, index) => specials.length === 1
              ? <Spotlight key={item.id} item={item} isAuthenticated={isAuthenticated} />
              : <SaleCard key={item.id} item={item} isAuthenticated={isAuthenticated} eager={index === 0} />)}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {specials.map((item, index) => <SaleCard key={item.id} item={item} isAuthenticated={isAuthenticated} eager={index < 3} />)}
          </div>
        )}
      </div>
    </section>
  );
}
