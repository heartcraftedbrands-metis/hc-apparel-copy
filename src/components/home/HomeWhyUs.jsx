import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Shield, Printer, ClipboardCheck, Heart, ArrowRight } from 'lucide-react';

const TRUST = [
  { icon: Shield, title: 'Quality blanks', desc: 'Curated from trusted suppliers — ring-spun cotton, performance fabrics, and more.' },
  { icon: Printer, title: 'Custom print support', desc: 'DTF, DTG, screen print — bring your own artwork or we can help.' },
  { icon: ClipboardCheck, title: 'Order review before fulfillment', desc: 'Every order is reviewed by our team before it ships.' },
  { icon: Heart, title: 'Local brand service', desc: 'Real people, real care — not a faceless warehouse operation.' },
];

export default function HomeWhyUs() {
  return (
    <section className="py-16 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-black mb-3">Why work with HC Apparel?</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              We're not just a print shop — we're a garment partner that takes your order seriously from first click to delivery.
            </p>
            <div className="space-y-5">
              {TRUST.map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm mb-0.5">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA card */}
          <div className="bg-primary text-primary-foreground rounded-3xl p-8 md:p-10">
            <p className="text-primary-foreground/60 text-sm font-semibold uppercase tracking-wider mb-3">Custom Printing</p>
            <h3 className="text-2xl md:text-3xl font-black mb-4 leading-tight">
              Need your design printed?
            </h3>
            <p className="text-primary-foreground/80 text-sm leading-relaxed mb-8">
              For 1–49 items, choose a product and use Request Order Help. For 50 or more, start a bulk quote.
            </p>
            <Link to="/RequestQuote">
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold gap-2 px-6">
                Bulk Quote 50+ <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
