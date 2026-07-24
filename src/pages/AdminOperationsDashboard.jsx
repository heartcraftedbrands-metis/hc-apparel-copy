import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package, CheckCircle2, DollarSign,
  Truck, MessageSquare, Filter, Eye
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import OrderDetailModal from '@/components/orders/OrderDetailModal';

const ORDER_STATUSES = [
  { value: 'awaiting_payment', label: 'Pending Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'in_production', label: 'Processing' },
  { value: 'awaiting_fulfillment', label: 'Ordered From Vendor' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Delivered' },
  { value: 'canceled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

const resolvedStatus = (order) => order.status || 'awaiting_payment';

const statusLabel = (val) => ORDER_STATUSES.find(s => s.value === val)?.label || val?.replace(/_/g, ' ') || 'Pending Payment';

const getDateRangeFilter = (period) => {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  switch (period) {
    case 'today':
      return { start: startOfDay, end: new Date() };
    case 'week':
      return { start: startOfWeek, end: new Date() };
    case 'month':
      return { start: startOfMonth, end: new Date() };
    case 'all':
    default:
      return { start: new Date(2000, 0, 1), end: new Date() };
  }
};

const prioritizeActionItems = (items) => {
  return items.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
  });
};

export default function AdminOperationsDashboard() {
  const [periodFilter, setPeriodFilter] = useState('today');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const queryClient = useQueryClient();
  const dateRange = useMemo(() => getDateRangeFilter(periodFilter), [periodFilter]);

  // Fetch all data
  const handleOrderUpdated = (updatedOrder) => {
    queryClient.setQueryData(['orders'], (old = []) =>
      old.map(o => o.id === updatedOrder.id ? updatedOrder : o)
    );
    if (selectedOrder?.id === updatedOrder.id) setSelectedOrder(updatedOrder);
  };

  const handleInlineStatusChange = async (orderId, newStatus) => {
    setUpdatingStatusId(orderId);
    await base44.entities.Order.update(orderId, { status: newStatus });
    queryClient.setQueryData(['orders'], (old = []) =>
      old.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
    );
    setUpdatingStatusId(null);
  };

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-created_date', 1000),
  });

  const { data: vendorOrders = [], isLoading: vendorOrdersLoading } = useQuery({
    queryKey: ['vendorOrders'],
    queryFn: () => base44.entities.VendorOrder.list('-created_date', 1000),
  });

  const { data: quotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => base44.entities.Quote.list('-created_date', 1000),
  });

  const { data: quoteRequests = [], isLoading: quoteRequestsLoading } = useQuery({
    queryKey: ['quoteRequests'],
    queryFn: () => base44.entities.QuoteRequest.list('-created_date', 1000),
  });

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => base44.entities.CustomerNotification.list('-created_date', 1000),
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
  });

  const { data: ssCatalog = [], isLoading: ssCatalogLoading } = useQuery({
    queryKey: ['ssCatalog'],
    queryFn: () => base44.entities.SSCatalogItem.list('-created_date', 500),
  });

  const isLoading = ordersLoading || vendorOrdersLoading || quotesLoading || quoteRequestsLoading || notificationsLoading || productsLoading || ssCatalogLoading;

  // Helper function to check if date is within range
  const isInDateRange = (dateString) => {
    if (!dateString) return true;
    const date = new Date(dateString);
    return date >= dateRange.start && date <= dateRange.end;
  };

  // Snapshot calculations
  const newOrders = orders.filter(o => isInDateRange(o.created_date)).length;
  const awaitingPayment = orders.filter(o => o.payment_status === 'unpaid' || o.payment_status === 'awaiting_payment').length;
  const paidOrders = orders.filter(o => o.payment_status === 'paid' && isInDateRange(o.payment_date)).length;
  const paidReadyForFulfillment = orders.filter(o => o.payment_status === 'paid' && o.fulfillment_status === 'not_started').length;

  const vendorOrdersDraft = vendorOrders.filter(vo => vo.status === 'draft').length;
  const vendorOrdersReady = vendorOrders.filter(vo => vo.status === 'ready_to_place').length;
  const ordersInProduction = vendorOrders.filter(vo => vo.status === 'in_production').length;
  const ordersShipped = vendorOrders.filter(vo => vo.status === 'shipped').length;

  const newQuoteRequests = quoteRequests.filter(qr => qr.status === 'new' && isInDateRange(qr.created_date)).length;
  const notificationDrafts = notifications.filter(n => n.sent_status === 'draft').length;

  const lowMarginOrders = vendorOrders.filter(vo => vo.profit_margin_pct > 0 && vo.profit_margin_pct < 15).length;
  const outOfStockSS = ssCatalog.filter(ss => ss.inventory_qty === 0 && ss.catalog_status === 'added_to_shop').length;

  // Action needed items
  const actionItems = [
    ...orders
      .filter(o => o.payment_status === 'unpaid' || o.payment_status === 'awaiting_payment')
      .map(o => ({
        id: `order-payment-${o.id}`,
        type: 'Order',
        title: `Payment Awaited - Order #${o.id?.slice(0, 8).toUpperCase()}`,
        customerName: o.customer_name,
        status: o.payment_status,
        reason: `$${o.total_amount} due`,
        priority: 'high',
        link: `/AdminOrderDetail?id=${o.id}`,
      })),
    ...orders
      .filter(o => o.payment_status === 'paid' && o.fulfillment_status === 'not_started')
      .map(o => ({
        id: `order-fulfill-${o.id}`,
        type: 'Order',
        title: `Ready for Fulfillment - Order #${o.id?.slice(0, 8).toUpperCase()}`,
        customerName: o.customer_name,
        status: 'paid',
        reason: 'Needs vendor order',
        priority: 'high',
        link: `/AdminOrderDetail?id=${o.id}`,
      })),
    ...vendorOrders
      .filter(vo => vo.status === 'draft')
      .map(vo => ({
        id: `vo-draft-${vo.id}`,
        type: 'Vendor Order',
        title: `Draft Vendor Order #${vo.id?.slice(0, 8).toUpperCase()}`,
        customerName: vo.customer_order_id ? 'Linked Order' : 'No customer',
        status: 'draft',
        reason: 'Ready to review and place',
        priority: 'medium',
        link: `/AdminVendorOrderDetail?id=${vo.id}`,
      })),
    ...vendorOrders
      .filter(vo => vo.status === 'issue_hold')
      .map(vo => ({
        id: `vo-hold-${vo.id}`,
        type: 'Vendor Order',
        title: `On Hold - Vendor Order #${vo.id?.slice(0, 8).toUpperCase()}`,
        status: 'issue_hold',
        reason: 'Issue flagged, needs resolution',
        priority: 'high',
        link: `/AdminVendorOrderDetail?id=${vo.id}`,
      })),
    ...quoteRequests
      .filter(qr => qr.status === 'new')
      .map(qr => ({
        id: `qr-new-${qr.id}`,
        type: 'Quote Request',
        title: `New Quote Request from ${qr.full_name}`,
        customerName: qr.full_name,
        status: 'new',
        reason: 'Needs review and estimate',
        priority: 'medium',
        link: `/AdminQuoteRequestDetail?id=${qr.id}`,
      })),
    ...quoteRequests
      .filter(qr => qr.status === 'waiting_on_vendor')
      .map(qr => ({
        id: `qr-vendor-${qr.id}`,
        type: 'Quote Request',
        title: `Awaiting Vendor Estimate - ${qr.full_name}`,
        customerName: qr.full_name,
        status: 'waiting_on_vendor',
        reason: 'Follow up with vendor',
        priority: 'medium',
        link: `/AdminQuoteRequestDetail?id=${qr.id}`,
      })),
    ...notifications
      .filter(n => n.sent_status === 'draft')
      .map(n => ({
        id: `notif-draft-${n.id}`,
        type: 'Notification',
        title: `Draft: ${n.subject}`,
        status: 'draft',
        reason: 'Ready to send to customer',
        priority: 'low',
        link: `/AdminCustomerNotifications?id=${n.id}`,
      })),
    ...vendorOrders
      .filter(vo => vo.profit_margin_pct > 0 && vo.profit_margin_pct < 15)
      .map(vo => ({
        id: `vo-margin-${vo.id}`,
        type: 'Vendor Order',
        title: `Low Margin - Vendor Order #${vo.id?.slice(0, 8).toUpperCase()}`,
        status: vo.status,
        reason: `Only ${vo.profit_margin_pct?.toFixed(1)}% margin`,
        priority: 'low',
        link: `/AdminVendorOrderDetail?id=${vo.id}`,
      })),
  ];

  const prioritizedActions = prioritizeActionItems(actionItems);

  const priorityColor = (priority) => {
    const colors = {
      high: 'bg-red-100 text-red-900 border-red-300',
      medium: 'bg-amber-100 text-amber-900 border-amber-300',
      low: 'bg-blue-100 text-blue-900 border-blue-300',
    };
    return colors[priority] || colors.low;
  };

  const statusColor = (status) => {
    const colors = {
      draft: 'bg-slate-100 text-slate-800',
      new: 'bg-green-100 text-green-800',
      paid: 'bg-green-100 text-green-800',
      awaiting_payment: 'bg-yellow-100 text-yellow-800',
      unpaid: 'bg-yellow-100 text-yellow-800',
      ready_to_place: 'bg-blue-100 text-blue-800',
      sent_to_vendor: 'bg-purple-100 text-purple-800',
      in_production: 'bg-purple-100 text-purple-800',
      issue_hold: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Recent activity (last 10 events)
  const recentEvents = [
    ...orders.filter(o => isInDateRange(o.created_date)).slice(0, 3).map(o => ({
      id: `event-order-${o.id}`,
      type: 'New Order',
      title: `Order #${o.id?.slice(0, 8).toUpperCase()} from ${o.customer_name}`,
      time: o.created_date,
      icon: Package,
    })),
    ...vendorOrders.filter(vo => isInDateRange(vo.created_date)).slice(0, 3).map(vo => ({
      id: `event-vo-${vo.id}`,
      type: 'Vendor Order',
      title: `Created Vendor Order #${vo.id?.slice(0, 8).toUpperCase()}`,
      time: vo.created_date,
      icon: Truck,
    })),
    ...notifications.filter(n => isInDateRange(n.created_date)).slice(0, 2).map(n => ({
      id: `event-notif-${n.id}`,
      type: 'Notification',
      title: `Notification created: "${n.subject}"`,
      time: n.created_date,
      icon: MessageSquare,
    })),
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);

  // Money snapshot calculations
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const awaitingPaymentTotal = orders
    .filter(o => o.payment_status === 'unpaid' || o.payment_status === 'awaiting_payment')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const paidTotal = orders
    .filter(o => o.payment_status === 'paid')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const estimatedVendorCosts = vendorOrders.reduce((sum, vo) => sum + (vo.blank_garment_cost + vo.print_cost + vo.setup_fee + vo.shipping_cost + (vo.other_fees || 0)), 0);
  const estimatedProfit = paidTotal - estimatedVendorCosts;

  return (
    <div className="p-4 md:p-6 pt-20 md:pt-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <Link to="/AdminDashboard" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 mb-2 transition-colors">
            ← Back to Admin Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">Operations Dashboard</h1>
          <p className="text-slate-600 mt-1">Real-time overview of what needs attention</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-600" />
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <Link to="/AdminOrders">
          <Button size="sm" variant="outline" className="w-full">
            <Package className="w-4 h-4 mr-1" />
            <span className="text-xs">Orders</span>
          </Button>
        </Link>
        <Link to="/AdminVendorOrders">
          <Button size="sm" variant="outline" className="w-full">
            <Truck className="w-4 h-4 mr-1" />
            <span className="text-xs">Vendor Orders</span>
          </Button>
        </Link>
        <Link to="/AdminQuoteRequests">
          <Button size="sm" variant="outline" className="w-full">
            <MessageSquare className="w-4 h-4 mr-1" />
            <span className="text-xs">Quotes</span>
          </Button>
        </Link>
        <Link to="/AdminCustomerNotifications">
          <Button size="sm" variant="outline" className="w-full">
            <MessageSquare className="w-4 h-4 mr-1" />
            <span className="text-xs">Notifications</span>
          </Button>
        </Link>
        <Link to="/AdminSSCatalog">
          <Button size="sm" variant="outline" className="w-full">
            <Package className="w-4 h-4 mr-1" />
            <span className="text-xs">S&S Catalog</span>
          </Button>
        </Link>
        <Link to="/AdminPaymentSettings">
          <Button size="sm" variant="outline" className="w-full">
            <DollarSign className="w-4 h-4 mr-1" />
            <span className="text-xs">Payments</span>
          </Button>
        </Link>
      </div>

      {/* Today's Snapshot */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">📊 Today's Snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">New Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{newOrders}</div>
              <p className="text-xs text-slate-500 mt-1">Created today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Awaiting Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{awaitingPayment}</div>
              <p className="text-xs text-slate-500 mt-1">${awaitingPaymentTotal.toFixed(0)} at risk</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Ready for Fulfillment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{paidReadyForFulfillment}</div>
              <p className="text-xs text-slate-500 mt-1">Paid and waiting</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Vendor Orders (Draft)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{vendorOrdersDraft}</div>
              <p className="text-xs text-slate-500 mt-1">Ready to place</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Ready to Place</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{vendorOrdersReady}</div>
              <p className="text-xs text-slate-500 mt-1">With vendors</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">In Production</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{ordersInProduction}</div>
              <p className="text-xs text-slate-500 mt-1">Being made</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Shipped</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{ordersShipped}</div>
              <p className="text-xs text-slate-500 mt-1">In transit</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">New Quote Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{newQuoteRequests}</div>
              <p className="text-xs text-slate-500 mt-1">Need review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Notification Drafts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{notificationDrafts}</div>
              <p className="text-xs text-slate-500 mt-1">Ready to send</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Low Margin Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">{lowMarginOrders}</div>
              <p className="text-xs text-slate-500 mt-1">&lt;15% profit</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Out of Stock (S&S)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{outOfStockSS}</div>
              <p className="text-xs text-slate-500 mt-1">Need restock</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Money Snapshot */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">💰 Financial Snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">${totalRevenue.toFixed(0)}</div>
              <p className="text-xs text-slate-500 mt-1">All orders</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Awaiting Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">${awaitingPaymentTotal.toFixed(0)}</div>
              <p className="text-xs text-slate-500 mt-1">At risk</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Paid Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">${paidTotal.toFixed(0)}</div>
              <p className="text-xs text-slate-500 mt-1">Received</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Est. Vendor Costs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">${estimatedVendorCosts.toFixed(0)}</div>
              <p className="text-xs text-slate-500 mt-1">COGS</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Est. Profit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${estimatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${estimatedProfit.toFixed(0)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Remaining</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action Needed Queue */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">🚨 Action Needed Queue ({prioritizedActions.length})</h2>
        {prioritizedActions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3 opacity-50" />
              <p className="text-slate-600">All caught up! No action items.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {prioritizedActions.map((item) => (
              <Card key={item.id} className="border-l-4 border-l-slate-300">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={`text-xs font-semibold ${priorityColor(item.priority)}`}>
                          {item.priority.toUpperCase()}
                        </Badge>
                        <Badge className={`text-xs ${statusColor(item.status)}`}>
                          {item.status}
                        </Badge>
                        <span className="text-xs text-slate-500">{item.type}</span>
                      </div>
                      <p className="font-medium text-slate-900">{item.title}</p>
                      {item.customerName && <p className="text-sm text-slate-600 mt-1">👤 {item.customerName}</p>}
                      <p className="text-sm text-slate-600 mt-1">📌 {item.reason}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link to={item.link}>
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4 mr-1" />
                          <span className="text-xs">View</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Fulfillment Snapshot */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">📦 Fulfillment Snapshot</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Not Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{orders.filter(o => o.fulfillment_status === 'not_started').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Created</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{vendorOrders.filter(vo => vo.status === 'draft' || vo.status === 'ready_to_place').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Sent to Vendor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{vendorOrders.filter(vo => vo.status === 'sent_to_vendor').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">In Production</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{vendorOrders.filter(vo => vo.status === 'in_production').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Shipped</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{vendorOrders.filter(vo => vo.status === 'shipped').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Delivered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{vendorOrders.filter(vo => vo.status === 'delivered').length}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quote Snapshot */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">💬 Quote Snapshot</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">New</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{quoteRequests.filter(qr => qr.status === 'new').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Reviewing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{quoteRequests.filter(qr => qr.status === 'reviewing').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Waiting Vendor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{quoteRequests.filter(qr => qr.status === 'waiting_on_vendor').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Quote Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{quoteRequests.filter(qr => qr.status === 'quote_sent').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{quoteRequests.filter(qr => qr.status === 'approved').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Converted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{quoteRequests.filter(qr => qr.status === 'converted_to_order').length}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Notification Snapshot */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">📧 Notification Snapshot</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Draft</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{notifications.filter(n => n.sent_status === 'draft').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Ready to Send</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{notifications.filter(n => n.sent_status === 'ready_to_send').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{notifications.filter(n => n.sent_status === 'sent').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{notifications.filter(n => n.sent_status === 'failed').length}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Customer Orders Table */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">🛍️ Customer Orders</h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Order #</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Items</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Total</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600"></th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 20).map((order) => {
                  const status = resolvedStatus(order);
                  const itemSummary = order.order_items?.map(i => `${i.product_name}${i.color ? ` / ${i.color}` : ''}${i.size ? ` / ${i.size}` : ''}`).join(', ') || '—';
                  return (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">#{order.id?.slice(-8).toUpperCase()}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{order.customer_name}</p>
                        <p className="text-xs text-slate-500">{order.customer_email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell max-w-xs truncate">{itemSummary}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">${order.total_amount?.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Select
                          value={status}
                          onValueChange={(val) => handleInlineStatusChange(order.id, val)}
                          disabled={updatingStatusId === order.id}
                        >
                          <SelectTrigger className="h-8 w-44 text-xs bg-white border-slate-300 text-slate-900">
                            <SelectValue>{statusLabel(status)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {ORDER_STATUSES.map(s => (
                              <SelectItem key={s.value} value={s.value} className="text-xs">
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)}>
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No orders yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      {recentEvents.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">🕐 Recent Activity</h2>
          <Card>
            <CardContent className="p-0">
              <div className="space-y-0">
                {recentEvents.map((event, idx) => {
                  const EventIcon = event.icon;
                  return (
                    <div key={event.id} className={`flex items-start gap-3 p-4 ${idx > 0 ? 'border-t border-slate-200' : ''}`}>
                      <EventIcon className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{event.type}</p>
                        <p className="text-sm text-slate-600 mt-0.5 truncate">{event.title}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(event.time).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdated={handleOrderUpdated}
        />
      )}
    </div>
  );
}