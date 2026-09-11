import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

import CatalogEditorialImage from './CatalogEditorialImage';
import { getCatalogProductImage, selectBrandProduct } from '@/lib/homeCatalogImages';

const FEATURED_BRANDS = [
  {
    name: 'Columbia',
    description: 'Outdoor-ready fleece, jackets and cold-weather essentials with a technical edge.',
    href: '/ShopGarments?brand=columbia',
    eyebrow: 'Outdoor layers',
  },
  {
    name: 'Shaka Wear',
    description: 'Heavyweight streetwear blanks with structure, presence and an unmistakable fit.',
    href: '/ShopGarments?brand=shaka_wear',
    eyebrow: 'Heavyweight icons',
  },
  {
    name: 'Champion',
    description: 'Athletic fleece, hoodies and everyday essentials rooted in sport heritage.',
    href: '/ShopGarments?brand=champion',
    eyebrow: 'Sport heritage',
  },
];

export default function HomeFeaturedBrands({ products = [] }) {
  const brands = useMemo(() => FEATURED_BRANDS.map(brand => ({
    ...brand,
    product: selectBrandProduct(products, brand.name),
  })), [products]);

  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-[#263518] py-20 text-[#f8f4ee] sm:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(232,169,16,0.17),transparent_32%),linear-gradient(120deg,rgba(255,255,255,0.025),transparent_45%)]" />
      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="mb-10 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-accent">Featured Blank Collections</p>
            <h2 className="text-3xl font-black tracking-[-0.035em] sm:text-4xl lg:text-5xl">Shop Trusted Apparel Brands</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-white/65 md:text-right">
            Start with a quality blank, then add custom printing when you need it.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {brands.map(brand => (
            <Link
              key={brand.name}
              to={brand.href}
              className="group overflow-hidden rounded-[1.5rem] border border-white/15 bg-[#f3eee2] text-foreground shadow-[0_24px_60px_-35px_rgba(0,0,0,0.9)] transition duration-500 hover:-translate-y-1.5 hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-primary"
            >
              <div className="relative aspect-[5/4] overflow-hidden border-b border-black/5">
                <CatalogEditorialImage
                  src={getCatalogProductImage(brand.product)}
                  alt={`${brand.name} apparel blanks from the HC Apparel catalog`}
                  className="object-contain p-3 transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#263518]/20 to-transparent" />
              </div>
              <div className="p-6 sm:p-7">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-primary/70">{brand.eyebrow}</p>
                <h3 className="mb-3 text-2xl font-black tracking-[-0.03em] group-hover:text-primary">{brand.name}</h3>
                <p className="min-h-[60px] text-sm leading-6 text-muted-foreground">{brand.description}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary">
                  Shop {brand.name} Blanks
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
