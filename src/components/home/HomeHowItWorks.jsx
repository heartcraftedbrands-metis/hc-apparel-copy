import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { ShoppingBag, Palette, CreditCard, CheckCircle2, ArrowRight } from 'lucide-react';

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
    <section className="bg-[#f8f4ee] py-20 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-primary">Simple by design</p>
          <h2 className="mb-3 text-3xl font-black tracking-[-0.035em] md:text-5xl">How It Works</h2>
          <p className="text-sm text-muted-foreground">From browsing to delivery — clear at every step.</p>
        </div>
        <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(step => (
            <div key={step.number} className="relative rounded-[1.25rem] border border-[#ded5c4] bg-white/75 p-6 shadow-[0_18px_45px_-35px_rgba(31,43,21,0.65)] transition duration-300 hover:-translate-y-1 hover:border-primary/35">
              <span className="absolute right-5 top-5 text-3xl font-black leading-none text-primary/15">{step.number}</span>
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <step.icon className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <h3 className="mb-2 text-sm font-black">{step.title}</h3>
              <p className="text-xs leading-5 text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link to="/ShopGarments" className="inline-flex">
            <Button className="gap-2 rounded-full bg-primary px-8 font-bold text-primary-foreground hover:bg-primary/90">
              Start Shopping <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
