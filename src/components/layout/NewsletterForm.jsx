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

    try {
      const response = await base44.functions.invoke('subscribeNewsletter', { email });
      if (!response.data?.success) throw new Error('Subscription failed');

      setStatus('success');
      setEmail('');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div>
      <h3 className="text-white font-semibold text-lg mb-2">Stay in the Loop</h3>
      <p className="text-gray-400 text-sm mb-4">Get notified about new products & exclusive deals.</p>

      {status === 'success' ? (
        <p className="text-green-400 text-sm font-medium">You're subscribed!</p>
      ) : (
        <div>
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
          {status === 'error' && <p className="text-red-400 text-sm mt-2">Unable to subscribe. Please try again.</p>}
        </div>
      )}
    </div>
  );
}