import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, CalendarClock, Eye, Package, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const ORDER_STATUSES = ['new','paid','awaiting_fulfillment','in_production','shipped','completed','canceled','refunded'];

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  awaiting_fulfillment: 'bg-yellow-100 text-yellow-800',
  in_production: 'bg-orange-100 text-orange-800',
  shipped: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-200 text-green-900',
  canceled: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-600',
  // legacy
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  fulfilled: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function AdminOrders() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState('live');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => base44.entities.Order.list('-created_date'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Order.update(id, { status }),
    onSuccess: () => { queryClient.invalidateQueries(['admin-orders']); toast.success('Status updated'); },
  });

  const liveOrders = useMemo(() => orders.filter((order) => !order.is_sample && !order.archived_at), [orders]);
  const reviewOrders = useMemo(() => liveOrders.filter((order) => order.test_review_required), [liveOrders]);
  const archivedOrders = useMemo(() => orders.filter((order) => order.archived_at), [orders]);
  const visibleOrders = view === 'archived' ? archivedOrders : view === 'review' ? reviewOrders : liveOrders;

  // Support ?order_id= URL param to deep-link to an order
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');
    if (orderId) navigate(`/AdminOrderDetail?order_id=${orderId}`, { replace: true });
  }, []);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto">
          <h1 className="text-xl font-bold">Customer Orders</h1>
          <p className="text-primary-foreground/70 text-sm">Manage and fulfill customer orders</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap gap-2 mb-6" aria-label="Order view">
          <Button variant={view === 'live' ? 'default' : 'outline'} onClick={() => setView('live')}>
            Live Orders <span className="ml-2 opacity-70">{liveOrders.length}</span>
          </Button>
          <Button variant={view === 'review' ? 'default' : 'outline'} onClick={() => setView('review')}>
            <ShieldAlert className="w-4 h-4 mr-2" /> Needs Review <span className="ml-2 opacity-70">{reviewOrders.length}</span>
          </Button>
          <Button variant={view === 'archived' ? 'default' : 'outline'} onClick={() => setView('archived')}>
            <Archive className="w-4 h-4 mr-2" /> Archived Test <span className="ml-2 opacity-70">{archivedOrders.length}</span>
          </Button>
        </div>

        {view === 'archived' && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">QA/Test — Do Not Fulfill. Confirmed test archives are excluded from operations and financial reporting.</p>
            <p className="mt-1">Scheduled cleanup removes expired application records and exclusively test-owned files. Provider records and backups follow their own retention policies.</p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-xl h-24 animate-pulse" />)}</div>
        ) : visibleOrders.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">{view === 'archived' ? 'No archived test orders' : view === 'review' ? 'No orders need review' : 'No live orders yet'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="grid gap-3 p-3 md:hidden">
              {visibleOrders.map(order => (
                <article key={order.id} className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-mono text-xs text-muted-foreground">#{order.id.slice(-8).toUpperCase()}</p><p className="font-semibold">{order.customer_name}</p><p className="break-all text-xs text-muted-foreground">{order.customer_email}</p></div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${order.archived_at ? 'bg-amber-100 text-amber-900' : STATUS_COLORS[order.status] || 'bg-gray-100'}`}>
                      {order.archived_at ? 'Archived test' : order.status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm"><div><span className="block text-xs text-muted-foreground">Amount</span>${Number(order.total_amount || 0).toFixed(2)}</div><div><span className="block text-xs text-muted-foreground">Date</span>{order.created_date ? format(new Date(order.created_date), 'MMM d, yyyy') : '—'}</div></div>
                  {order.archived_at && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-950"><p>{order.archive_reason}</p><p className="mt-1 font-semibold">Scheduled deletion: {order.purge_after ? format(new Date(order.purge_after), 'MMM d, yyyy') : '—'}</p></div>}
                  {order.test_review_required && !order.archived_at && <p className="rounded-lg bg-orange-50 p-2 text-xs text-orange-900">Payment/order relationship needs review. Not automatically classified as test.</p>}
                  <Button size="sm" variant="outline" className="w-full" onClick={() => navigate(`/AdminOrderDetail?order_id=${order.id}`)}><Eye className="mr-2 h-4 w-4" />Open order</Button>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>{['Order','Customer','Items','Amount','Status','Date','Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {visibleOrders.map(order => {
                    const itemsSummary = order.order_items?.map(item => {
                      const parts = [item.product_name];
                      if (item.size) parts.push(`Sz: ${item.size}`);
                      if (item.color) parts.push(`${item.color}`);
                      return `${parts.join(' ')} (${item.quantity})`;
                    }).join(', ') || 'No items';
                    
                    return (
                    <tr key={order.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{order.id.slice(-8)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{order.customer_name}</div>
                        <div className="text-xs text-muted-foreground">{order.customer_email}</div>
                        {order.archived_at && (
                          <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                            Archived test — Do Not Fulfill
                          </span>
                        )}
                        {order.test_review_required && !order.archived_at && <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">Needs review</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                        {itemsSummary}
                      </td>
                      <td className="px-4 py-3 font-bold">${order.total_amount?.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {order.archived_at ? <div className="space-y-1 text-xs"><p className="font-semibold text-amber-900">Archived</p><p className="max-w-xs">{order.archive_reason}</p><p className="flex items-center gap-1 font-semibold"><CalendarClock className="h-3.5 w-3.5" />Delete after {order.purge_after ? format(new Date(order.purge_after), 'MMM d, yyyy') : '—'}</p></div> : <Select value={order.status} onValueChange={v => updateStatus.mutate({ id: order.id, status: v })}>
                          <SelectTrigger className={`h-7 w-44 text-xs border-0 px-2 ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ORDER_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace(/_/g,' ')}</SelectItem>)}
                          </SelectContent>
                        </Select>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {order.created_date ? format(new Date(order.created_date), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => navigate(`/AdminOrderDetail?order_id=${order.id}`)}>
                          <Eye className="w-3.5 h-3.5" />View
                        </Button>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
