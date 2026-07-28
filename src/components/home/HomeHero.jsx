import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageSquare } from 'lucide-react';

export default function HomeHero() {
  return (
    <section className="relative bg-primary text-primary-foreground overflow-hidden">
      {/* Subtle texture */}
      <div className="absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }} />

      <div className="container mx-auto px-4 py-20 md:py-28 relative z-10">
        <div className="max-w-2xl">
          <span className="inline-block bg-accent text-accent-foreground text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-6">
            Affordable Brand-Name Blanks
          </span>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-5 tracking-tight">
            Affordable Apparel Blanks for Brands, Teams &amp; Creators
          </h1>
          <p className="text-lg text-primary-foreground/80 mb-5 max-w-xl leading-relaxed">
            Shop brand-name blanks for creators, brands, families, teams, and businesses — with custom printing available when you’re ready.
          </p>
          <p className="mb-10 max-w-xl text-sm text-primary-foreground/70">
            Need printing too? Upload your artwork and customize your order before checkout.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link to="/ShopGarments">
              <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold px-8 text-base gap-2">
                Shop Blanks <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/RequestQuote">
              <Button size="lg" variant="outline" className="border-white/50 text-white bg-white/10 hover:bg-white/20 px-8 text-base gap-2 font-semibold">
                <MessageSquare className="w-5 h-5" /> Bulk Quote 50+
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="h-1.5 bg-gradient-to-r from-accent/60 via-accent to-accent/60" />
    </section>
  );
}
