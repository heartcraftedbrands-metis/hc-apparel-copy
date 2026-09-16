import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { getPublicProductName } from '@/lib/productDisplayName';

const money = value => `$${Number(value).toFixed(2)}`;

export default function SpecialsSection() {
  const { data: specials = [] } = useQuery({
    queryKey: ['storefront-homepage-specials'],
    queryFn: async () => {
      const { data, error } = await supabase.from('storefront_homepage_specials')
        .select('id,product_id,sku,brand,name,subtitle,category,image_url,price,comparison_price,badge,display_order')
        .order('display_order', { ascending: true }).limit(6);
      if (error) throw error;
      return data || [];
    },
  });

  if (!specials.length) return null;
  const hasVendorSpecial = specials.some(item => item.badge === 'Special');

  return (
    <section className="bg-[#f6f3e9] py-14 md:py-20" aria-labelledby="homepage-specials-title">
      <div className="container mx-auto px-4">
        <div className="mb-8 max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-[#9d7b35]">HC Apparel</p>
          <h2 id="homepage-specials-title" className="text-3xl font-bold tracking-tight text-[#283820] md:text-4xl">
            {hasVendorSpecial ? 'Current Specials' : 'Current Picks'}
          </h2>
          <p className="mt-2 text-[#586251]">
            {hasVendorSpecial ? 'Real deals on blanks and printing-ready apparel.' : 'In-stock blanks and printing-ready apparel, selected from our catalog.'}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {specials.map(item => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-[#d9d4c4] bg-white shadow-sm sm:grid sm:grid-cols-[43%_1fr]">
              <Link to={`/ProductDetail?id=${encodeURIComponent(item.product_id)}`} className="block aspect-[4/3] overflow-hidden bg-[#f3f0e8] sm:aspect-auto">
                <img src={item.image_url} alt={getPublicProductName(item)} className="h-full w-full object-contain p-4" loading="lazy" />
              </Link>
              <div className="flex flex-col justify-center p-5 md:p-7">
                <span className="mb-3 w-fit rounded-full border border-[#d9bd75] bg-[#fbf3dd] px-3 py-1 text-xs font-semibold text-[#655021]">{item.badge}</span>
                <p className="text-xs font-bold uppercase tracking-widest text-[#6a735c]">{item.brand} · {String(item.category || 'Apparel blanks').replaceAll('_', ' ')}</p>
                <h3 className="mt-2 text-xl font-bold leading-tight text-[#26351f]">{getPublicProductName(item)}</h3>
                {item.subtitle && <p className="mt-2 text-sm text-[#586251]">{item.subtitle}</p>}
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="text-2xl font-extrabold text-[#26351f]">{money(item.price)}</span>
                  {item.badge === 'Special' && Number(item.comparison_price) > Number(item.price) && (
                    <span className="text-sm text-[#727b6e] line-through" aria-label={`Regular price ${money(item.comparison_price)}`}>{money(item.comparison_price)}</span>
                  )}
                </div>
                <Link to={`/ProductDetail?id=${encodeURIComponent(item.product_id)}`} className="mt-5 inline-flex w-fit items-center justify-center rounded-lg bg-[#34472c] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#253720]">Shop Blanks</Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
