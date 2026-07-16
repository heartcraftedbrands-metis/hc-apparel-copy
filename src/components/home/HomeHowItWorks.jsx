import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ShoppingBag, Palette, CreditCard, CheckCircle2 } from 'lucide-react';

const STEPS = [
  {
    icon: ShoppingBag,
    number: '01',
    title: 'Choose your garment',
    desc: 'Browse our curated selection of quality blanks — tees, tanks, activewear, and more.',
  },
  {
    icon: Palette,
    number: '02',
    title: 'Pick color and size',
    desc: 'Select your preferred color, size, and quantity from available variants.',
  },
  {
    icon: CreditCard,
    number: '03',
    title: 'Checkout or request a custom print',
    desc: 'Buy direct or submit your artwork for a fully custom print order.',
  },
  {
    icon: CheckCircle2,
    number: '04',
    title: 'We review and prepare your order',
    desc: 'Our team reviews every order before fulfillment — no surprises.',
  },
];

export default function HomeHowItWorks() {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-black mb-2">How It Works</h2>
          <p className="text-muted-foreground text-sm">From browsing to delivery — simple every step</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {STEPS.map((step, i) => (
            <div key={i} className="bg-white rounded-2xl border border-border p-6 relative shadow-sm hover:shadow-md transition-shadow">
              <span className="absolute top-4 right-4 text-xs font-black text-primary/20 text-2xl leading-none">{step.number}</span>
              <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <step.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-bold text-sm mb-2">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link to="/ShopGarments">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8">
              Start Shopping
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}