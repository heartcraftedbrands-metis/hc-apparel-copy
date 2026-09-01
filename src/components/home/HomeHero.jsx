import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MessageSquare } from 'lucide-react';

import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { getProductBrand } from '@/lib/shopGarmentFilters';
import { isPublicProduct } from '@/lib/productVisibility';
import { brandFilterValue } from '@/lib/ssBrands';

const HERO_BRANDS = ['Columbia', 'Shaka Wear', 'Champion'];

function isUsableImage(value) {
  return typeof value === 'string'
    && /^https?:\/\//i.test(value)
    && !/(placeholder|no[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)/i.test(value);
}

function firstImageFrom(value) {
  if (!Array.isArray(value)) return '';
  for (const item of value) {
    const candidate = typeof item === 'string'
      ? item
      : item?.image_url || item?.url || item?.src || '';
    if (isUsableImage(candidate)) return candidate;
  }
  return '';
}

export function getHeroProductImage(product) {
  if (isUsableImage(product?.image_url)) return product.image_url;
  return firstImageFrom(product?.mockup_images) || firstImageFrom(product?.size_prices);
}

function normalizeBrand(value) {
  return String(value || '').trim().toLowerCase();
}

function FeaturedBrandCard({ brand, product }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = getHeroProductImage(product);
  const href = `/ShopGarments?brand=${brandFilterValue(brand)}`;
  const showImage = imageUrl && !imageFailed;

  return (
    <Link
      to={href}
      aria-label={`Shop ${brand} Blanks`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/80 bg-white shadow-lg transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[4/5] min-h-0 w-full overflow-hidden bg-gradient-to-b from-white to-[#ece7db]">
        {showImage ? (
          <img
            src={imageUrl}
            alt={`${brand} apparel blanks`}
            className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
            loading={brand === 'Columbia' ? 'eager' : 'lazy'}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#f9f7f0] via-white to-[#e4ddc9] px-3 text-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.14em] text-primary sm:text-base">{brand}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Featured blanks
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="flex min-h-[94px] flex-1 flex-col items-center justify-between gap-2 border-t bg-white px-2 py-3 text-center">
        <p className="text-sm font-black leading-tight text-foreground">{brand}</p>
        <span className="inline-flex max-w-full items-center justify-center gap-1 rounded-md bg-primary px-2.5 py-2 text-[11px] font-bold leading-tight text-primary-foreground sm:text-xs">
          Shop {brand} Blanks <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </span>
      </div>
    </Link>
  );
}

export default function HomeHero() {
  const { data: products = [] } = useQuery({
    queryKey: ['home-hero-products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date'),
  });

  const publicProducts = products.filter(product => product?.is_active !== false && isPublicProduct(product));
  const heroProducts = new Map(HERO_BRANDS.map(brand => {
    const product = publicProducts.find(item => (
      normalizeBrand(getProductBrand(item)) === normalizeBrand(brand)
      && getHeroProductImage(item)
    ));
    return [brand, product || null];
  }));

  return (
    <section className="relative w-full max-w-full overflow-hidden bg-primary text-primary-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)',
          backgroundSize: '12px 12px',
        }}
      />

      <div className="relative z-10 grid w-full min-w-0 grid-cols-1 lg:min-h-[600px] lg:grid-cols-2">
        <div className="flex min-w-0 items-center px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20 xl:px-16 2xl:px-20">
          <div className="w-full min-w-0 max-w-2xl">
            <span className="mb-6 inline-block max-w-full rounded-full bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-accent-foreground">
              Affordable Brand-Name Blanks
            </span>
            <h1 className="mb-5 break-words text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-5xl xl:text-6xl">
              Affordable Apparel Blanks for Brands, Teams &amp; Creators
            </h1>
            <p className="mb-5 max-w-xl text-base leading-relaxed text-primary-foreground/80 sm:text-lg">
              Shop brand-name blanks for creators, brands, families, teams, and businesses — with custom printing available when you’re ready.
            </p>
            <p className="mb-8 max-w-xl text-sm text-primary-foreground/70 sm:mb-10">
              Need printing too? Upload your artwork and customize your order before checkout.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:gap-4">
              <Button asChild size="lg" className="w-full gap-2 bg-accent px-6 text-base font-bold text-accent-foreground hover:bg-accent/90 sm:w-auto sm:px-8">
                <Link to="/ShopGarments">
                  Shop Blanks <ArrowRight className="h-5 w-5 shrink-0" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full gap-2 border-white/50 bg-white/10 px-6 text-base font-semibold text-white hover:bg-white/20 hover:text-white sm:w-auto sm:px-8">
                <Link to="/RequestQuote">
                  <MessageSquare className="h-5 w-5 shrink-0" /> Bulk Quote 50+
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div
          data-testid="hero-visual-panel"
          className="relative min-w-0 overflow-hidden border-t border-white/15 bg-[#f3efe4] px-4 pb-8 pt-20 text-foreground sm:px-8 sm:pb-10 lg:flex lg:min-h-full lg:items-center lg:border-l lg:border-t-0 lg:px-6 lg:pb-12 lg:pt-20 xl:px-10"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,180,0,0.35),transparent_48%),linear-gradient(145deg,rgba(255,255,255,0.9),rgba(233,226,205,0.8))]" />
          <div className="relative grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-3 lg:gap-3 xl:gap-5">
            {HERO_BRANDS.map(brand => (
              <FeaturedBrandCard key={brand} brand={brand} product={heroProducts.get(brand)} />
            ))}
          </div>
          <div className="absolute left-4 top-6 max-w-[calc(100%-2rem)] rounded-full bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow sm:left-8 lg:left-6 xl:left-10">
            Featured collections
          </div>
        </div>
      </div>

      <div className="h-1.5 w-full bg-gradient-to-r from-accent/60 via-accent to-accent/60" />
    </section>
  );
}
