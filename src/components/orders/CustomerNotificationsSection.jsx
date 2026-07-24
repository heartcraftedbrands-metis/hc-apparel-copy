import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Eye, Mail, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  buildMailtoUrl,
  buildNotificationTemplate,
  NOTIFICATION_TEMPLATE_LABELS,
  SUPPORT_EMAIL,
} from '@/lib/productionWorkflow';

const CUSTOM_UPDATE = 'custom_update';

const draftFromTemplate = (templateKey, order) => {
  if (templateKey === CUSTOM_UPDATE) {
    return {
      notification_type: CUSTOM_UPDATE,
      subject: '',
      customer_message: '',
      related_status: CUSTOM_UPDATE,
      label: 'Custom update',
    };
  }
  return buildNotificationTemplate(templateKey, order);
};

export default function CustomerNotificationsSection({ orderId, order }) {
  const [showForm, setShowForm] = useState(false);
  const [templateKey, setTemplateKey] = useState('order_received_payment_confirmed');
  const [formData, setFormData] = useState(() => draftFromTemplate('order_received_payment_confirmed', order));
  const [copiedId, setCopiedId] = useState(null);

  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ['customer-notifications', orderId],
    queryFn: () => base44.entities.CustomerNotification.filter(
      { order_id: orderId },
      '-created_date',
      100,
    ),
    enabled: !!orderId,
  });

  const customerEmail = order?.customer_email || '';
  const previewFields = useMemo(() => {
    const items = Array.isArray(order?.order_items) ? order.order_items : [];
    return {
      customer: order?.customer_name || '—',
      order: order?.id ? `#${order.id.slice(-8).toUpperCase()}` : '—',
      product: items[0]?.product_name || items[0]?.name || order?.garment_type || '—',
      quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || order?.quantity || '—',
      status: order?.production_status?.replaceAll('_', ' ') || 'order received',
      tracking: order?.tracking_number || '—',
      carrier: order?.tracking_carrier || '—',
    };
  }, [order]);

  const chooseTemplate = (value) => {
    setTemplateKey(value);
    setFormData(draftFromTemplate(value, order));
  };

  const handleCreateDraft = async () => {
    if (!formData.subject?.trim() || !formData.customer_message?.trim()) {
      toast.error('Add a subject and preview message first.');
      return;
    }
    try {
      await base44.entities.CustomerNotification.create({
        order_id: orderId,
        order_number: order.id,
        customer_name: order.customer_name,
        customer_email: customerEmail,
        notification_type: formData.notification_type,
        subject: formData.subject.trim(),
        customer_message: formData.customer_message.trim(),
        related_status: formData.related_status || templateKey,
        sent_status: 'draft',
        customer_visible: true,
        admin_note: 'Draft only. No automatic email was sent.',
        auto_generated: false,
        trigger_event: `admin_template:${templateKey}`,
      });
      toast.success('Customer notification saved as a draft. Nothing was sent.');
      setShowForm(false);
      await refetch();
    } catch (error) {
      toast.error(`Draft was not saved: ${error.message}`);
    }
  };

  const copyMessage = async (notification) => {
    await navigator.clipboard.writeText(`${notification.subject}\n\n${notification.customer_message}`);
    setCopiedId(notification.id || 'preview');
    window.setTimeout(() => setCopiedId(null), 2000);
    toast.success('Email subject and message copied.');
  };

  const deleteDraft = async (notificationId) => {
    if (!window.confirm('Delete this notification draft?')) return;
    await base44.entities.CustomerNotification.delete(notificationId);
    await refetch();
  };

  return (
    <section className="rounded-2xl p-5 border border-primary/20 bg-primary/[0.03] space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Mail className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">Customer Notification Drafts</h2>
        <span className="ml-auto text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">Admin Only</span>
      </div>

      <div className="rounded-lg border bg-white px-3 py-2 text-xs">
        <p><strong>Customer email:</strong> <a className="text-primary underline" href={`mailto:${customerEmail}`}>{customerEmail || 'Not available'}</a></p>
        <p className="text-muted-foreground mt-1">Email sending is not configured here. Drafts are never sent automatically.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading drafts…</p>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customer notification drafts yet.</p>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <article key={notification.id} className="border rounded-lg p-3 bg-white space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{notification.subject}</p>
                  <p className="text-xs text-muted-foreground">{notification.customer_email}</p>
                </div>
                <Badge variant="outline">{notification.sent_status === 'draft' ? 'Draft — not sent' : notification.sent_status}</Badge>
              </div>
              <p className="text-xs whitespace-pre-wrap rounded-md bg-muted/30 p-2">{notification.customer_message}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => copyMessage(notification)}>
                  <Copy className="w-3.5 h-3.5" />{copiedId === notification.id ? 'Copied' : 'Copy to Email'}
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" asChild>
                  <a href={buildMailtoUrl(notification.customer_email, notification.subject, notification.customer_message)}>
                    <Mail className="w-3.5 h-3.5" />Open Email Draft
                  </a>
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => deleteDraft(notification.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">
                  <Eye className="w-3 h-3 inline mr-1" />{format(new Date(notification.created_date), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="border rounded-xl p-4 bg-white space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Draft Template</Label>
            <Select value={templateKey} onValueChange={chooseTemplate}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NOTIFICATION_TEMPLATE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
                <SelectItem value={CUSTOM_UPDATE}>Custom update</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid sm:grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
            <p><strong>Customer:</strong> {previewFields.customer}</p>
            <p><strong>Order:</strong> {previewFields.order}</p>
            <p><strong>Product:</strong> {previewFields.product}</p>
            <p><strong>Quantity:</strong> {previewFields.quantity}</p>
            <p><strong>Status:</strong> {previewFields.status}</p>
            <p><strong>Tracking:</strong> {previewFields.carrier} {previewFields.tracking}</p>
            <p className="sm:col-span-2"><strong>Support:</strong> {SUPPORT_EMAIL}</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Subject Preview</Label>
            <Input className="mt-1" value={formData.subject || ''} onChange={(event) => setFormData((current) => ({ ...current, subject: event.target.value }))} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Message Preview</Label>
            <Textarea className="mt-1 font-mono text-xs" rows={12} value={formData.customer_message || ''} onChange={(event) => setFormData((current) => ({ ...current, customer_message: event.target.value }))} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleCreateDraft}>Save Notification Draft</Button>
            <Button size="sm" variant="outline" onClick={() => copyMessage({ ...formData, id: 'preview' })}>
              <Copy className="w-4 h-4 mr-1.5" />Copy Preview
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={buildMailtoUrl(customerEmail, formData.subject, formData.customer_message)}>
                <Mail className="w-4 h-4 mr-1.5" />Open in Email
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />Create Notification Draft
        </Button>
      )}
    </section>
  );
}
