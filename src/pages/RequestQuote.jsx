import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Upload, Loader2, Shirt, Printer, User } from 'lucide-react';
import { toast } from 'sonner';

const PROJECT_TYPES = [
  { value: 't_shirts', label: 'T-Shirts' },
  { value: 'hoodies', label: 'Hoodies' },
  { value: 'sweatshirts', label: 'Sweatshirts' },
  { value: 'tank_tops', label: 'Tank Tops' },
  { value: 'sportswear', label: 'Sportswear' },
  { value: 'youth_apparel', label: 'Youth Apparel' },
  { value: 'bulk_order', label: 'Bulk Order' },
  { value: 'other', label: 'Other' },
];

const GARMENT_KNOWLEDGE = [
  { value: 'picked_from_shop', label: 'Yes, I picked from Shop Garments' },
  { value: 'need_help_choosing', label: 'I need help choosing' },
  { value: 'have_own_garment', label: 'I have my own garment' },
];

const PLACEMENTS = ['Front', 'Back', 'Left Chest', 'Sleeve', 'Other'];

const PRINT_COLORS = [
  { value: '1_color', label: '1 Color' },
  { value: '2_colors', label: '2 Colors' },
  { value: 'full_color', label: 'Full Color' },
  { value: 'not_sure', label: 'Not Sure' },
];

const PRINT_METHODS = [
  { value: 'dtf', label: 'DTF (Direct to Film)' },
  { value: 'screen_print', label: 'Screen Print' },
  { value: 'vinyl', label: 'Vinyl' },
  { value: 'embroidery', label: 'Embroidery' },
  { value: 'not_sure', label: 'Not Sure' },
];

const ARTWORK_STATUS = [
  { value: 'print_ready', label: 'I have print-ready artwork' },
  { value: 'have_logo_need_help', label: 'I have a logo but need help' },
  { value: 'only_idea', label: 'I only have an idea' },
  { value: 'need_design_help', label: 'I need design help' },
];

const CONTACT_METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'text', label: 'Text' },
];

const EMPTY = {
  full_name: '', email: '', phone: '', business_name: '', preferred_contact: 'email',
  product_type: '', garment_knowledge: '', preferred_garment_style: '',
  garment_colors: '', sizes_needed: '', quantity: '',
  print_placement: [], print_colors: '', print_method: '', artwork_status: '',
  artwork_file_url: '', artwork_link: '',
  project_notes: '', date_needed: '',
};

