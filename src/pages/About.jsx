import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Heart, Award, Users, Truck, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const VALUES = [
  { icon: Heart, title: 'Passion for Print', desc: 'We live and breathe apparel and print. Every product is chosen with care for quality and wearability.' },
  { icon: Award, title: 'Premium Quality', desc: 'We partner with trusted vendors who meet our strict standards for materials, inks, and craftsmanship.' },
  { icon: Users, title: 'Brand-First Service', desc: 'We treat your brand like ours. From artwork to delivery, your identity is protected every step of the way.' },
  { icon: Truck, title: 'Reliable Fulfillment', desc: 'On-time production and shipping so your customers get what they expect, when they expect it.' },
];

const STATS = [
  { value: '500+', label: 'Happy Customers' },
  { value: '10k+', label: 'Garments Fulfilled' },
  { value: '4', label: 'Print Methods' },
  { value: '100%', label: 'USA-Based Support' },
];

export default function About() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <div className="bg-primary text-primary-foreground py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">About HC Apparel</h1>
          <p className="text-primary-foreground/75 text-lg max-w-2xl mx-auto">
            HeartCrafted Apparel is a premium apparel and custom print brand built for creators, brands, and businesses who demand quality.
          </p>
        </div>
      </div>

      {/* Story */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-4">Our Story</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed">
              HeartCrafted Apparel started with a simple belief: every brand deserves access to premium, custom-printed garments without the complexity and high minimums that usually come with it.
            </p>
            <p className="text-muted-foreground mb-4 leading-relaxed">
              We built HC Apparel to bridge the gap between small businesses and professional print production. Whether you need one custom hoodie or a thousand branded polos, we handle the production, sourcing, and fulfillment so you can focus on growing your brand.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              From DTF printing to screen print, embroidery to sublimation — we partner with top-tier vendors to bring your vision to life with speed and precision.
            </p>
          </div>
          <div className="bg-primary/5 rounded-2xl p-8 grid grid-cols-2 gap-6">
            {STATS.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} className="text-center">
                <div className="text-4xl font-bold text-primary mb-1">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-10">What We Stand For</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map((v, i) => (
              <div key={i} className="text-center">
                <div className="w-14 h-14 bg-primary-foreground/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <v.icon className="w-7 h-7 text-accent" />
                </div>
                <h3 className="font-bold mb-2">{v.title}</h3>
                <p className="text-primary-foreground/70 text-sm">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-10">Why Work With HC Apparel?</h2>
        <div className="max-w-2xl mx-auto space-y-4">
          {[
            'No hidden fees — transparent pricing from quote to delivery',
            'Fast turnarounds — most orders ship in 5–10 business days',
            'Low minimums — order as few or as many as you need',
            'Dedicated support — a real person handles your order from start to finish',
            'Multiple print methods — DTF, screen print, embroidery, sublimation',
            'Blank & custom options — we source and print for you',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 bg-white border rounded-xl px-5 py-4 shadow-sm">
              <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm">{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-accent/10 py-14 text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4">Ready to Work With Us?</h2>
          <p className="text-muted-foreground mb-8">Let's build something great together.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/Contact"><Button size="lg" className="bg-primary text-primary-foreground px-10 font-bold">Get in Touch</Button></Link>
            <Link to="/ShopGarments"><Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground px-10">Shop Garments</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}