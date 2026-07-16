import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const FAQS = [
  {
    q: 'What file formats do I receive?',
    a: 'All designs are delivered as high-resolution PNG files (300 DPI or higher). DTF-ready files are sized and formatted for standard gang sheets. You will receive a download link immediately after purchase.',
  },
  {
    q: 'What is a Halftone design vs. a Full-Tone design?',
    a: 'Halftone designs use a dot-pattern printing technique that simulates gradients and shading using small dots — ideal for vintage and screenprint aesthetics on DTF. Full-Tone (distressed) designs use solid colors with distressed textures, giving an aged, worn look. Both are print-ready PNG files.',
  },
  {
    q: 'Can I use these for DTF printing?',
    a: 'Yes! All HC Apparel designs are optimized specifically for DTF (Direct-to-Film) transfers. Simply load the PNG into your RIP software, print your transfer, and press onto your garment.',
  },
  {
    q: 'Can I resell the design files?',
    a: 'No. You may NOT resell, share, or redistribute the digital files themselves. You CAN print the designs on garments and sell the finished apparel. See our full License Information page for details.',
  },
  {
    q: 'Do I need special software?',
    a: 'For DTF printing you\'ll need RIP software compatible with your printer. For general use the PNG files open in any image viewer or editor. No special software is required to download or use the files.',
  },
  {
    q: 'Can I use these for screen printing?',
    a: 'Screen printing requires film separations and specific setups not included with our files. Our designs are optimized for DTF. Contact us if you need screen-printing-specific files.',
  },
  {
    q: 'What sizes are the files?',
    a: 'Most single designs are delivered at 12"×12" at 300 DPI. Bundle packs may contain designs at varying sizes. Exact dimensions are listed on each product page.',
  },
  {
    q: 'How do I download after purchasing?',
    a: 'After a successful payment, you will receive an order confirmation email with a download link. You can also access your download from your order history in the shop. Downloads are available for 30 days.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'Because these are digital downloads, all sales are final once the file has been downloaded. If you experience a technical issue with your file, contact us within 7 days and we will make it right.',
  },
  {
    q: 'Can I request a custom design?',
    a: 'Yes! We do accept custom design requests. Reach out through our Contact page with your concept and we\'ll provide a quote. Turnaround is typically 3–5 business days.',
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left flex items-start justify-between gap-4 py-5 px-1"
      >
        <span className="font-semibold text-foreground text-sm leading-snug">{q}</span>
        {open ? <ChevronUp className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="pb-5 px-1 text-sm text-muted-foreground leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQ() {
  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-14">
        <div className="container mx-auto px-4 text-center">
          <HelpCircle className="w-12 h-12 mx-auto mb-4 text-accent" />
          <h1 className="text-4xl font-bold mb-3">Frequently Asked Questions</h1>
          <p className="text-primary-foreground/75 max-w-xl mx-auto">
            Everything you need to know about HC Apparel digital designs.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="bg-white rounded-2xl border p-6 mb-10">
          {FAQS.map((faq) => (
            <FAQItem key={faq.q} {...faq} />
          ))}
        </div>

        {/* Still have questions */}
        <div className="bg-primary/5 rounded-2xl border border-primary/20 p-8 text-center">
          <HelpCircle className="w-10 h-10 text-primary mx-auto mb-3" />
          <h3 className="font-bold text-lg mb-2">Still have a question?</h3>
          <p className="text-muted-foreground text-sm mb-5">
            Can't find what you're looking for? Our support team is happy to help.
          </p>
          <Link
            to="/Contact"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            <Mail className="w-4 h-4" /> Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}