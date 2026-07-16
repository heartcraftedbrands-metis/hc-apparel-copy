import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Printer, Layers, Star, Shirt, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const OPTIONS = [
  { icon: Printer, label: 'DTF Printing', desc: 'Vibrant full-color prints, no minimums', color: 'text-primary' },
  { icon: Layers, label: 'Screen Print', desc: 'Bold ink for bulk orders', color: 'text-accent' },
  { icon: Star, label: 'Embroidery', desc: 'Stitched logos for pro appeal', color: 'text-[hsl(255_40%_65%)]' },
  { icon: Shirt, label: 'Sublimation', desc: 'All-over coverage on performance wear', color: 'text-secondary-foreground' },
];

export default function HomePrintOptions() {
  return (
    <section className="bg-primary text-primary-foreground py-16">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-10 gap-4">
          <div>
            <h2 className="text-3xl font-bold mb-1">Custom Print Options</h2>
            <p className="text-primary-foreground/70">We work with multiple print methods to match your vision</p>
          </div>
          <Link to="/CustomPrinting">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 font-semibold">
              Learn More <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {OPTIONS.map((o, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className="bg-primary-foreground/10 border border-primary-foreground/15 rounded-2xl p-6 text-center hover:bg-primary-foreground/15 transition-colors">
              <o.icon className={`w-10 h-10 mx-auto mb-3 ${o.color}`} />
              <h3 className="font-bold mb-1">{o.label}</h3>
              <p className="text-primary-foreground/65 text-xs">{o.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}