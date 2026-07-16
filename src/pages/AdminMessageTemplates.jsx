import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, CheckCircle, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const TRACK_URL = 'https://ilovehcapparel.net/TrackOrder';
const TRACK_INSTRUCTION = '(Enter your order number and email address to view your status.)';

const TEMPLATES = [
  {
    key: 'order_received',
    label: 'Order Received',
    subject: 'Your HC Apparel Order Has Been Received',
    body: `Hi {{customer_name}},

Thank you for your order with HC Apparel.

Order Number: {{order_number}}
Order Total: {{order_total}}

Your order has been received and we're preparing it for processing.

We accept secure online payments via:
• Credit/debit card (Stripe)
• Apple Pay / Google Pay
• PayPal

You'll receive a payment link shortly if you selected PayPal. For card payments, your transaction should have been processed already.

Once payment is confirmed, we'll begin preparing your garments for shipment.

You can track your order here:
${TRACK_URL}
${TRACK_INSTRUCTION}

Thank you,
HC Apparel`,
  },
  {
    key: 'payment_received',
    label: 'Payment Received',
    subject: 'Payment Received for Your HC Apparel Order',
    body: `Hi {{customer_name}},

We received payment for your order.

Order Number: {{order_number}}
Order Total: {{order_total}}

Your order is now being prepared for fulfillment. We'll update your order status as it moves forward.

Track your order here:
${TRACK_URL}
${TRACK_INSTRUCTION}

Thank you,
HC Apparel`,
  },
  {
    key: 'ordered_from_vendor',
    label: 'Ordered From Vendor',
    subject: 'Your HC Apparel Order Is Moving Forward',
    body: `Hi {{customer_name}},

Your garments have been ordered and are being prepared for fulfillment.

Order Number: {{order_number}}

We'll update you again once your order is ready to ship.

Track your order here:
${TRACK_URL}
${TRACK_INSTRUCTION}

Thank you,
HC Apparel`,
  },
  {
    key: 'shipped',
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
  {
    key: 'quote_received',
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
  {
    key: 'quote_sent',
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
];

function TemplatePlaceholderLabel({ text }) {
  return (
    <code className="bg-amber-100 text-amber-800 text-xs px-1 py-0.5 rounded font-mono">{text}</code>
  );
}

function TemplateCard({ tpl }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    const text = `Subject: ${tpl.subject}\n\n${tpl.body}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('Template copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b bg-muted/20">
        <div>
          <h3 className="font-bold text-sm">{tpl.label}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Subject: <span className="font-medium text-foreground">{tpl.subject}</span></p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setExpanded(v => !v)} className="gap-1.5 text-xs">
            <Eye className="w-3.5 h-3.5" />{expanded ? 'Hide' : 'Preview'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 text-xs">
            {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 py-4">
          <pre className="text-sm font-sans whitespace-pre-wrap leading-relaxed text-foreground bg-muted/30 rounded-xl px-4 py-3">
            {tpl.body}
          </pre>
          <p className="text-xs text-muted-foreground mt-3">
            Placeholders: {tpl.body.match(/\{\{\w+\}\}/g)?.filter((v, i, a) => a.indexOf(v) === i).map((v, i) => (
              <span key={i}><TemplatePlaceholderLabel text={v} /> </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminMessageTemplates() {
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center gap-3 mb-1">
            <Link to="/AdminDashboard">
              <Button size="sm" variant="ghost" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-1.5 -ml-2">
                <ArrowLeft className="w-4 h-4" />Admin Dashboard
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Mail className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-extrabold">Message Templates</h1>
          </div>
          <p className="text-primary-foreground/70 text-sm mt-1">
            Pre-written messages for orders, quotes, and fulfillment updates. Preview and copy any template, then generate a filled version from any order or quote.
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">

        {/* Usage Guide */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-800">
          <p className="font-bold mb-1">How to use these templates</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Preview any template below and copy it to your clipboard.</li>
            <li>To fill in customer details automatically, open the corresponding detail page and use the <strong>"Generate Message"</strong> buttons.</li>
            <li><strong>Order detail pages</strong> → Order message buttons (Payment Received, Shipped, etc.)</li>
            <li><strong>Quote request pages</strong> → Quote message buttons (Quote Received, Quote Follow-Up, etc.)</li>
            <li><strong>Vendor order draft pages</strong> → Vendor fulfillment message buttons</li>
            <li>Emails are only sent when you click <strong>Send Email</strong> — nothing goes out automatically.</li>
          </ul>
        </div>

        {/* Order & Payment Templates */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Orders</h2>
            <span className="text-xs text-muted-foreground ml-2">(Use on customer order detail pages)</span>
          </div>
          <div className="space-y-3">
            {TEMPLATES.filter(t => ['order_received','payment_received'].includes(t.key)).map(tpl => (
              <TemplateCard key={tpl.key} tpl={tpl} />
            ))}
          </div>
        </div>

        {/* Fulfillment & Shipping Templates */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Vendor / Fulfillment</h2>
            <span className="text-xs text-muted-foreground ml-2">(Use on vendor order draft pages)</span>
          </div>
          <div className="space-y-3">
            {TEMPLATES.filter(t => ['ordered_from_vendor','shipped'].includes(t.key)).map(tpl => (
              <TemplateCard key={tpl.key} tpl={tpl} />
            ))}
          </div>
        </div>

        {/* Quote Templates */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Quotes</h2>
            <span className="text-xs text-muted-foreground ml-2">(Use on quote request detail pages)</span>
          </div>
          <div className="space-y-3">
            {TEMPLATES.filter(t => ['quote_received','quote_sent'].includes(t.key)).map(tpl => (
              <TemplateCard key={tpl.key} tpl={tpl} />
            ))}
          </div>
        </div>

        {/* Navigation back */}
        <div className="flex gap-3 pt-4">
          <Link to="/AdminDashboard">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />Back to Dashboard
            </Button>
          </Link>
          <Link to="/AdminOrders">
            <Button size="sm" variant="outline" className="gap-1.5">Open Orders</Button>
          </Link>
          <Link to="/AdminQuoteRequests">
            <Button size="sm" variant="outline" className="gap-1.5">Open Quote Requests</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}