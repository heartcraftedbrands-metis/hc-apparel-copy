import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Eye } from "lucide-react";
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

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => base44.entities.Order.list('-created_date'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Order.update(id, { status }),
    onSuccess: () => { queryClient.invalidateQueries(['admin-orders']); toast.success('Status updated'); },
  });

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
        {isLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-xl h-24 animate-pulse" />)}</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No orders yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>{['Order','Customer','Items','Amount','Status','Date','Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map(order => {
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
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                        {itemsSummary}
                      </td>
                      <td className="px-4 py-3 font-bold">${order.total_amount?.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Select value={order.status} onValueChange={v => updateStatus.mutate({ id: order.id, status: v })}>
                          <SelectTrigger className={`h-7 w-44 text-xs border-0 px-2 ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ORDER_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace(/_/g,' ')}</SelectItem>)}
                          </SelectContent>
                        </Select>
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