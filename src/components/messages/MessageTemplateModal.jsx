import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle, X, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const TRACK_URL = 'https://ilovehcapparel.net/TrackOrder';

export function fillTemplate(body, vars = {}) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export default function MessageTemplateModal({ templateKey, vars = {}, onClose }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const TEMPLATES = {
    order_received: {
      label: 'Order Received / Payment Instructions',
      subject: 'Your HC Apparel Order Has Been Received',
      body: `Hi {{customer_name}},

Thank you for your order with HC Apparel.

Order Number: {{order_number}}
Order Total: {{order_total}}

Your order has been received and is currently awaiting payment. We will review your order and send payment instructions shortly.

Once payment is confirmed, we'll begin preparing your garments.

You can track your order here:
${TRACK_URL}
(Enter your order number and email address to view your status.)

Thank you,
HC Apparel`,
    },
    payment_received: {
      label: 'Payment Received',
      subject: 'Payment Received for Your HC Apparel Order',
      body: `Hi {{customer_name}},

We received payment for your order.

Order Number: {{order_number}}
Order Total: {{order_total}}

Your order is now being prepared for fulfillment. We'll update your order status as it moves forward.

Track your order here:
${TRACK_URL}
(Enter your order number and email address to view your status.)

Thank you,
HC Apparel`,
    },
    ordered_from_vendor: {
      label: 'Ordered From Vendor',
      subject: 'Your HC Apparel Order Is Moving Forward',
      body: `Hi {{customer_name}},

Your garments have been ordered and are being prepared for fulfillment.

Order Number: {{order_number}}

We'll update you again once your order is ready to ship.

Track your order here:
${TRACK_URL}
(Enter your order number and email address to view your status.)

Thank you,
HC Apparel`,
    },
    shipped: {
      label: 'Order Shipped',
      subject: 'Your HC Apparel Order Has Shipped',
      body: `Hi {{customer_name}},

Your order has shipped.

Order Number: {{order_number}}
Carrier: {{shipping_carrier}}
Tracking Number: {{tracking_number}}
Tracking Link: {{tracking_url}}

Thank you for shopping with HC Apparel.`,
    },
    quote_received: {
      label: 'Quote Request Received',
      subject: 'We Received Your HC Apparel Quote Request',
      body: `Hi {{customer_name}},

Thank you for submitting a custom printing quote request.

Project Type: {{project_type}}
Quantity: {{quantity}}
Garment / Style: {{garment_style}}

We'll review your request and contact you with next steps.

Thank you,
HC Apparel`,
    },
    quote_sent: {
      label: 'Quote Sent / Follow-Up',
      subject: 'Your HC Apparel Custom Quote',
      body: `Hi {{customer_name}},

Thank you for your patience. We reviewed your custom apparel request and prepared your quote.

Project: {{project_type}}
Quantity: {{quantity}}
Garments / Style: {{garment_style}}

Quote Total:
{{quote_total}}

Notes:
{{quote_notes}}

Reply to this message with any changes or approval to move forward.

Thank you,
HC Apparel`,
    },
  };

  const tpl = TEMPLATES[templateKey];
  if (!tpl) return null;

  const filledBody = fillTemplate(tpl.body, vars);
  const filledSubject = fillTemplate(tpl.subject, vars);

  const handleCopy = () => {
    const text = `Subject: ${filledSubject}\n\n${filledBody}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('Message copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSendEmail = async (isTest = false) => {
    if (!vars.customer_email) {
      toast.error('No customer email available');
      return;
    }
    const toEmail = isTest ? 'heartfamilyco@gmail.com' : vars.customer_email;
    setSending(true);
    try {
      const htmlBody = filledBody
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('');
      
      await base44.integrations.Core.SendEmail({
        to: toEmail,
        subject: filledSubject,
        body: htmlBody,
        from_name: 'HC Apparel',
      });
      setSent(true);
      toast.success(`Email sent to ${toEmail}`);
    } catch (err) {
      toast.error('Email send failed: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Message Template</p>
              <h2 className="font-bold text-base">{tpl.label}</h2>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Subject</p>
              <div className="bg-muted/40 border rounded-lg px-3 py-2 text-sm font-medium">{filledSubject}</div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Message (Plain Text)</p>
              <pre className="bg-muted/30 border rounded-xl px-4 py-3 text-sm font-sans whitespace-pre-wrap leading-relaxed">{filledBody}</pre>
            </div>
            {vars.customer_email && (
              <p className="text-xs text-muted-foreground">Recipient: <span className="font-medium">{vars.customer_email}</span></p>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex flex-wrap gap-2 px-6 py-4 border-t bg-muted/20 rounded-b-2xl">
            <Button size="sm" variant="outline" onClick={() => setShowPreview(true)} className="gap-1.5">
              <Eye className="w-4 h-4" />
              Preview Email
            </Button>
            <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
              {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Plain Text'}
            </Button>
            {vars.customer_email && (
              <>
                <Button size="sm" variant="outline" onClick={() => handleSendEmail(true)} disabled={sending} className="gap-1.5 text-amber-600">
                  <Mail className="w-4 h-4" />
                  Send Test
                </Button>
                <Button size="sm" onClick={() => handleSendEmail(false)} disabled={sending || sent} className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Mail className="w-4 h-4" />
                  {sent ? 'Email Sent ✓' : sending ? 'Sending…' : 'Send Email'}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto">Close</Button>
          </div>
        </div>
      </div>

      {/* Email Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[51] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-base">Email Preview</h2>
              <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">From</p>
                <p className="text-sm">HC Apparel</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">To</p>
                <p className="text-sm">{vars.customer_email || '(no email)'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Subject</p>
                <p className="text-sm font-medium">{filledSubject}</p>
              </div>
              <div className="pt-4 border-t">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Message (as it will appear in email)</p>
                <div className="bg-white border rounded-lg p-6 text-sm leading-relaxed space-y-4 max-w-lg mx-auto" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  {filledBody.split('\n\n').map((para, i) => (
                    <p key={i} className="whitespace-pre-wrap">{para}</p>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t bg-muted/20 rounded-b-2xl">
              <Button size="sm" variant="ghost" onClick={() => setShowPreview(false)} className="ml-auto">Close Preview</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}