import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MessageSquare } from 'lucide-react';

import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { getProductBrand } from '@/lib/shopGarmentFilters';

const HERO_BRANDS = ['Columbia', 'Shaka Wear', 'Champion'];

export default function HomeHero() {
  const { data: products = [] } = useQuery({
    queryKey: ['home-hero-products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, '-created_date'),
  });
  const heroProducts = HERO_BRANDS.map(brand => (
    products.find(product => (
      getProductBrand(product).toLowerCase() === brand.toLowerCase()
      && product.image_url
    ))
  )).filter(Boolean);

  return (
    <section className="relative w-full overflow-hidden bg-primary text-primary-foreground">
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)',
          backgroundSize: '12px 12px',
        }}
      />

      <div className="relative z-10 grid min-h-[580px] md:grid-cols-2">
        <div className="flex items-center px-6 py-16 sm:px-10 md:px-12 lg:px-[max(3rem,calc((100vw-1280px)/2))] lg:pr-14">
          <div className="max-w-xl">
            <span className="mb-6 inline-block rounded-full bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-accent-foreground">
              Affordable Brand-Name Blanks
            </span>
            <h1 className="mb-5 text-4xl font-black leading-tight tracking-tight md:text-5xl">
              Affordable Apparel Blanks for Brands, Teams &amp; Creators
            </h1>
            <p className="mb-5 max-w-xl text-lg leading-relaxed text-primary-foreground/80">
              Shop brand-name blanks for creators, brands, families, teams, and businesses — with custom printing available when you’re ready.
            </p>
            <p className="mb-10 max-w-xl text-sm text-primary-foreground/70">
              Need printing too? Upload your artwork and customize your order before checkout.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link to="/ShopGarments">
                <Button size="lg" className="gap-2 bg-accent px-8 text-base font-bold text-accent-foreground hover:bg-accent/90">
                  Shop Blanks <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/RequestQuote">
                <Button size="lg" variant="outline" className="gap-2 border-white/50 bg-white/10 px-8 text-base font-semibold text-white hover:bg-white/20">
                  <MessageSquare className="h-5 w-5" /> Bulk Quote 50+
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div
          data-testid="hero-visual-panel"
          className="relative flex min-h-[420px] items-end overflow-hidden border-t border-white/15 bg-[#f3efe4] p-6 text-foreground md:min-h-full md:border-l md:border-t-0 md:p-10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,180,0,0.35),transparent_48%),linear-gradient(145deg,rgba(255,255,255,0.9),rgba(233,226,205,0.8))]" />
          <div className="relative grid h-full w-full grid-cols-3 items-end gap-3">
            {HERO_BRANDS.map((brand, index) => {
              const product = heroProducts.find(item => getProductBrand(item) === brand);
              const brandValue = brand.toLowerCase().replace(/[^a-z0-9]+/g, '_');
              return (
                <Link
                  key={brand}
                  to={`/ShopGarments?brand=${brandValue}`}
                  className={`group relative overflow-hidden rounded-2xl border border-white/70 bg-white/85 shadow-xl ${
                    index === 1 ? 'mb-10' : index === 2 ? 'mb-4' : ''
                  }`}
                >
                  <div className="aspect-[3/5] bg-white">
                    {product?.image_url ? (
                      <img
                        src={product.image_url}
                        alt={`${brand} apparel blanks`}
                        className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-b from-white to-muted px-2 text-center text-xs font-bold uppercase tracking-wider text-primary">
                        {brand}
                      </div>
                    )}
                  </div>
                  <div className="border-t bg-white px-2 py-3 text-center">
                    <p className="text-xs font-black sm:text-sm">{brand}</p>
                    <p className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">Shop blanks</p>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="absolute left-6 top-6 rounded-full bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow md:left-10 md:top-10">
            Featured collections
          </div>
        </div>
      </div>

      <div className="h-1.5 bg-gradient-to-r from-accent/60 via-accent to-accent/60" />
    </section>
  );
}
