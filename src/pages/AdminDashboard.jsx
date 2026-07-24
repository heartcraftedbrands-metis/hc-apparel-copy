import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Inbox, Package, ShoppingBag, Truck, Mail, MessageSquare,
  Store, FileText, Phone, ChevronRight, BarChart3, Archive,
  DollarSign, Clock, AlertTriangle
} from 'lucide-react';
import StripePaymentStatus from '@/components/admin/StripePaymentStatus';
import PaymentFeesInitializer from '@/components/admin/PaymentFeesInitializer';

function money(v) {
  if (v == null) return '$0';
  return `$${Number(v).toFixed(2)}`;
}

function StatCard({ icon, label, count, color, to }) {
  const colorMap = {
    blue:   'border-blue-200 bg-blue-50 text-blue-700',
    red:    'border-red-200 bg-red-50 text-red-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    green:  'border-green-200 bg-green-50 text-green-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  };
  const inner = (
    <div className={`rounded-2xl border p-4 flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer ${colorMap[color]}`}>
      <div className="opacity-70 shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-extrabold">{count}</p>
        <p className="text-xs font-medium opacity-80 leading-tight">{label}</p>
      </div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function NavCard({ icon, label, desc, to, highlight }) {
  return (
    <Link to={to}
      className={`rounded-2xl border p-5 flex flex-col gap-3 hover:shadow-md transition-all group ${
        highlight
          ? 'border-accent/40 bg-accent/5 hover:border-accent/60'
          : 'border-border bg-white hover:border-primary/20'
      }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${highlight ? 'bg-accent' : 'bg-primary'}`}>
        {React.cloneElement(icon, { className: 'w-5 h-5 text-white' })}
      </div>
      <div>
        <p className="font-bold text-sm group-hover:text-primary transition-colors">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{desc}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/40 mt-auto self-end group-hover:text-primary transition-colors" />
    </Link>
  );
}

export default function AdminDashboard() {
  const { data: messages = [] } = useQuery({
    queryKey: ['contact_messages'],
    queryFn: () => base44.entities.ContactMessage.list('-created_date', 100),
  });
  const { data: quotes = [] } = useQuery({
    queryKey: ['quote_requests'],
    queryFn: () => base44.entities.QuoteRequest.list('-created_date', 100),
  });
  const { data: orders = [] } = useQuery({
    queryKey: ['orders_inbox'],
    queryFn: () => base44.entities.Order.list('-created_date', 200),
  });
  const { data: vendorDrafts = [] } = useQuery({
    queryKey: ['vendor_order_drafts'],
    queryFn: () => base44.entities.VendorOrderDraft.list('-created_date', 100),
  });

  const newMessages  = messages.filter(m => m.status === 'new').length;
  const newQuotes    = quotes.filter(q => q.status === 'new').length;
  const awaitingPay  = orders.filter(o => {
    const ps = o.payment_status;
    return ['awaiting_payment','unpaid','pending','pay_later'].includes(ps) || (!ps && (o.total_amount || 0) > (o.amount_paid || 0));
  }).length;
  const awaitingFulf = orders.filter(o =>
    ['paid','partially_paid'].includes(o.payment_status) &&
    ['not_started','vendor_order_needed','ordered_from_vendor','in_transit_to_me','ready_to_ship','awaiting_fulfillment'].includes(o.fulfillment_status || 'not_started')
  ).length;
  const draftsReady  = vendorDrafts.filter(d => d.vendor_status === 'ready_to_order').length;
  const ordered      = vendorDrafts.filter(d => d.vendor_status === 'ordered_from_vendor').length;

  const totalRevenue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalOrders  = orders.length;

  return (
    <div className="min-h-screen bg-muted/30">
      <PaymentFeesInitializer />
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-10 px-4">
        <div className="container mx-auto max-w-6xl">
          <h1 className="text-3xl font-extrabold">HC Apparel Admin Dashboard</h1>
          <p className="text-primary-foreground/70 mt-1">One central place to run the business.</p>
          <div className="flex gap-6 mt-4 text-sm text-primary-foreground/60">
            <span>Total Revenue: <strong className="text-primary-foreground">{money(totalRevenue)}</strong></span>
            <span>Total Orders: <strong className="text-primary-foreground">{totalOrders}</strong></span>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-8 space-y-10">

        {/* Live Summary Counts */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Live Counts</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={<Mail className="w-5 h-5" />}        label="New Messages"          count={newMessages}  color="blue"   to="/AdminContactMessages" />
            <StatCard icon={<MessageSquare className="w-5 h-5" />} label="New Quote Requests"  count={newQuotes}    color="purple" to="/AdminInbox" />
            <StatCard icon={<Clock className="w-5 h-5" />}       label="Awaiting Payment"      count={awaitingPay}  color="orange" to="/AdminInbox" />
            <StatCard icon={<Package className="w-5 h-5" />}     label="Awaiting Fulfillment"  count={awaitingFulf} color="green"  to="/AdminInbox" />
            <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Drafts Ready to Order" count={draftsReady} color="yellow" to="/AdminVendorOrders" />
            <StatCard icon={<Truck className="w-5 h-5" />}       label="Ordered From Vendor"   count={ordered}      color="blue"   to="/AdminVendorOrders" />
          </div>
        </div>

        {/* Payment Provider Status */}
         <div>
           <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Payment Providers</h2>
           <StripePaymentStatus />
         </div>

         {/* Primary Workflows */}
         <div>
           <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Primary Workflows</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <NavCard
              icon={<Inbox />}
              label="Inbox"
              desc="Messages, quote requests, awaiting payment, and fulfillment"
              to="/AdminInbox"
              highlight
            />
            <NavCard
              icon={<Package />}
              label="Customer Orders"
              desc="View and manage customer orders"
              to="/AdminOperationsDashboard"
              highlight
            />
            <NavCard
              icon={<Archive />}
              label="Garment Catalog"
              desc="Upload garments, manage approved products, build drafts"
              to="/AdminGarmentCatalog"
              highlight
            />
            <NavCard
              icon={<Truck />}
              label="Vendor Orders"
              desc="Vendor order drafts, CSV exports, tracking, and fulfillment"
              to="/AdminVendorOrders"
              highlight
            />
            <NavCard
              icon={<Mail />}
              label="Contact Messages"
              desc="Customer contact form messages"
              to="/AdminContactMessages"
            />
            <NavCard
              icon={<MessageSquare />}
              label="Quote Requests"
              desc="Review and respond to custom print quote requests"
              to="/AdminQuoteRequests"
            />
            <NavCard
              icon={<Store />}
              label="Storefront"
              desc="View live customer garment shop"
              to="/ShopGarments"
            />
            <NavCard
              icon={<FileText />}
              label="Bulk Quote 50+ Page"
              desc="View the public bulk quote request form"
              to="/RequestQuote"
            />
          </div>
        </div>

        {/* More Admin Tools */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">More Tools</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { to: '/AdminProducts',              label: 'Products',            icon: <ShoppingBag /> },
              { to: '/AdminVendors',               label: 'Vendors',             icon: <Truck /> },
              { to: '/AdminVendorPricing',         label: 'Vendor Pricing',      icon: <DollarSign /> },
              { to: '/AdminQuotes',                label: 'Quotes',              icon: <FileText /> },
              { to: '/AdminProfitCalc',            label: 'Profit Calc',         icon: <BarChart3 /> },
              { to: '/AdminAnalytics',             label: 'Analytics',           icon: <BarChart3 /> },
              { to: '/AdminPaymentSettings',       label: 'Payment Settings',    icon: <DollarSign /> },
              { to: '/AdminCustomerNotifications', label: 'Notifications',       icon: <Mail /> },
              { to: '/AdminDigitalArchive',        label: 'Design Archive',      icon: <Archive /> },
              { to: '/AdminSSCatalog',             label: 'S&S Catalog',         icon: <Archive /> },
              { to: '/AdminOperationsDashboard',   label: 'Operations Dashboard',icon: <BarChart3 /> },
              { to: '/AdminMessageTemplates',       label: 'Message Templates',   icon: <Mail /> },
              { to: '/PublicCatalogAudit',         label: 'Catalog Audit',       icon: <FileText /> },
              { to: '/Contact',                    label: 'Contact Page',        icon: <Phone /> },
            ].map(({ to, label, icon }) => (
              <Link key={to} to={to}
                className="bg-white border border-border rounded-xl p-4 flex items-center gap-2.5 hover:border-primary/30 hover:shadow-sm transition-all group">
                <div className="text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                  {React.cloneElement(icon, { className: 'w-4 h-4' })}
                </div>
                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-bold">Recent Orders</h2>
            <Link to="/AdminOperationsDashboard" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y">
            {orders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No orders yet.</p>
            ) : orders.slice(0, 8).map(o => (
              <Link key={o.id} to={`/AdminOrderDetail?order_id=${o.id}`}
                className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">#{o.id.slice(-6).toUpperCase()} — {o.customer_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{o.customer_email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold">{money(o.total_amount)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {o.payment_status?.replace(/_/g,' ') || 'unpaid'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
