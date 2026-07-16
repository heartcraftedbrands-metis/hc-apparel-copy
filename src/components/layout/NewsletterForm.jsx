import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus('loading');

    // Check for duplicate
    const existing = await base44.entities.NewsletterSubscriber.filter({ email });
    if (existing.length > 0) {
      setStatus('success');
      setEmail('');
      return;
    }

    await base44.entities.NewsletterSubscriber.create({ email, is_active: true });
    // Send welcome email via built-in integration
    await base44.integrations.Core.SendEmail({
      to: email,
      subject: 'Welcome to HC Apparel! 🎉',
      body: `Hi there!\n\nThank you for subscribing to the HC Apparel newsletter. You'll be the first to know about new products, exclusive deals, and more!\n\nVisit our store: https://www.ilovehcapparel.net\n\n— The HC Apparel Team`,
    });

    setStatus('success');
    setEmail('');
  };

  return (
    <div>
      <h3 className="text-white font-semibold text-lg mb-2">Stay in the Loop</h3>
      <p className="text-gray-400 text-sm mb-4">Get notified about new products & exclusive deals.</p>

      {status === 'success' ? (
        <p className="text-green-400 text-sm font-medium">You're subscribed! ✓</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="email"
            placeholder="Your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-white"
          />
          <Button type="submit" disabled={status === 'loading'} className="bg-white text-black hover:bg-gray-200 shrink-0">
            {status === 'loading' ? '...' : 'Subscribe'}
          </Button>
        </form>
      )}
    </div>
  );
}