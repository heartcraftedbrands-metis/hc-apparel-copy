import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export default function SoftLaunchBanner() {
  return (
    <div className="bg-gradient-to-r from-primary/95 via-primary to-primary/90 text-primary-foreground border-b-2 border-accent/30">
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-6 h-6 flex-shrink-0 mt-0.5 text-accent" />
            <div className="flex-1">
              <h2 className="text-lg md:text-xl font-bold mb-1">HC Apparel Soft Launch Is Open</h2>
              <p className="text-primary-foreground/85 text-sm md:text-base">
                Browse garment blanks, choose your style, and request order help. We'll confirm availability, pricing, and next steps before production.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link to="/ShopGarments">
              <Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold">
                Shop Garments
              </Button>
            </Link>
            <Link to="/RequestQuote">
              <Button size="sm" variant="outline" className="border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-semibold">
                Bulk Quote 50+
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
