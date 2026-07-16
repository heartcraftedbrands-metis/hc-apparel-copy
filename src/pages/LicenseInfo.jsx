import React from 'react';
import { Shield, CheckCircle, XCircle, FileText, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

const ALLOWED = [
  'Print designs on garments (T-shirts, hoodies, hats, etc.)',
  'Use for DTF (Direct-to-Film) transfers',
  'Apply to custom orders for clients',
  'Print on demand for your shop',
  'Use in commercial apparel production',
  'Sell finished garments bearing our designs',
];

const NOT_ALLOWED = [
  'Resell, share, or redistribute the digital files',
  'Use in sublimation-only products',
  'Claim the artwork as your own original creation',
  'Use designs for non-apparel goods (mugs, posters, etc.) without written permission',
  'Bundle or include files in your own digital product packs',
];

export default function LicenseInfo() {
  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-14">
        <div className="container mx-auto px-4 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-accent" />
          <h1 className="text-4xl font-bold mb-3">License Information</h1>
          <p className="text-primary-foreground/75 max-w-xl mx-auto">
            Everything you need to know about how you can use HeartCrafted Apparel designs.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        {/* License type */}
        <div className="bg-white rounded-2xl border p-8 mb-8 text-center">
          <FileText className="w-10 h-10 text-accent mx-auto mb-3" />
          <h2 className="text-xl font-bold mb-2">Commercial Use License</h2>
          <p className="text-muted-foreground">
            All digital designs sold by HC Apparel come with a <strong>single-entity commercial license</strong> — meaning you (or your business) can use the design to produce and sell finished apparel products.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Allowed */}
          <div className="bg-green-50 rounded-2xl border border-green-200 p-6">
            <h3 className="font-bold text-green-800 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" /> What You CAN Do
            </h3>
            <ul className="space-y-3">
              {ALLOWED.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-green-900">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Not allowed */}
          <div className="bg-red-50 rounded-2xl border border-red-200 p-6">
            <h3 className="font-bold text-red-800 mb-4 flex items-center gap-2">
              <XCircle className="w-5 h-5" /> What You CANNOT Do
            </h3>
            <ul className="space-y-3">
              {NOT_ALLOWED.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-red-900">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Print Note */}
        <div className="bg-accent/10 border border-accent/30 rounded-2xl p-6 mb-8">
          <h3 className="font-bold text-foreground mb-3">⚠️ Important Print Note</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All designs are delivered as <strong>high-resolution PNG files</strong> optimized for DTF (Direct-to-Film) printing. 
            Files are NOT intended for screen printing, embroidery digitizing, or sublimation without prior written approval. 
            Halftone designs require proper RIP software settings — do not apply additional halftones on top.
          </p>
        </div>

        {/* Contact for questions */}
        <div className="bg-primary/5 rounded-2xl border border-primary/20 p-6 text-center">
          <h3 className="font-bold mb-2">Have License Questions?</h3>
          <p className="text-muted-foreground text-sm mb-4">
            For extended licenses, bulk deals, or exclusive rights inquiries, reach out directly.
          </p>
          <Link
            to="/Contact"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            <Mail className="w-4 h-4" /> Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}