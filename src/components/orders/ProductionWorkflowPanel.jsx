import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  buildNotificationTemplate,
  PRODUCTION_NOTIFICATION_STATUSES,
  PRODUCTION_STATUSES,
  PRODUCTION_STATUS_LABELS,
} from '@/lib/productionWorkflow';

const PAID_EXEMPT_STATUSES = new Set(['order_received', 'issue_on_hold', 'cancelled']);

const orderPatchForStatus = (status, trackingNumber, carrier, holdReason) => {
  const patch = {
    production_status: status,
    production_hold_reason: status === 'issue_on_hold' ? holdReason.trim() : null,
  };
  if (trackingNumber.trim()) patch.tracking_number = trackingNumber.trim();
  if (carrier.trim()) patch.tracking_carrier = carrier.trim();
  if (status === 'payment_confirmed') patch.status = 'paid';
  if (status === 'sent_to_production') patch.status = 'in_production';
  if (status === 'shipped') Object.assign(patch, { status: 'shipped', fulfillment_status: 'shipped' });
  if (status === 'delivered') patch.fulfillment_status = 'delivered';
  if (status === 'completed') Object.assign(patch, { status: 'completed', fulfillment_status: 'completed' });
  if (status === 'issue_on_hold') patch.fulfillment_status = 'issue_hold';
  if (status === 'cancelled') patch.status = 'canceled';
  return patch;
};

export default function ProductionWorkflowPanel({
  order,
  vendorDraft = null,
  vendorOrder = null,
  onUpdated = () => undefined,
}) {
  const currentStatus = order?.production_status || vendorDraft?.production_status || vendorOrder?.production_status || 'order_received';
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [trackingNumber, setTrackingNumber] = useState(order?.tracking_number || vendorDraft?.tracking_number || vendorOrder?.tracking_number || '');
  const [carrier, setCarrier] = useState(order?.tracking_carrier || vendorDraft?.tracking_carrier || vendorOrder?.tracking_carrier || '');
  const [holdReason, setHoldReason] = useState(order?.production_hold_reason || vendorDraft?.production_hold_reason || vendorOrder?.production_hold_reason || '');
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['production-status-history', order?.id],
    queryFn: () => base44.entities.ProductionStatusHistory.filter(
      { customer_order_id: order.id },
      '-changed_at',
      50,
    ),
    enabled: !!order?.id,
  });

  React.useEffect(() => {
    setSelectedStatus(currentStatus);
  }, [currentStatus]);

  const createNotificationDraft = async (status, updatedOrder) => {
    const templateKey = PRODUCTION_NOTIFICATION_STATUSES[status];
    if (!templateKey || !updatedOrder?.id) return;
    const existing = await base44.entities.CustomerNotification.filter(
      { order_id: updatedOrder.id, related_status: status },
      '-created_date',
      1,
    );
    if (existing.length) return;
    const template = buildNotificationTemplate(templateKey, updatedOrder);
    await base44.entities.CustomerNotification.create({
      order_id: updatedOrder.id,
      order_number: updatedOrder.id,
      customer_name: updatedOrder.customer_name,
      customer_email: updatedOrder.customer_email,
      notification_type: template.notification_type,
      subject: template.subject,
      customer_message: template.customer_message,
      related_status: status,
      sent_status: 'draft',
      customer_visible: true,
      admin_note: `Created for ${PRODUCTION_STATUS_LABELS[status]}. Nothing was sent automatically.`,
      auto_generated: true,
      trigger_event: `production_status:${status}`,
    });
  };

  const saveStatus = async () => {
    if (!PAID_EXEMPT_STATUSES.has(selectedStatus) && order?.payment_status !== 'paid') {
      toast.error('Payment must be confirmed before advancing production.');
      return;
    }
    if (selectedStatus === 'shipped' && (!trackingNumber.trim() || !carrier.trim())) {
      toast.error('Carrier and tracking number are required before marking shipped.');
      return;
    }
    if (selectedStatus === 'issue_on_hold' && !holdReason.trim()) {
      toast.error('Enter an on-hold reason.');
      return;
    }

    setSaving(true);
    try {
      let updatedOrder = order;
      if (order?.id) {
        const patch = orderPatchForStatus(selectedStatus, trackingNumber, carrier, holdReason);
        if (adminNote.trim()) {
          const stamp = format(new Date(), 'MMM d, yyyy h:mm a');
          patch.internal_notes = `${order.internal_notes || ''}${order.internal_notes ? '\n\n' : ''}[${stamp}] ${adminNote.trim()}`;
        }
        updatedOrder = await base44.entities.Order.update(order.id, patch);
      }
      const linkedPatch = {
        production_status: selectedStatus,
        production_hold_reason: selectedStatus === 'issue_on_hold' ? holdReason.trim() : null,
        ...(trackingNumber.trim() ? { tracking_number: trackingNumber.trim() } : {}),
        ...(carrier.trim() ? { tracking_carrier: carrier.trim() } : {}),
      };
      if (vendorDraft?.id) await base44.entities.VendorOrderDraft.update(vendorDraft.id, linkedPatch);
      if (vendorOrder?.id) await base44.entities.VendorOrder.update(vendorOrder.id, linkedPatch);
      await createNotificationDraft(selectedStatus, updatedOrder);
      await refetchHistory();
      await onUpdated();
      toast.success(`${PRODUCTION_STATUS_LABELS[selectedStatus]} saved; customer notification remains a draft.`);
    } catch (error) {
      toast.error(`Production status was not saved: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">Production Workflow</h2>
        <span className="ml-auto text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">Admin Only</span>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        Production tracking only. Live S&amp;S order submission remains disabled.
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Production Status</Label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCTION_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-xs text-muted-foreground">Current</p>
          <p className="font-semibold text-sm">{PRODUCTION_STATUS_LABELS[currentStatus]}</p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Carrier</Label>
          <Input className="mt-1" value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="UPS, FedEx, USPS…" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Tracking Number</Label>
          <Input className="mt-1 font-mono" value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} />
        </div>
        {selectedStatus === 'issue_on_hold' && (
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">On-Hold Reason *</Label>
            <Textarea className="mt-1" value={holdReason} onChange={(event) => setHoldReason(event.target.value)} rows={2} />
          </div>
        )}
        <div className="sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Admin Note</Label>
          <Textarea className="mt-1" value={adminNote} onChange={(event) => setAdminNote(event.target.value)} rows={2} placeholder="Optional internal note recorded with this update" />
        </div>
      </div>

      {order?.payment_status !== 'paid' && !PAID_EXEMPT_STATUSES.has(selectedStatus) && (
        <p className="flex items-center gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4" />Payment must be marked paid before this step.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={saveStatus} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Save Production Status
        </Button>
        {['artwork_approved', 'production_packet_ready', 'sent_to_production', 'shipped', 'completed'].map((status) => (
          <Button key={status} size="sm" variant="outline" onClick={() => setSelectedStatus(status)}>
            {PRODUCTION_STATUS_LABELS[status]}
          </Button>
        ))}
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Status Audit</p>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No production status changes logged yet.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.map((entry) => (
              <div key={entry.id} className="flex gap-2 text-xs">
                <Clock3 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p><strong>{PRODUCTION_STATUS_LABELS[entry.new_status] || entry.new_status}</strong> by {entry.changed_by_email || 'admin'}</p>
                  <p className="text-muted-foreground">{format(new Date(entry.changed_at), 'MMM d, yyyy h:mm a')}</p>
                  {entry.hold_reason && <p className="text-red-700">Reason: {entry.hold_reason}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

