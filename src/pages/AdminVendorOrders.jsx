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
  ready_to_order:      { label: 'Ready for S&S Review', color: 'bg-yellow-100 text-yellow-700' },
  ordered_from_vendor: { label: 'Submitted to S&S',     color: 'bg-blue-100 text-blue-700' },
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
  const [filter, setFilter] = useState('live');

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ['vendor_order_drafts'],
    queryFn: () => base44.entities.VendorOrderDraft.list('-created_date', 200),
  });

  const uniqueDrafts = Array.from(new Map(drafts.map((draft) => [
    draft.id || draft.vendor_order_number,
    draft,
  ])).values());
  const liveDrafts = uniqueDrafts
    .filter((draft) => !draft.is_sample)
    .sort((a, b) => Number(b.payment_status === 'paid') - Number(a.payment_status === 'paid'));
  const qaDrafts = uniqueDrafts.filter((draft) => draft.is_sample);
  const filtered = filter === 'qa'
    ? qaDrafts
    : filter === 'live'
      ? liveDrafts
      : filter === 'received'
        ? liveDrafts.filter((draft) => ['partially_received', 'received'].includes(draft.vendor_status))
        : liveDrafts.filter((draft) => draft.vendor_status === filter);

  const FILTERS = [
    { key: 'live',              label: 'Live' },
    { key: 'draft',             label: 'Draft' },
    { key: 'ready_to_order',    label: 'Ready to Submit' },
    { key: 'ordered_from_vendor', label: 'Submitted to S&S' },
    { key: 'received',          label: 'Received / Tracking' },
    { key: 'cancelled',         label: 'Cancelled' },
    { key: 'qa',                label: 'QA/Test' },
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
              <h1 className="text-2xl font-extrabold">S&amp;S Fulfillment Orders</h1>
              <p className="text-primary-foreground/70 text-sm">Review and process paid orders before sending them to S&amp;S Activewear.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 text-red-800 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-extrabold">Controlled S&amp;S fulfillment</p>
            <p className="text-sm">Only reviewed, paid, non-QA drafts can reach the separately confirmed live S&amp;S action.</p>
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
              <span className="ml-1.5 text-xs opacity-60">
                {f.key === 'qa'
                  ? qaDrafts.length
                  : f.key === 'live'
                    ? liveDrafts.length
                    : f.key === 'received'
                      ? liveDrafts.filter(d => ['partially_received', 'received'].includes(d.vendor_status)).length
                      : liveDrafts.filter(d => d.vendor_status === f.key).length}
              </span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {filter === 'qa'
              ? 'No QA/test S&S fulfillment drafts.'
              : 'No live S&S fulfillment orders yet. Mark an order paid in the Inbox to create one.'}
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
                      {draft.is_sample && (
                        <Badge className="bg-amber-100 text-amber-800">QA/Test — Do Not Fulfill</Badge>
                      )}
                      {anyWarn && (
                        <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                          <AlertTriangle className="w-3 h-3" />Warnings
                        </span>
                      )}
                    </div>
                    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4 mt-3 text-xs">
                      <p><span className="text-muted-foreground">Customer</span><br /><span className="font-medium text-foreground">{draft.customer_name || '—'}</span></p>
                      <p><span className="text-muted-foreground">Customer Order ID</span><br /><span className="font-medium text-foreground">{draft.customer_order_number || '—'}</span></p>
                      <p><span className="text-muted-foreground">Paid status</span><br /><span className="font-medium text-foreground">{draft.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</span></p>
                      <p><span className="text-muted-foreground">Date</span><br /><span className="font-medium text-foreground">{fmt(draft.created_date)}</span></p>
                      <p><span className="text-muted-foreground">Fulfillment status</span><br /><span className="font-medium text-foreground">{s.label}</span></p>
                      <p><span className="text-muted-foreground">S&amp;S status</span><br /><span className="font-medium text-foreground">{draft.ss_order_status || ssVendorOrderStageLabel(draft.workflow_status)}</span></p>
                      <p className="sm:col-span-2"><span className="text-muted-foreground">Items</span><br /><span className="font-medium text-foreground">{items.length} item{items.length !== 1 ? 's' : ''} · {totalQty} unit{totalQty !== 1 ? 's' : ''}</span></p>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <Link to={`/AdminVendorOrderDraft?id=${draft.id}`}>
                      <Button size="sm" variant="outline" className="gap-1 text-xs">
                        Review S&amp;S Order <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                    <Link to={`/AdminVendorOrderDraft?id=${draft.id}#vendor-info`}>
                      <Button size="sm" variant="outline"
                        className="gap-1 text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
                        <ClipboardEdit className="w-3.5 h-3.5" />S&amp;S Order Details
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
