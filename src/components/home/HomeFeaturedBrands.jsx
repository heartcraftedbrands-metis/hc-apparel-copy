import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const FEATURED_BRANDS = [
  {
    name: 'Columbia',
    description: 'Outdoor-ready blanks, fleece, jackets, and cold-weather essentials.',
    href: '/ShopGarments?brand=columbia',
  },
  {
    name: 'Shaka Wear',
    description: 'Heavyweight streetwear blanks for bold custom looks.',
    href: '/ShopGarments?brand=shaka_wear',
  },
  {
    name: 'Champion',
    description: 'Athletic blanks, fleece, hoodies, and everyday essentials.',
    href: '/ShopGarments?brand=champion',
  },
];

export default function HomeFeaturedBrands() {
  return (
    <section className="border-y border-border bg-muted/30 py-14">
      <div className="container mx-auto px-4">
        <div className="mb-9 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Featured Blank Collections</p>
          <h2 className="text-2xl font-black md:text-3xl">Shop Trusted Apparel Brands</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start with a quality blank, then add custom printing when you need it.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {FEATURED_BRANDS.map(brand => (
            <Link
              key={brand.name}
              to={brand.href}
              className="group rounded-2xl border border-border bg-background p-6 transition-all hover:border-primary/40 hover:shadow-md"
            >
              <h3 className="mb-2 text-lg font-black group-hover:text-primary">{brand.name}</h3>
              <p className="min-h-12 text-sm leading-relaxed text-muted-foreground">{brand.description}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                Shop {brand.name} blanks <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
