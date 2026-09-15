import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Copy, CheckCircle, AlertCircle, Clock, Search, EyeOff, ShieldCheck, FlaskConical } from 'lucide-react';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700', icon: Clock },
  ready_to_send: { label: 'Ready', color: 'bg-blue-100 text-blue-700', icon: Mail },
  sent: { label: 'Sent', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

export default function AdminCustomerNotifications() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const [view, setView] = useState('live');

  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ['customerNotifications'],
    queryFn: async () => {
      const result = await base44.entities.CustomerNotification.list('-created_date', 500);
      return result;
    },
  });

  const liveNotifications = notifications.filter((notification) => !notification.is_sample);
  const qaNotifications = notifications.filter((notification) => notification.is_sample);
  const visibleNotifications = view === 'qa' ? qaNotifications : liveNotifications;

  const filtered = visibleNotifications.filter((n) => {
    const matchSearch =
      n.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.customer_email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus = filterStatus === 'all' || n.sent_status === filterStatus;

    return matchSearch && matchStatus;
  });

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
      console.error('Error marking as sent:', error);
    }
  };

  const handleDeleteDraft = async (notificationId) => {
    if (window.confirm('Delete this draft notification?')) {
      try {
        await base44.entities.CustomerNotification.delete(notificationId);
        refetch();
      } catch (error) {
        console.error('Error deleting notification:', error);
      }
    }
  };

  const stats = {
    total: visibleNotifications.length,
    drafts: visibleNotifications.filter((n) => n.sent_status === 'draft').length,
    sent: visibleNotifications.filter((n) => n.sent_status === 'sent').length,
    failed: visibleNotifications.filter((n) => n.sent_status === 'failed').length,
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Customer Notifications</h1>
          <p className="text-muted-foreground">Create, manage, and track customer order updates</p>
        </div>

        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold text-amber-950">Automatic email delivery</p>
                <p className="mt-1 text-sm text-amber-900/80">
                  Disabled. Customer notifications remain copy-only drafts; this page does not send email automatically.
                </p>
              </div>
            </div>
            <Badge className="w-fit bg-amber-200 text-amber-950 hover:bg-amber-200">Disabled</Badge>
          </CardContent>
        </Card>

        <div className="mb-6 flex flex-wrap gap-2" aria-label="Notification view">
          <Button variant={view === 'live' ? 'default' : 'outline'} onClick={() => setView('live')}>
            Live Notifications <span className="ml-2 opacity-70">{liveNotifications.length}</span>
          </Button>
          <Button variant={view === 'qa' ? 'default' : 'outline'} onClick={() => setView('qa')}>
            <FlaskConical className="mr-2 h-4 w-4" />QA/Test <span className="ml-2 opacity-70">{qaNotifications.length}</span>
          </Button>
        </div>

        {view === 'qa' && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            QA/Test — Do Not Fulfill. These notification drafts are preserved for audit and remain unsent.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-primary">{stats.total}</div>
              <p className="text-sm text-muted-foreground">Total Notifications</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-slate-600">{stats.drafts}</div>
              <p className="text-sm text-muted-foreground">Drafts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">{stats.sent}</div>
              <p className="text-sm text-muted-foreground">Sent</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
              <p className="text-sm text-muted-foreground">Failed</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by order #, customer name, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-input rounded-md text-sm bg-background"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="ready_to_send">Ready to Send</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Notifications Table */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No notifications found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((notification) => {
                      const StatusConfig = SENT_STATUS_CONFIG[notification.sent_status];
                      const StatusIcon = StatusConfig.icon;

                      return (
                        <TableRow key={notification.id}>
                          <TableCell className="font-mono text-sm">
                            {notification.order_number.slice(-8).toUpperCase()}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{notification.customer_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {notification.customer_email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {NOTIFICATION_TYPES[notification.notification_type]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm max-w-xs truncate">{notification.subject}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <StatusIcon className="w-4 h-4" />
                              <Badge className={StatusConfig.color}>
                                {StatusConfig.label}
                              </Badge>
                              {!notification.customer_visible && (
                                <EyeOff className="w-4 h-4 text-muted-foreground" title="Admin only" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(notification.created_date), 'MMM d, yyyy h:mm a')}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCopyMessage(notification)}
                                title="Copy message"
                              >
                                {copiedId === notification.id ? '✓' : <Copy className="w-4 h-4" />}
                              </Button>
                              {notification.sent_status === 'draft' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMarkSent(notification)}
                                  title="Mark as sent"
                                >
                                  Send
                                </Button>
                              )}
                              {notification.sent_status === 'draft' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteDraft(notification.id)}
                                  className="text-destructive hover:bg-destructive/10"
                                  title="Delete draft"
                                >
                                  ✕
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Box */}
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-900">
              <strong>Note:</strong> Notifications are created as drafts automatically when order
              status changes. Mark as "Sent" when email is sent. Admin-only notifications are not
              shown to customers on the Track Order page.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
