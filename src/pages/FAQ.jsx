import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const FAQS = [
  {
    q: 'Can I order blank garments without printing?',
    a: 'Yes. Products marked as apparel blanks can be purchased without customization. Choose an available color and size, then add the blank garment to your cart.',
  },
  {
    q: 'How do I know whether a size or color is available?',
    a: 'Each product page shows current color and size options from our catalog. Select a color first to see the sizes currently available for that color.',
  },
  {
    q: 'Do you offer custom printing?',
    a: 'Yes. Use the Custom Printing page for smaller projects or request a bulk quote for larger team, business, event, or organization orders.',
  },
  {
    q: 'What artwork should I provide for custom printing?',
    a: 'A high-resolution PNG with a transparent background or a clean vector file is preferred. If you are unsure whether your artwork is ready, send it through the quote or contact form and our team will review it.',
  },
  {
    q: 'How is shipping calculated?',
    a: 'Shipping is calculated before payment based on the items in your cart, their fulfillment source, and your delivery address. The full shipping amount is shown before checkout.',
  },
  {
    q: 'Can I track my order?',
    a: 'Yes. Use the Track Order page with the order information provided at checkout. Tracking details appear after the carrier has accepted the shipment.',
  },
  {
    q: 'Do you offer bulk pricing?',
    a: 'Yes. For orders of 50 or more garments, use the Bulk Quote request so we can review quantities, garment choices, print requirements, and delivery timing.',
  },
  {
    q: 'Why do prices change after I sign in?',
    a: 'Signed-in HC Apparel customers receive the stored account price. Public visitors see the public visitor price until they sign in; the cart is recalculated before checkout.',
  },
  {
    q: 'When is payment collected?',
    a: 'Payment is collected only after you sign in, review the cart, enter a valid shipping address, and continue to the secure payment page. We never place a vendor order merely because you view or edit your cart.',
  },
  {
    q: 'How can I get help with an order or product?',
    a: 'Use the Contact page or email support@ilovehcapparel.net. Include your order number when asking about an existing order so we can help efficiently.',
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
            Answers about garments, custom printing, shipping, checkout, and order support.
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
