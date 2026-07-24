import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MessageSquare, CheckCircle, Clock, AlertCircle } from "lucide-react";

const INITIAL_FORM = { name: '', email: '', subject: '', message: '' };

const initialContactForm = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') !== 'order-help') return INITIAL_FORM;

  const product = params.get('product');
  const quantity = params.get('quantity') || '1';
  const color = params.get('color');
  const size = params.get('size');
  const sku = params.get('sku');
  const details = [
    product && `Product: ${product}`,
    sku && `SKU: ${sku}`,
    color && `Color: ${color}`,
    size && `Size: ${size}`,
    `Quantity: ${quantity}`,
  ].filter(Boolean);

  return {
    ...INITIAL_FORM,
    subject: product ? `Request Order Help: ${product}` : 'Request Order Help',
    message: `${details.join('\n')}\n\nPlease help me complete this smaller order.`,
  };
};

export default function Contact() {
  const isOrderHelp = new URLSearchParams(window.location.search).get('mode') === 'order-help';
  useEffect(() => {
    document.title = isOrderHelp ? 'Request Order Help | HC Apparel' : 'Contact | HC Apparel';
  }, [isOrderHelp]);
  const [formData, setFormData] = useState(initialContactForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setIsSubmitting(false);
      setError('Something went wrong. Please try again or email support@ilovehcapparel.net.');
    }, 15000);

    try {
      const response = await base44.functions.invoke('submitContactMessage', {
        name: formData.name,
        email: formData.email,
        subject: formData.subject,
        message: formData.message,
      });
      if (!response.data?.success) throw new Error('Contact message failed');

      if (!timedOut) {
        setSubmitted(true);
        setFormData(INITIAL_FORM);
      }
    } catch {
      if (!timedOut) {
        setError('Something went wrong. Please try again or email support@ilovehcapparel.net.');
      }
    } finally {
      clearTimeout(timer);
      if (!timedOut) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-14">
        <div className="container mx-auto px-4 text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 text-accent" />
          <h1 className="text-4xl font-bold mb-3">{isOrderHelp ? 'Request Order Help' : 'Contact & Support'}</h1>
          <p className="text-primary-foreground/75">
            {isOrderHelp
              ? 'For orders of 1–49 items, send your product details and HC Apparel will help with next steps.'
              : 'Have a question or need help? We’re here for you.'}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Info column */}
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-lg mb-4">Get in Touch</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <a href="mailto:support@ilovehcapparel.net" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                      support@ilovehcapparel.net
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Response Time</p>
                    <p className="text-sm text-muted-foreground">1–2 business days</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
              <h4 className="font-semibold text-sm mb-2">Common Questions</h4>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li>• Custom printing requests</li>
                <li>• Garment sizing questions</li>
                <li>• Bulk order questions</li>
                <li>• Order support</li>
                <li>• Quote follow-ups</li>
              </ul>
            </div>
          </div>

          {/* Form column */}
          <div className="md:col-span-2 bg-white rounded-2xl border p-6">
            <h2 className="font-bold text-lg mb-5 flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" /> {isOrderHelp ? 'Order Help Details' : 'Send a Message'}
            </h2>

            {submitted ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
                <CheckCircle className="w-14 h-14 text-green-500" />
                <div>
                  <p className="font-bold text-lg">Message Received!</p>
                  <p className="text-muted-foreground mt-1">
                    Your message has been received. HC Apparel will respond within 1–2 business days.
                  </p>
                </div>
                <Button variant="outline" onClick={() => {
                  setSubmitted(false);
                  setFormData(initialContactForm());
                }}>
                  Send Another Message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input id="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input id="email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="subject">Subject *</Label>
                  <Input id="subject" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="message">Message *</Label>
                  <Textarea id="message" rows={5} value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} required className="mt-1" />
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
