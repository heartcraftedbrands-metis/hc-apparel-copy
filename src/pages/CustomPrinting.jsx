import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Printer, Layers, Shirt, Star, CheckCircle, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';

const PRINT_METHODS = [
  {
    icon: Printer,
    title: 'DTF Printing',
    subtitle: 'Direct-to-Film',
    desc: 'Vibrant full-color prints on virtually any fabric. No minimums, photo-realistic quality, flexible placement.',
    highlights: ['No color limits','Works on dark & light', 'Soft hand feel','Any quantity'],
    color: 'bg-primary',
  },
  {
    icon: Layers,
    title: 'Screen Printing',
    subtitle: 'Traditional Ink',
    desc: 'Bold, durable prints ideal for large runs. Best for spot colors with a classic, high-impact look.',
    highlights: ['Best for bulk orders','Ultra-durable ink','Vivid spot colors','Low per-unit cost'],
    color: 'bg-accent',
  },
  {
    icon: Star,
    title: 'Embroidery',
    subtitle: 'Stitched Logos',
    desc: 'Premium stitched logos and text for hats, polos, and corporate wear. Lasting professional quality.',
    highlights: ['Premium brand appeal','Hat & cap-ready','Polo & jacket logos','Lasts a lifetime'],
    color: 'bg-[hsl(255_40%_70%)]',
  },
  {
    icon: Shirt,
    title: 'Sublimation',
    subtitle: 'All-Over Print',
    desc: 'Edge-to-edge coverage on performance fabrics. Perfect for sportswear, jerseys, and custom team apparel.',
    highlights: ['All-over coverage','Sportswear & jerseys','Fade-resistant','Lightweight feel'],
    color: 'bg-secondary',
  },
];

const PROCESS_STEPS = [
  { step: '01', title: 'Choose the Right Request', desc: 'Use Request Order Help for 1–49 items, or submit a Bulk Quote for 50 or more.' },
  { step: '02', title: 'Approve Artwork & Proof', desc: 'We prep your artwork and send a digital proof for your approval before production.' },
  { step: '03', title: 'Production Begins', desc: 'Your order goes to our print partners. Typical turnaround is 5–10 business days.' },
  { step: '04', title: 'Shipped to You', desc: 'Your finished garments are packaged and shipped directly to your door.' },
];

export default function CustomPrinting() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <div className="bg-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Custom Printing Services</h1>
          <p className="text-primary-foreground/75 text-lg max-w-2xl mx-auto mb-8">
            From single pieces to bulk runs — use product Order Help for 1–49 items or a Bulk Quote for 50+.
          </p>
          <Link to="/RequestQuote">
            <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold px-8">
              <MessageSquare className="w-5 h-5 mr-2" /> Bulk Quote 50+
            </Button>
          </Link>
        </div>
      </div>

      {/* Print Methods */}
      <section className="py-16 container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-2">Print Methods We Offer</h2>
        <p className="text-muted-foreground text-center mb-10">Choose the right technique for your project</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PRINT_METHODS.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className={`${m.color} p-6 flex items-center justify-center`}>
                <m.icon className="w-10 h-10 text-white" />
              </div>
              <div className="p-5">
                <h3 className="font-bold text-lg">{m.title}</h3>
                <p className="text-xs text-muted-foreground mb-2">{m.subtitle}</p>
                <p className="text-sm text-muted-foreground mb-4">{m.desc}</p>
                <ul className="space-y-1">
                  {m.highlights.map((h, j) => (
                    <li key={j} className="flex items-center gap-2 text-xs text-foreground">
                      <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />{h}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Process */}
      <section className="bg-primary/5 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-10">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {PROCESS_STEPS.map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center mx-auto mb-4">{s.step}</div>
                <h3 className="font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Start Your Order?</h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">For 1–49 items, choose a garment and use Request Order Help. For 50+, start a bulk quote.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/RequestQuote">
            <Button size="lg" className="bg-primary text-primary-foreground font-bold px-10">Bulk Quote 50+</Button>
          </Link>
          <Link to="/ShopGarments">
            <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground px-10">Browse Garments</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
