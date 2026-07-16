import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ArrowRight } from 'lucide-react';

export default function HomeCTA() {
  return (
    <section className="bg-primary text-primary-foreground py-20">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-black mb-4">
          Ready to build your brand?
        </h2>
        <p className="text-primary-foreground/75 text-lg mb-10 max-w-xl mx-auto">
          Browse our full garment catalog or reach out for a custom quote. We're here to help you look and feel premium.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/ShopGarments">
            <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold px-10 text-base gap-2">
              Shop Now <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <Link to="/CustomPrinting">
            <Button size="lg" variant="outline" className="border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 px-10 text-base">
              Custom Printing
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}