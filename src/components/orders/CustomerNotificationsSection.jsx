import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Copy, Eye, Mail, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  buildMailtoUrl,
  buildNotificationTemplate,
  NOTIFICATION_TEMPLATE_LABELS,
  PRODUCTION_NOTIFICATION_STATUSES,
  SUPPORT_EMAIL,
  validateNotificationDraft,
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

const adminAuditFields = async (prefix) => {
  const admin = await base44.auth.me().catch(() => null);
  return {
    [`${prefix}_at`]: new Date().toISOString(),
    ...(admin?.id ? { [`${prefix}_by`]: admin.id } : {}),
    ...(admin?.email ? { [`${prefix}_by_email`]: admin.email } : {}),
  };
};

const displayDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, 'MMM d, yyyy h:mm a');
};

export default function CustomerNotificationsSection({
  orderId,
  order,
  vendorDraft = null,
  vendorOrder = null,
}) {
  const notificationOrder = useMemo(() => {
    const linked = vendorDraft || vendorOrder || {};
    return {
      ...order,
      product_name: linked.product_name || order?.product_name,
      quantity: linked.quantity || order?.quantity,
      production_status: linked.production_status || order?.production_status || 'order_received',
      tracking_number: linked.tracking_number || order?.tracking_number,
      tracking_carrier: linked.tracking_carrier || order?.tracking_carrier,
      production_hold_reason: linked.production_hold_reason || order?.production_hold_reason,
      artwork_needs_correction: linked.artwork_needs_correction ?? order?.artwork_needs_correction,
      artwork_attention_notes: linked.artwork_attention_notes || order?.artwork_attention_notes,
    };
  }, [order, vendorDraft, vendorOrder]);
  const currentTemplateKey = PRODUCTION_NOTIFICATION_STATUSES[notificationOrder.production_status] || 'order_received';
  const [showForm, setShowForm] = useState(false);
  const [templateKey, setTemplateKey] = useState(currentTemplateKey);
  const [formData, setFormData] = useState(() => draftFromTemplate(currentTemplateKey, notificationOrder));
  const [copiedId, setCopiedId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ['customer-notifications', orderId],
    queryFn: () => base44.entities.CustomerNotification.filter(
      { order_id: orderId },
      '-created_date',
      100,
    ),
    enabled: !!orderId,
  });

  useEffect(() => {
    if (showForm) return;
    setTemplateKey(currentTemplateKey);
    setFormData(draftFromTemplate(currentTemplateKey, notificationOrder));
  }, [currentTemplateKey, notificationOrder, showForm]);

  const customerEmail = notificationOrder.customer_email || '';
  const previewFields = useMemo(() => {
    const items = Array.isArray(notificationOrder.order_items) ? notificationOrder.order_items : [];
    return {
      customer: notificationOrder.customer_name || '—',
      order: notificationOrder.id ? `#${notificationOrder.id.slice(-8).toUpperCase()}` : '—',
      product: items[0]?.product_name || items[0]?.name || notificationOrder.product_name || notificationOrder.garment_type || '—',
      quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || notificationOrder.quantity || '—',
      status: notificationOrder.production_status?.replaceAll('_', ' ') || 'order received',
      tracking: notificationOrder.tracking_number || '—',
      carrier: notificationOrder.tracking_carrier || '—',
      holdReason: notificationOrder.production_hold_reason || '—',
    };
  }, [notificationOrder]);
  const validationErrors = useMemo(
    () => validateNotificationDraft(templateKey, notificationOrder),
    [notificationOrder, templateKey],
  );

  const chooseTemplate = (value) => {
    setTemplateKey(value);
    setFormData(draftFromTemplate(value, notificationOrder));
  };

  const handleCreateDraft = async () => {
    if (validationErrors.length) {
      toast.error(validationErrors[0]);
      return;
    }
    if (!formData.subject?.trim() || !formData.customer_message?.trim()) {
      toast.error('Add a subject and preview message first.');
      return;
    }
    try {
      const admin = await base44.auth.me().catch(() => null);
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
        admin_note: `Draft only. No automatic email was sent.${admin?.email ? ` Created by ${admin.email}.` : ''}`,
        auto_generated: false,
        trigger_event: `admin_template:${templateKey}`,
        ...(admin?.id ? { owner_user_id: admin.id } : {}),
        ...(admin?.email ? { created_by_email: admin.email } : {}),
      });
      toast.success('Customer notification saved as a draft. Nothing was sent.');
      setShowForm(false);
      await refetch();
    } catch (error) {
      toast.error(`Draft was not saved: ${error.message}`);
    }
  };

  const copyDraftPart = async (notification, part) => {
    const text = part === 'subject' ? notification.subject : notification.customer_message;
    try {
      await navigator.clipboard.writeText(text || '');
      setCopiedId(`${notification.id || 'preview'}:${part}`);
      window.setTimeout(() => setCopiedId(null), 2000);
      if (notification.id) {
        await base44.entities.CustomerNotification.update(
          notification.id,
          await adminAuditFields('copied'),
        );
        await refetch();
      }
      toast.success(`${part === 'subject' ? 'Subject' : 'Message'} copied. Nothing was sent automatically.`);
    } catch (error) {
      toast.error(`Could not copy the ${part}: ${error.message}`);
    }
  };

  const markManuallySent = async (notification) => {
    if (!window.confirm('Mark this draft as manually sent? This does not send an email.')) return;
    setUpdatingId(notification.id);
    try {
      const audit = await adminAuditFields('manually_sent');
      await base44.entities.CustomerNotification.update(notification.id, {
        ...audit,
        sent_status: 'sent',
        sent_date: audit.manually_sent_at,
        admin_note: `${notification.admin_note || ''}${notification.admin_note ? '\n' : ''}Marked as manually sent; no automatic email service was used.`,
      });
      await refetch();
      toast.success('Notification marked as manually sent.');
    } catch (error) {
      toast.error(`Notification was not updated: ${error.message}`);
    } finally {
      setUpdatingId(null);
    }
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

      <div className="rounded-lg border bg-white px-3 py-2 text-xs space-y-1">
        <p><strong>Customer email:</strong> <a className="text-primary underline" href={`mailto:${customerEmail}`}>{customerEmail || 'Not available'}</a></p>
        <p><strong>Support email:</strong> {SUPPORT_EMAIL}</p>
        <p className="text-muted-foreground">Email sending is not configured here. Drafts are never sent automatically.</p>
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
                <Badge variant="outline">
                  {notification.sent_status === 'sent' ? 'Manually sent' : 'Draft — not sent'}
                </Badge>
              </div>
              <p className="text-xs whitespace-pre-wrap rounded-md bg-muted/30 p-2">{notification.customer_message}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => copyDraftPart(notification, 'subject')}>
                  <Copy className="w-3.5 h-3.5" />{copiedId === `${notification.id}:subject` ? 'Copied' : 'Copy Subject'}
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => copyDraftPart(notification, 'message')}>
                  <Copy className="w-3.5 h-3.5" />{copiedId === `${notification.id}:message` ? 'Copied' : 'Copy Message'}
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" asChild>
                  <a href={buildMailtoUrl(notification.customer_email, notification.subject, notification.customer_message)}>
                    <Mail className="w-3.5 h-3.5" />Open Email Draft
                  </a>
                </Button>
                {notification.sent_status !== 'sent' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    disabled={updatingId === notification.id}
                    onClick={() => markManuallySent(notification)}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />Mark Manually Sent
                  </Button>
                )}
                {notification.sent_status !== 'sent' && (
                  <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => deleteDraft(notification.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span><Eye className="w-3 h-3 inline mr-1" />Created {displayDate(notification.created_date)}</span>
                {notification.created_by_email && <span>by {notification.created_by_email}</span>}
                {notification.copied_at && <span>Copied {displayDate(notification.copied_at)}{notification.copied_by_email ? ` by ${notification.copied_by_email}` : ''}</span>}
                {notification.manually_sent_at && <span>Marked sent {displayDate(notification.manually_sent_at)}{notification.manually_sent_by_email ? ` by ${notification.manually_sent_by_email}` : ''}</span>}
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
            <p><strong>Email:</strong> {customerEmail || '—'}</p>
            <p><strong>Order:</strong> {previewFields.order}</p>
            <p><strong>Product:</strong> {previewFields.product}</p>
            <p><strong>Quantity:</strong> {previewFields.quantity}</p>
            <p><strong>Status:</strong> {previewFields.status}</p>
            <p><strong>Tracking:</strong> {previewFields.carrier} {previewFields.tracking}</p>
            <p><strong>Hold reason:</strong> {previewFields.holdReason}</p>
            <p className="sm:col-span-2"><strong>Support:</strong> {SUPPORT_EMAIL}</p>
          </div>

          {validationErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {validationErrors.map((error) => <p key={error}>{error}</p>)}
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Subject Preview</Label>
            <Input className="mt-1" value={formData.subject || ''} onChange={(event) => setFormData((current) => ({ ...current, subject: event.target.value }))} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Message Preview</Label>
            <Textarea className="mt-1 font-mono text-xs" rows={12} value={formData.customer_message || ''} onChange={(event) => setFormData((current) => ({ ...current, customer_message: event.target.value }))} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleCreateDraft} disabled={validationErrors.length > 0}>Save Notification Draft</Button>
            <Button size="sm" variant="outline" disabled={validationErrors.length > 0} onClick={() => copyDraftPart({ ...formData, id: 'preview' }, 'subject')}>
              <Copy className="w-4 h-4 mr-1.5" />Copy Subject
            </Button>
            <Button size="sm" variant="outline" disabled={validationErrors.length > 0} onClick={() => copyDraftPart({ ...formData, id: 'preview' }, 'message')}>
              <Copy className="w-4 h-4 mr-1.5" />Copy Message
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
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2"
          onClick={() => {
            setTemplateKey(currentTemplateKey);
            setFormData(draftFromTemplate(currentTemplateKey, notificationOrder));
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4" />Generate Draft for Current Status
        </Button>
      )}
    </section>
  );
}
