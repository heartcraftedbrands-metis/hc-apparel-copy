import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  Archive, BarChart3, CalendarDays, ChevronDown, ChevronRight, Clock,
  DollarSign, FileText, Inbox, Mail, MessageSquare, Package, Settings,
  ShoppingBag, Sparkles, Store, Truck, User,
} from 'lucide-react';
import StripePaymentStatus from '@/components/admin/StripePaymentStatus';
import PaymentFeesInitializer from '@/components/admin/PaymentFeesInitializer';
import { isActiveInboxItem, isActiveInboxOrder, isCheckoutIssueOrder } from '@/lib/inboxFilters';

const money = value => value == null ? '$0' : `$${Number(value).toFixed(2)}`;

function StatCard({ icon, label, count, color, to }) {
  const colors = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700', orange: 'border-orange-200 bg-orange-50 text-orange-700',
    green: 'border-green-200 bg-green-50 text-green-700', purple: 'border-purple-200 bg-purple-50 text-purple-700',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  };
  return <Link to={to} className={`flex min-w-0 items-center gap-3 rounded-2xl border p-4 transition-opacity hover:opacity-80 ${colors[color]}`}>
    <span className="shrink-0 opacity-70">{icon}</span><span className="min-w-0"><span className="block text-2xl font-extrabold">{count}</span><span className="block text-xs font-medium leading-tight opacity-80">{label}</span></span>
  </Link>;
}

