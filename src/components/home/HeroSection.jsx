import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function HeroSection() {
  return (
    <section className="relative bg-primary text-primary-foreground overflow-hidden">
      {/* Texture overlay */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '24px 24px'
      }} />

      <div className="relative container mx-auto px-4 py-20 md:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block text-accent text-sm font-bold uppercase tracking-widest mb-4 border border-accent/40 px-4 py-1.5 rounded-full">
              DTF & PNG Ready
            </span>
          </motion.div>

          <motion.h1
            className="text-4xl md:text-6xl font-black leading-tight mb-6"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Digital Apparel Designs<br />
            <span className="text-accent">Made for Creators</span>
          </motion.h1>

          <motion.p
            className="text-lg text-primary-foreground/75 max-w-xl mx-auto mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Professional halftone, full-tone, and seasonal artwork files built for DTF printers, apparel decorators, and custom shop owners.
          </motion.p>

          <motion.div
            className="flex flex-wrap justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Link
              to="/Shop"
              className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-8 py-3.5 rounded-xl hover:bg-accent/90 transition-colors"
            >
              Shop All Designs <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/Bundles"
              className="inline-flex items-center gap-2 border border-primary-foreground/30 text-primary-foreground font-semibold px-8 py-3.5 rounded-xl hover:bg-primary-foreground/10 transition-colors"
            >
              View Bundles
            </Link>
          </motion.div>
        </div>

        {/* Stats strip */}
        <motion.div
          className="mt-16 grid grid-cols-3 gap-4 max-w-2xl mx-auto text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {[
            ['Instant', 'Download'],
            ['PNG & DTF', 'Ready Files'],
            ['Commercial', 'License Included'],
          ].map(([top, bottom]) => (
            <div key={top} className="border border-primary-foreground/20 rounded-xl py-4 px-2">
              <p className="font-bold text-accent text-sm">{top}</p>
              <p className="text-primary-foreground/60 text-xs mt-0.5">{bottom}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}