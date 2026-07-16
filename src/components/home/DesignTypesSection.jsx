import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function DesignTypesSection() {
  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-accent text-sm font-bold uppercase tracking-widest mb-1">Know Your Designs</p>
          <h2 className="text-3xl font-black text-foreground">Halftone vs. Full-Tone</h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto text-sm">
            Understanding the difference helps you choose the right file for your print method and aesthetic.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Halftone */}
          <motion.div
            className="bg-primary text-primary-foreground rounded-2xl p-8"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mb-5">
              <span className="text-2xl">🔵</span>
            </div>
            <h3 className="text-xl font-bold mb-3">Halftone Designs</h3>
            <p className="text-primary-foreground/75 text-sm leading-relaxed mb-4">
              Halftone printing uses a pattern of small dots to simulate gradients, shadows, and photo-realistic detail. Our halftone PNGs are pre-screened and DTF-ready — no additional processing needed.
            </p>
            <ul className="space-y-2 text-sm">
              {['Classic vintage & retro looks','Works great on light & dark shirts','Dot-pattern gradients & shading','Pre-screened — ready for RIP'].map(item => (
                <li key={item} className="flex items-center gap-2 text-primary-foreground/80">
                  <span className="text-accent">✓</span> {item}
                </li>
              ))}
            </ul>
            <Link
              to="/Shop?category=halftone_packs"
              className="inline-block mt-6 bg-accent text-accent-foreground text-sm font-bold px-5 py-2 rounded-lg hover:bg-accent/90 transition-colors"
            >
              Shop Halftone →
            </Link>
          </motion.div>

          {/* Full-Tone */}
          <motion.div
            className="bg-secondary rounded-2xl p-8 border"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-5">
              <span className="text-2xl">🎨</span>
            </div>
            <h3 className="text-xl font-bold mb-3">Full-Tone / Distressed</h3>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Full-tone designs use solid colors with distressed, vintage, or textured effects. These files produce bold, high-contrast prints that look especially striking on dark garments.
            </p>
            <ul className="space-y-2 text-sm">
              {['Bold, high-contrast output','Aged & worn aesthetic','Best on dark garments','Minimal ink coverage — cost-efficient'].map(item => (
                <li key={item} className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-primary font-bold">✓</span> {item}
                </li>
              ))}
            </ul>
            <Link
              to="/Shop?category=distressed_packs"
              className="inline-block mt-6 bg-primary text-primary-foreground text-sm font-bold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              Shop Full-Tone →
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}