import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronRight, Loader2, Truck, Download, ClipboardEdit } from 'lucide-react';
import { format } from 'date-fns';
import { ssVendorOrderStageLabel } from '@/lib/ssVendorOrderWorkflow';

const STATUS_MAP = {
  draft:               { label: 'Draft',                color: 'bg-gray-100 text-gray-600' },
  ready_to_order:      { label: 'Ready to Order',       color: 'bg-yellow-100 text-yellow-700' },
  ordered_from_vendor: { label: 'Ordered From Vendor',  color: 'bg-blue-100 text-blue-700' },
  partially_received:  { label: 'Partially Received',   color: 'bg-orange-100 text-orange-700' },
  received:            { label: 'Received',             color: 'bg-green-100 text-green-700' },
  cancelled:           { label: 'Cancelled',            color: 'bg-red-100 text-red-700' },
};

function fmt(d) {
  if (!d) return '—';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return '—'; }
}

function exportDraftCSV(draft) {
  const headers = ['Vendor Order #', 'Customer Order #', 'Customer Name', 'Customer Email',
    'SKU', 'Product Name', 'Brand', 'Style Number', 'Color', 'Size',
    'Quantity', 'Customer Unit Price', 'Customer Line Total', 'Vendor Cost', 'Notes'];
  const rows = (draft.items || []).map(item => [
    draft.vendor_order_number || '', draft.customer_order_number || '',
    draft.customer_name || '', draft.customer_email || '',
    item.sku || '', item.product_name || '', item.brand || '',
    item.style_number || '', item.color || '', item.size || '',
    item.quantity || 0,
    item.customer_unit_price != null ? item.customer_unit_price : '',
    item.customer_line_total != null ? item.customer_line_total : '',
    item.vendor_cost != null ? item.vendor_cost : '', item.notes || '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vendor-order-${draft.vendor_order_number || draft.id?.slice(-6)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminVendorOrders() {
  const [filter, setFilter] = useState('all');

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ['vendor_order_drafts'],
    queryFn: () => base44.entities.VendorOrderDraft.list('-created_date', 200),
  });

  const filtered = filter === 'all' ? drafts : drafts.filter(d => d.vendor_status === filter);

  const FILTERS = [
    { key: 'all',               label: 'All' },
    { key: 'draft',             label: 'Draft' },
    { key: 'ready_to_order',    label: 'Ready to Order' },
    { key: 'ordered_from_vendor', label: 'Ordered' },
    { key: 'received',          label: 'Received' },
    { key: 'cancelled',         label: 'Cancelled' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-8 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <Link to="/AdminDashboard" className="inline-flex items-center gap-1.5 text-xs text-primary-foreground/60 hover:text-primary-foreground mb-3 transition-colors">
            ← Back to Admin Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <Truck className="w-7 h-7 text-accent" />
            <div>
              <h1 className="text-2xl font-extrabold">Vendor Order Drafts</h1>
              <p className="text-primary-foreground/70 text-sm">Internal draft orders — no real orders are placed automatically</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 text-red-800 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-extrabold">Do Not Submit Live Order Yet</p>
            <p className="text-sm">Draft review and test-mode validation are available. No live S&S order action exists.</p>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filter === f.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white text-foreground border-border hover:border-primary/40'
              }`}>
              {f.label}
              {f.key !== 'all' && (
                <span className="ml-1.5 text-xs opacity-60">
                  {drafts.filter(d => d.vendor_status === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No vendor order drafts yet. Mark an order paid in the Inbox to create one.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(draft => {
              const s = STATUS_MAP[draft.vendor_status] || STATUS_MAP['draft'];
              const anyWarn = draft.has_sku_warnings || draft.has_image_warnings || draft.has_missing_warnings;
              const items = draft.items || [];
              const totalQty = items.reduce((a, i) => a + (i.quantity || 0), 0);

              return (
                <div key={draft.id} className="bg-white border border-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono font-bold text-sm">{draft.vendor_order_number || draft.id?.slice(-8).toUpperCase()}</span>
                      <Badge className={s.color}>{s.label}</Badge>
                      {draft.workflow_status && (
                        <Badge className="bg-primary/10 text-primary">
                          {ssVendorOrderStageLabel(draft.workflow_status)}
                        </Badge>
                      )}
                      <Badge className={draft.payment_status === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'}>
                        {draft.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                      </Badge>
                      {anyWarn && (
                        <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                          <AlertTriangle className="w-3 h-3" />Warnings
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium">{draft.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{draft.customer_order_number} · {fmt(draft.created_date)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {items.length} item{items.length !== 1 ? 's' : ''} · {totalQty} unit{totalQty !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <Link to={`/AdminVendorOrderDraft?id=${draft.id}`}>
                      <Button size="sm" variant="outline" className="gap-1 text-xs">
                        View Details <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                    <Link to={`/AdminVendorOrderDraft?id=${draft.id}#vendor-info`}>
                      <Button size="sm" variant="outline"
                        className="gap-1 text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
                        <ClipboardEdit className="w-3.5 h-3.5" />Enter Vendor Info
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline"
                      className="gap-1 text-xs border-slate-300 text-slate-600 hover:bg-slate-50"
                      onClick={() => exportDraftCSV(draft)}>
                      <Download className="w-3.5 h-3.5" />Export CSV
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