export default function RequestQuote() {
  useEffect(() => { document.title = 'Request a Custom Printing Quote | HC Apparel'; }, []);
  const [form, setForm] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const togglePlacement = (p) => {
    const arr = form.print_placement.includes(p)
      ? form.print_placement.filter(x => x !== p)
      : [...form.print_placement, p];
    set('print_placement', arr);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set('artwork_file_url', file_url);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await base44.functions.invoke('submitQuoteRequest', form);
      if (!response.data?.success) throw new Error('Quote request failed');

      setSubmitted(true);
    } catch {
      toast.error('We could not submit your quote request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center py-16">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-4">Quote Request Received!</h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-8">
            Your quote request has been received. HC Apparel will review your project and contact you with next steps.
          </p>
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-left mb-8">
            <p className="font-semibold text-primary mb-1">What happens next?</p>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>Our team reviews your project details</li>
              <li>We reach out via your preferred contact method</li>
              <li>We send a custom quote with pricing options</li>
              <li>You approve and we get started!</li>
            </ul>
          </div>
          <Button onClick={() => { setForm(EMPTY); setSubmitted(false); }} className="bg-primary hover:bg-primary/90">
            Submit Another Request
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-primary text-primary-foreground py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-accent font-bold uppercase tracking-widest text-sm mb-3">HC Apparel</p>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 leading-tight">Request a Custom Printing Quote</h1>
          <p className="text-primary-foreground/75 text-lg max-w-2xl mx-auto">
            Tell us what you want printed, what garment you're interested in, and how many pieces you need. We'll review your request and contact you with next steps.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-12 space-y-8">

        {/* Customer Information */}
        <Section icon={<User className="w-5 h-5" />} title="Customer Information">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Full Name *">
              <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jane Smith" required />
            </Field>
            <Field label="Email Address *">
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" required />
            </Field>
            <Field label="Phone Number">
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" />
            </Field>
            <Field label="Business / Brand Name">
              <Input value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="Your Brand Co." />
            </Field>
          </div>
          <Field label="Preferred Contact Method">
            <div className="flex gap-3 flex-wrap mt-1">
              {CONTACT_METHODS.map(m => (
                <button type="button" key={m.value} onClick={() => set('preferred_contact', m.value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${form.preferred_contact === m.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Project Information */}
        <Section icon={<Shirt className="w-5 h-5" />} title="Project Information">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Project Type *">
              <Select value={form.product_type} onValueChange={v => set('product_type', v)} required>
                <SelectTrigger><SelectValue placeholder="Select project type" /></SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quantity Needed *">
              <Input type="number" min="1" value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="e.g. 50" required />
            </Field>
          </div>
          <Field label="Do you already know the garment?">
            <Select value={form.garment_knowledge} onValueChange={v => set('garment_knowledge', v)}>
              <SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger>
              <SelectContent>
                {GARMENT_KNOWLEDGE.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Preferred Garment / Style">
            <Input value={form.preferred_garment_style} onChange={e => set('preferred_garment_style', e.target.value)}
              placeholder='Example: Gildan 2000, Jerzees 29M, Bella + Canvas, or "not sure"' />
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Colors Needed">
              <Input value={form.garment_colors} onChange={e => set('garment_colors', e.target.value)}
                placeholder="Example: Black, White, Navy" />
            </Field>
            <Field label="Sizes Needed">
              <Input value={form.sizes_needed} onChange={e => set('sizes_needed', e.target.value)}
                placeholder="Example: S(5), M(10), L(10), XL(5)" />
            </Field>
          </div>
        </Section>

        {/* Printing Information */}
        <Section icon={<Printer className="w-5 h-5" />} title="Printing Information">
          <Field label="Print Location">
            <div className="flex flex-wrap gap-2 mt-1">
              {PLACEMENTS.map(p => (
                <button type="button" key={p} onClick={() => togglePlacement(p)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${form.print_placement.includes(p) ? 'bg-accent text-accent-foreground border-accent' : 'border-border text-muted-foreground hover:border-accent hover:text-accent-foreground'}`}>
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Number of Print Colors">
              <Select value={form.print_colors} onValueChange={v => set('print_colors', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {PRINT_COLORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Print Method">
              <Select value={form.print_method} onValueChange={v => set('print_method', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {PRINT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Artwork Status">
            <Select value={form.artwork_status} onValueChange={v => set('artwork_status', v)}>
              <SelectTrigger><SelectValue placeholder="Select your artwork status" /></SelectTrigger>
              <SelectContent>
                {ARTWORK_STATUS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Upload Artwork">
            <label className="flex items-center gap-3 border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-primary transition-colors group">
              <Upload className="w-5 h-5 text-muted-foreground group-hover:text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {uploading ? 'Uploading…' : form.artwork_file_url ? '✓ File uploaded' : 'Click to upload artwork'}
                </p>
                <p className="text-xs text-muted-foreground">PNG, JPG, SVG, PDF</p>
              </div>
              <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.svg,.pdf" onChange={handleFileUpload} />
            </label>
          </Field>
          <Field label="Project Notes">
            <Textarea value={form.project_notes} onChange={e => set('project_notes', e.target.value)}
              placeholder="Tell us about your design, deadline, event, or any special instructions."
              rows={4} />
          </Field>
          <Field label="Needed By">
            <Input type="date" value={form.date_needed} onChange={e => set('date_needed', e.target.value)} />
          </Field>
        </Section>

        {/* Submit */}
        <div className="pt-4 border-t border-border">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mb-6">
            <p className="text-sm text-muted-foreground">
              By submitting this form, you'll receive a custom quote from HC Apparel. <strong className="text-foreground">No payment is required at this stage.</strong> We typically respond within 1–2 business days.
            </p>
          </div>
          <Button type="submit" size="lg" disabled={loading || uploading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-lg h-14 rounded-2xl font-bold shadow-lg">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin mr-2" />Sending…</> : 'Send Quote Request'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">{icon}</div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, className }) {
  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}
