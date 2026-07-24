import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { MessageSquare, Send } from 'lucide-react';

const inferProductType = (garmentType) => {
  const value = garmentType.toLowerCase();

  if (value.includes('hood')) return 'hoodies';
  if (value.includes('sweatshirt')) return 'sweatshirts';
  if (value.includes('tank')) return 'tank_tops';
  if (value.includes('sport') || value.includes('jersey')) return 'sportswear';
  if (value.includes('youth') || value.includes('kid')) return 'youth_apparel';
  if (value.includes('bulk')) return 'bulk_order';
  if (value.includes('shirt') || value.includes('tee')) return 't_shirts';

  return 'other';
};

export default function HomeQuoteRequest() {
  const [form, setForm] = useState({ customer_name: '', customer_email: '', garment_type: '', quantity: '', description: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const garmentType = form.garment_type.trim();
    const quantity = Number(form.quantity);

    try {
      const response = await base44.functions.invoke('submitQuoteRequest', {
        full_name: form.customer_name.trim(),
        email: form.customer_email.trim().toLowerCase(),
        preferred_contact: 'email',
        product_type: inferProductType(garmentType),
        garment_knowledge: 'need_help_choosing',
        preferred_garment_style: garmentType,
        project_notes: form.description.trim(),
        ...(Number.isFinite(quantity) && quantity > 0 ? { quantity } : {}),
      });
      if (!response.data?.success) throw new Error('Quote request failed');

      toast.success('Quote request submitted! We\'ll get back to you shortly.');
      setForm({ customer_name: '', customer_email: '', garment_type: '', quantity: '', description: '' });
    } catch {
      toast.error('We couldn\'t submit your quote request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="py-16 bg-accent/10">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-7 h-7 text-accent-foreground" />
            </div>
            <h2 className="text-3xl font-bold mb-2">Request a Quote</h2>
            <p className="text-muted-foreground">Tell us what you need and we'll respond within 1 business day.</p>
          </div>
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border shadow-sm p-8 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Your Name *</label>
                <Input required value={form.customer_name} onChange={e => setForm(p => ({...p, customer_name: e.target.value}))} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Email *</label>
                <Input required type="email" value={form.customer_email} onChange={e => setForm(p => ({...p, customer_email: e.target.value}))} placeholder="your email address" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Garment Type</label>
                <Input value={form.garment_type} onChange={e => setForm(p => ({...p, garment_type: e.target.value}))} placeholder="e.g. T-Shirts, Hoodies" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Quantity</label>
                <Input type="number" value={form.quantity} onChange={e => setForm(p => ({...p, quantity: e.target.value}))} placeholder="e.g. 50" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Project Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={e => setForm(p => ({...p, description: e.target.value}))}
                placeholder="Tell us about your design, colors, placement, deadline..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full gap-2 font-bold">
              <Send className="w-4 h-4" /> {loading ? 'Sending...' : 'Submit Quote Request'}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}