function NavCard({ icon, label, desc, to, highlight = false }) {
  return <Link to={to} className={`group flex min-w-0 flex-col gap-3 rounded-2xl border p-5 transition-all hover:shadow-md ${highlight ? 'border-accent/40 bg-accent/5 hover:border-accent/60' : 'border-border bg-white hover:border-primary/20'}`}>
    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${highlight ? 'bg-accent' : 'bg-primary'}`}>{React.cloneElement(icon, { className: 'h-5 w-5 text-white' })}</span>
    <span className="min-w-0"><span className="block text-sm font-bold group-hover:text-primary">{label}</span><span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{desc}</span></span>
    <ChevronRight className="mt-auto h-4 w-4 self-end text-muted-foreground/40 group-hover:text-primary" />
  </Link>;
}

function ToolLink({ to, icon, label }) {
  return <Link to={to} className="group flex min-w-0 items-center gap-2.5 rounded-xl border bg-white p-3.5 transition-all hover:border-primary/30 hover:shadow-sm">
    <span className="shrink-0 text-muted-foreground group-hover:text-primary">{React.cloneElement(icon, { className: 'h-4 w-4' })}</span><span className="text-xs font-semibold leading-tight group-hover:text-primary">{label}</span>
  </Link>;
}

function orderStatus(order) {
  if (isCheckoutIssueOrder(order)) return 'Checkout Failed';
  if (order.fulfillment_status === 'completed') return 'Completed';
  if (['shipped', 'in_transit_to_customer'].includes(order.fulfillment_status)) return 'Shipped';
  if (['ordered_from_vendor', 'submitted_to_ss'].includes(order.fulfillment_status)) return 'Submitted to S&S';
  if (['paid', 'partially_paid'].includes(order.payment_status)) return ['not_started', 'vendor_order_needed', 'awaiting_fulfillment'].includes(order.fulfillment_status || 'not_started') ? 'Awaiting Fulfillment' : 'Paid';
  return 'Awaiting Payment';
}

export default function AdminDashboard() {
  const { data: messages = [] } = useQuery({ queryKey: ['contact_messages'], queryFn: () => base44.entities.ContactMessage.list('-created_date', 100) });
  const { data: quotes = [] } = useQuery({ queryKey: ['quote_requests'], queryFn: () => base44.entities.QuoteRequest.list('-created_date', 100) });
  const { data: orders = [] } = useQuery({ queryKey: ['orders_inbox'], queryFn: async () => (await base44.entities.Order.list('-created_date', 200)).filter(order => !order.is_sample) });
  const { data: vendorDrafts = [] } = useQuery({ queryKey: ['vendor_order_drafts'], queryFn: async () => (await base44.entities.VendorOrderDraft.list('-created_date', 100)).filter(draft => !draft.is_sample) });

  const activeOrders = orders.filter(isActiveInboxOrder);
  const awaitingPayment = activeOrders.filter(order => !isCheckoutIssueOrder(order) && (['awaiting_payment', 'unpaid', 'pending', 'pay_later'].includes(order.payment_status) || (!order.payment_status && (order.total_amount || 0) > (order.amount_paid || 0)))).length;
  const awaitingFulfillment = activeOrders.filter(order => ['paid', 'partially_paid'].includes(order.payment_status) && ['not_started', 'vendor_order_needed', 'awaiting_fulfillment'].includes(order.fulfillment_status || 'not_started')).length;
  const readyToSubmit = vendorDrafts.filter(draft => draft.vendor_status === 'ready_to_order' || draft.fulfillment_stage === 'ready_to_submit_to_ss').length;
  const inFulfillment = vendorDrafts.filter(draft => ['ordered_from_vendor', 'partially_received', 'received'].includes(draft.vendor_status) || ['submitted_to_ss', 'vendor_order_confirmed', 'tracking_received'].includes(draft.fulfillment_stage)).length;
  const recentOrders = orders.filter(isActiveInboxOrder).slice(0, 5);

  const primaryCards = [
    { to: '/AdminInbox', label: 'HC Apparel Inbox', desc: 'Messages, quote requests, payment issues, and fulfillment alerts.', icon: <Inbox /> },
    { to: '/AdminOperationsDashboard', label: 'Customer Orders', desc: 'View and manage customer orders.', icon: <Package /> },
    { to: '/AdminVendorOrders', label: 'S&S Fulfillment Orders', desc: 'Review paid orders, validate S&S details, submit orders, and track fulfillment.', icon: <Truck /> },
    { to: '/AdminGarmentCatalog', label: 'Garment Catalog', desc: 'Manage products, brands, pricing, visibility, and product QA.', icon: <Archive /> },
  ];
  const marketingCards = [
    { to: '/AdminSocialMediaStudio', label: 'Social Media Studio', desc: 'Create and schedule HC Apparel social content.', icon: <Sparkles /> },
    { to: '/AdminEmailMarketingSettings', label: 'Email Marketing', desc: 'Manage Brevo settings and subscriber sync.', icon: <Mail /> },
    { to: '/AdminMarketingAnalytics', label: 'Marketing Analytics', desc: 'Review public marketing events and conversion activity.', icon: <BarChart3 /> },
    { to: '/AdminHomepageSpecials', label: 'Homepage Specials', desc: 'Approve and manage current homepage picks.', icon: <ShoppingBag /> },
  ];
  const productivityCards = [
    { to: '/AdminProductivityDashboard', label: 'Productivity Dashboard', desc: 'Orders, follow-ups, team tasks, AI scheduling, and calendars.', icon: <Clock /> },
    { to: '/AdminCalendarSettings', label: 'Calendar Settings', desc: 'Manage the private Google Calendar connection and assignments.', icon: <CalendarDays /> },
    { to: '/AdminTeamProductivity', label: 'Team & Productivity Settings', desc: 'Manage team assignments and internal productivity settings.', icon: <User /> },
  ];
  const financeCards = [
    { to: '/AdminQuarterlyTaxCenter', label: 'Quarterly Tax Center', desc: 'Review and download quarterly sales, tax, payment, refund, and order records.', icon: <FileText /> },
    { to: '/AdminProfitCalc', label: 'Profit Calculator', desc: 'Estimate product and order margins with current business costs.', icon: <BarChart3 /> },
    { to: '/AdminAnalytics', label: 'Sales Analytics', desc: 'Review sales and order performance.', icon: <DollarSign /> },
  ];

  return <div className="min-h-screen bg-muted/30">
    <PaymentFeesInitializer />
    <header className="bg-primary px-4 py-10 text-primary-foreground"><div className="container mx-auto max-w-6xl">
      <h1 className="text-3xl font-extrabold">HC Apparel Admin Dashboard</h1><p className="mt-1 text-primary-foreground/70">One central place to run the business.</p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-primary-foreground/60"><span>Total Revenue: <strong className="text-primary-foreground">{money(orders.reduce((sum, order) => sum + (order.total_amount || 0), 0))}</strong></span><span>Total Orders: <strong className="text-primary-foreground">{orders.length}</strong></span></div>
    </div></header>

    <main className="container mx-auto max-w-6xl space-y-10 px-4 py-8">
      <section><h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Live Counts</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<Mail className="h-5 w-5" />} label="New Messages" count={messages.filter(item => isActiveInboxItem(item) && item.status === 'new').length} color="blue" to="/AdminInbox" />
        <StatCard icon={<MessageSquare className="h-5 w-5" />} label="New Quote Requests" count={quotes.filter(item => isActiveInboxItem(item) && item.status === 'new').length} color="purple" to="/AdminInbox" />
        <StatCard icon={<Clock className="h-5 w-5" />} label="Awaiting Payment" count={awaitingPayment} color="orange" to="/AdminInbox" />
        <StatCard icon={<Package className="h-5 w-5" />} label="Awaiting Fulfillment" count={awaitingFulfillment} color="green" to="/AdminInbox" />
        <StatCard icon={<Truck className="h-5 w-5" />} label="S&S Ready to Submit" count={readyToSubmit} color="yellow" to="/AdminVendorOrders" />
        <StatCard icon={<Truck className="h-5 w-5" />} label="Submitted to S&S / In Fulfillment" count={inFulfillment} color="blue" to="/AdminVendorOrders" />
      </div></section>

      <section><h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Live Operations</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{primaryCards.map(card => <NavCard key={card.to} {...card} highlight />)}</div></section>
      <section><h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Marketing</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{marketingCards.map(card => <NavCard key={card.to} {...card} />)}</div></section>
      <section><h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Productivity</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{productivityCards.map(card => <NavCard key={card.to} {...card} />)}</div></section>
      <section><h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Business / Finance</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{financeCards.map(card => <NavCard key={card.to} {...card} />)}</div></section>

      <section><h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Business Settings</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <ToolLink to="/AdminPaymentSettings" label="Payment Settings" icon={<DollarSign />} /><ToolLink to="/AdminPaymentFeeSettings" label="Pricing & Shipping Settings" icon={<Truck />} /><ToolLink to="/AdminSSApiSettings" label="S&S Vendor Settings" icon={<Settings />} /><ToolLink to="/AdminBrandPages" label="Brand Pages" icon={<Store />} /><ToolLink to="/AdminSubscribers" label="Subscribers" icon={<Mail />} /><ToolLink to="/AdminMessageTemplates" label="Message Templates" icon={<FileText />} /><ToolLink to="/AdminCustomerNotifications" label="Customer Notifications" icon={<Mail />} />
      </div><Link to="/RequestQuote" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">View Public Bulk Quote Page <ChevronRight className="h-3 w-3" /></Link></section>

      <details className="group rounded-2xl border bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-bold [&::-webkit-details-marker]:hidden"><span>Advanced Tools</span><ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" /></summary><div className="grid grid-cols-2 gap-3 border-t p-5 sm:grid-cols-3 lg:grid-cols-4">
        <ToolLink to="/PublicCatalogAudit" label="Catalog Audit" icon={<FileText />} /><ToolLink to="/AdminDigitalArchive" label="Design Archive" icon={<Archive />} /><ToolLink to="/AdminVendorPricing" label="Vendor Pricing" icon={<DollarSign />} /><ToolLink to="/AdminSSCatalog" label="S&S Catalog" icon={<Archive />} /><ToolLink to="/AdminVendors" label="Vendor Records" icon={<Truck />} /><ToolLink to="/AdminQATestReport" label="Operations Diagnostics" icon={<Settings />} />
      </div></details>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><h2 className="font-bold">Recent Orders</h2><Link to="/AdminOperationsDashboard" className="flex items-center gap-1 text-xs text-primary hover:underline">View All <ChevronRight className="h-3 w-3" /></Link></div><div className="divide-y">
        {recentOrders.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No live customer orders yet.</p> : recentOrders.map(order => <Link key={order.id} to={`/AdminOrderDetail?order_id=${order.id}`} className="flex min-w-0 items-center justify-between gap-3 px-5 py-3 hover:bg-muted/20"><span className="min-w-0"><span className="block truncate text-sm font-semibold">#{order.id.slice(-6).toUpperCase()} — {order.customer_name || 'Customer'}</span><span className="block truncate text-xs text-muted-foreground">{order.customer_email}</span></span><span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2"><strong className="text-sm">{money(order.total_amount)}</strong><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{orderStatus(order)}</span></span></Link>)}
      </div></section>

      <section><h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Payment Provider</h2><StripePaymentStatus /></section>
    </main>
  </div>;
}
