import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const CATEGORIES = [
  {
    label: 'T-Shirts',
    desc: 'Classic crews, pocket tees, ring-spun basics',
    emoji: '👕',
    link: '/ShopGarments?type=t_shirts',
    bg: 'bg-primary/5',
  },
  {
    label: 'Tank Tops',
    desc: 'Lightweight styles for warm weather and gyms',
    emoji: '🎽',
    link: '/ShopGarments?type=t_shirts',
    bg: 'bg-accent/10',
  },
  {
    label: "Women's Styles",
    desc: 'Fitted cuts and feminine silhouettes',
    emoji: '✨',
    link: '/ShopGarments?type=t_shirts',
    bg: 'bg-secondary/20',
  },
  {
    label: 'Sports / Activewear',
    desc: 'Performance fabrics for teams and athletes',
    emoji: '⚡',
    link: '/ShopGarments?type=t_shirts',
    bg: 'bg-primary/5',
  },
  {
    label: 'Custom Printing',
    desc: 'DTF, DTG, screen print & more on your garment',
    emoji: '🖨️',
    link: '/CustomPrinting',
    bg: 'bg-accent/10',
  },
  {
    label: 'Bulk Orders',
    desc: 'Team, event, or brand orders — any quantity',
    emoji: '📦',
    link: '/RequestQuote',
    bg: 'bg-secondary/20',
  },
];

export default function HomeFeaturedCategories() {
  return (
    <section className="py-14 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-black mb-2">Browse by Category</h2>
          <p className="text-muted-foreground text-sm">Quality blanks and custom print options for every use case</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.label}
              to={cat.link}
              className={`group rounded-2xl border border-border ${cat.bg} hover:border-primary/40 hover:shadow-md transition-all duration-200 p-5 flex flex-col`}
            >
              <span className="text-3xl mb-3">{cat.emoji}</span>
              <h3 className="font-bold text-sm mb-1 group-hover:text-primary transition-colors">{cat.label}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed flex-1">{cat.desc}</p>
              <div className="flex items-center gap-1 mt-3 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Browse <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}