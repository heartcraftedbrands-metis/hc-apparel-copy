import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Copy, Trash2, CheckCircle, Clock, AlertCircle, Plus, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const NOTIFICATION_TYPES = {
  order_received: 'Order Received',
  awaiting_payment: 'Awaiting Payment',
  payment_confirmed: 'Payment Confirmed',
  preparing_order: 'Preparing Order',
  sent_to_production: 'Sent to Production',
  in_production: 'In Production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  custom_update: 'Custom Update',
};

const SENT_STATUS_CONFIG = {
  draft: { label: 'Draft', icon: Clock, color: 'text-slate-600' },
  ready_to_send: { label: 'Ready', icon: Mail, color: 'text-blue-600' },
  sent: { label: 'Sent', icon: CheckCircle, color: 'text-green-600' },
  failed: { label: 'Failed', icon: AlertCircle, color: 'text-red-600' },
};

export default function CustomerNotificationsSection({ orderId, order }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ notification_type: 'custom_update' });
  const [copiedId, setCopiedId] = useState(null);

  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ['customer-notifications', orderId],
    queryFn: async () => {
      const result = await base44.entities.CustomerNotification.filter(
        { order_id: orderId },
        '-created_date',
        100
      );
      return result;
    },
    enabled: !!orderId,
  });

  const handleCreateNotification = async () => {
    if (!formData.subject || !formData.customer_message) {
      alert('Please fill in subject and message');
      return;
    }

    try {
      await base44.entities.CustomerNotification.create({
        order_id: orderId,
        order_number: order.id,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        notification_type: formData.notification_type,
        subject: formData.subject,
        customer_message: formData.customer_message,
        related_status: formData.notification_type,
        sent_status: 'draft',
        customer_visible: formData.customer_visible !== false,
        admin_note: formData.admin_note || '',
        auto_generated: false,
      });

      toast.success('Notification created');
      setFormData({ notification_type: 'custom_update' });
      setShowForm(false);
      refetch();
    } catch (error) {
      toast.error('Failed: ' + error.message);
    }
  };

  const handleCopyMessage = (notification) => {
    navigator.clipboard.writeText(
      `${notification.subject}\n\n${notification.customer_message}`
    );
    setCopiedId(notification.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleMarkSent = async (notification) => {
    try {
      await base44.entities.CustomerNotification.update(notification.id, {
        sent_status: 'sent',
        sent_date: new Date().toISOString(),
      });
      refetch();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleDelete = async (notificationId) => {
    if (window.confirm('Delete this notification?')) {
      try {
        await base44.entities.CustomerNotification.delete(notificationId);
        refetch();
      } catch (error) {
        console.error('Error:', error);
      }
    }
  };

  return (
    <div className="rounded-2xl p-5 border border-primary/20 bg-primary/[0.03] space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="w-4 h-4 text-primary" />
        <p className="text-sm font-bold">Customer Notifications</p>
        <span className="ml-auto text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
          Admin Only
        </span>
      </div>

      {/* Notification List */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm">
          No notifications created yet
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const StatusIcon = SENT_STATUS_CONFIG[notification.sent_status]?.icon || Clock;
            const statusConfig = SENT_STATUS_CONFIG[notification.sent_status];

            return (
              <div key={notification.id} className="border rounded-lg p-3 bg-white space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm">{notification.subject}</p>
                      <Badge variant="outline" className="text-xs">
                        {NOTIFICATION_TYPES[notification.notification_type] || 'Custom'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.customer_message}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <StatusIcon className={`w-4 h-4 ${statusConfig?.color}`} />
                    <span className="text-xs font-medium">{statusConfig?.label}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t flex-wrap gap-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {notification.customer_visible ? (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>Customer visible</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>Admin only</span>
                      </>
                    )}
                    · {format(new Date(notification.created_date), 'MMM d h:mm a')}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleCopyMessage(notification)}
                      title="Copy message"
                    >
                      {copiedId === notification.id ? '✓' : <Copy className="w-3 h-3" />}
                    </Button>
                    {notification.sent_status === 'draft' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => handleMarkSent(notification)}
                      >
                        Mark Sent
                      </Button>
                    )}
                    {notification.sent_status === 'draft' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(notification.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Notification Form */}
      {showForm && (
        <div className="border rounded-lg p-4 bg-blue-50 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Notification Type</Label>
            <Select
              value={formData.notification_type}
              onValueChange={(value) =>
                setFormData((p) => ({ ...p, notification_type: value }))
              }
            >
              <SelectTrigger className="mt-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(NOTIFICATION_TYPES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <Input
              value={formData.subject || ''}
              onChange={(e) => setFormData((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Email subject line"
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Customer Message</Label>
            <Textarea
              value={formData.customer_message || ''}
              onChange={(e) =>
                setFormData((p) => ({ ...p, customer_message: e.target.value }))
              }
              placeholder="Message shown to customer"
              rows={3}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Admin Note (internal only)</Label>
            <Input
              value={formData.admin_note || ''}
              onChange={(e) => setFormData((p) => ({ ...p, admin_note: e.target.value }))}
              placeholder="Internal note"
              className="mt-1 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="customer_visible"
              checked={formData.customer_visible !== false}
              onChange={(e) =>
                setFormData((p) => ({ ...p, customer_visible: e.target.checked }))
              }
              className="w-4 h-4 rounded border-input"
            />
            <Label htmlFor="customer_visible" className="text-xs cursor-pointer">
              Customer visible on Track Order page
            </Label>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleCreateNotification}
            >
              Create Notification
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setFormData({ notification_type: 'custom_update' });
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showForm && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-4 h-4" />
          Create Notification
        </Button>
      )}
    </div>
  );
}