import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

import CatalogEditorialImage from './CatalogEditorialImage';
import { getCatalogProductImage, selectCatalogProduct } from '@/lib/homeCatalogImages';

const CATEGORIES = [
  {
    label: 'T-Shirts',
    desc: 'Everyday crews, heavyweight tees and premium ring-spun staples.',
    link: '/ShopGarments?type=t_shirts',
    category: 't_shirts',
    preferredBrands: ['Bella + Canvas', 'Gildan', 'Comfort Colors', 'Shaka Wear'],
    layout: 'lg:col-span-8',
  },
  {
    label: 'Hoodies',
    desc: 'Layer-ready fleece and heavyweight streetwear silhouettes.',
    link: '/ShopGarments?type=hoodies',
    category: 'hoodies',
    preferredBrands: ['Champion', 'Gildan', 'Independent Trading Co', 'Lane Seven'],
    layout: 'lg:col-span-4',
  },
  {
    label: 'Fleece',
    desc: 'Warm layers with a polished, outdoor-minded finish.',
    link: '/ShopGarments?type=fleece',
    category: 'fleece',
    preferredBrands: ['Columbia', 'Champion'],
    layout: 'lg:col-span-4',
  },
  {
    label: 'Outerwear',
    desc: 'Jackets, vests and versatile layers built for changing conditions.',
    link: '/ShopGarments?type=outerwear',
    category: 'outerwear',
    preferredBrands: ['Columbia'],
    layout: 'lg:col-span-8',
  },
  {
    label: 'Tank Tops',
    desc: 'Easy sleeveless shapes for warm days, workouts and layering.',
    link: '/ShopGarments?type=tank_tops',
    category: 'tank_tops',
    preferredBrands: ['Shaka Wear', 'Bella + Canvas'],
    layout: 'lg:col-span-4',
  },
  {
    label: "Women's Styles",
    desc: 'Contemporary proportions and thoughtfully shaped everyday fits.',
    link: '/ShopGarments?type=womens',
    category: 'womens',
    preferredBrands: ['Bella + Canvas', 'Comfort Colors', 'American Apparel', 'Champion'],
    layout: 'lg:col-span-4',
  },
  {
    label: 'Sports / Activewear',
    desc: 'Performance-driven apparel for teams, training and movement.',
    link: '/ShopGarments?type=sportswear',
    category: 'sportswear',
    preferredBrands: ['Champion', 'adidas', 'Oakley'],
    layout: 'lg:col-span-4',
  },
  {
    label: 'Hats',
    desc: 'Caps and headwear that finish a uniform, team or brand kit.',
    link: '/ShopGarments?type=hats',
    category: 'hats',
    preferredBrands: ['Columbia', 'Oakley', 'Yupoong', 'Flexfit'],
    layout: 'lg:col-span-4',
  },
  {
    label: 'Bags',
    desc: 'Carry-ready styles for work, travel, events and everyday use.',
    link: '/ShopGarments?type=bags',
    category: 'bags',
    preferredBrands: ['Oakley'],
    layout: 'lg:col-span-4',
  },
  {
    label: 'Bulk Orders',
    desc: 'Coordinated apparel for teams, launches and events of 50 or more.',
    link: '/RequestQuote',
    category: 'all',
    preferredBrands: ['Gildan', 'Bella + Canvas', 'Champion'],
    layout: 'lg:col-span-4',
  },
  {
    label: 'Custom Printing',
    desc: 'Add DTF, DTG or screen print support when blanks need your mark.',
    link: '/CustomPrinting',
    category: 't_shirts',
    preferredBrands: ['Shaka Wear', 'Comfort Colors', 'Bella + Canvas'],
    layout: 'sm:col-span-2 lg:col-span-12',
    secondary: true,
  },
];

export default function HomeFeaturedCategories({ products = [] }) {
  const cards = useMemo(() => CATEGORIES.map(category => ({
    ...category,
    product: selectCatalogProduct(products, category),
  })), [products]);

  return (
    <section className="relative overflow-hidden bg-[#f4efe4] py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(232,169,16,0.10),transparent_26%),radial-gradient(circle_at_92%_88%,rgba(74,94,42,0.12),transparent_30%)]" />
      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="mb-10 grid items-end gap-5 md:grid-cols-[1fr_auto] md:gap-10">
          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-primary">The Blank Edit</p>
            <h2 className="text-4xl font-black leading-[0.95] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
              Browse by Category
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground md:text-right">
            Quality apparel blanks, curated by silhouette and purpose. Add custom printing only when the project calls for it.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[270px] lg:grid-cols-12">
          {cards.map((category, index) => (
            <Link
              key={category.label}
              to={category.link}
              aria-label={`Browse ${category.label}`}
              className={`group relative h-[360px] overflow-hidden rounded-[1.5rem] border border-white/70 bg-primary shadow-[0_18px_50px_-30px_rgba(31,43,21,0.7)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_26px_60px_-28px_rgba(31,43,21,0.82)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 sm:h-[320px] lg:h-full lg:min-h-[280px] ${category.layout}`}
            >
              <CatalogEditorialImage
                src={getCatalogProductImage(category.product)}
                alt={`${category.label} apparel from the HC Apparel catalog`}
                className="transition duration-700 group-hover:scale-[1.04]"
              />
              <div className={`absolute inset-0 ${category.secondary
                ? 'bg-gradient-to-r from-[#263518]/95 via-[#354523]/80 to-[#263518]/30'
                : 'bg-gradient-to-t from-[#1f2b15]/95 via-[#263518]/30 to-transparent'}`}
              />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 p-6 sm:p-7">
                <div className="max-w-xl text-[#f8f4ee]">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#e8a910]">
                    {category.secondary ? 'Optional print support' : `Edit ${String(index + 1).padStart(2, '0')}`}
                  </p>
                  <h3 className="text-2xl font-black leading-none tracking-[-0.025em] sm:text-3xl">{category.label}</h3>
                  <p className="mt-2 max-w-md text-xs leading-5 text-white/75 sm:text-sm">{category.desc}</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white backdrop-blur-sm transition duration-300 group-hover:border-accent group-hover:bg-accent group-hover:text-accent-foreground">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
