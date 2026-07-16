import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { Plus, Clock } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_TYPE_COLORS = {
  payment: 'bg-blue-100 text-blue-800',
  order: 'bg-purple-100 text-purple-800',
  fulfillment: 'bg-orange-100 text-orange-800',
  vendor: 'bg-pink-100 text-pink-800',
  tracking: 'bg-green-100 text-green-800',
  system: 'bg-gray-100 text-gray-800',
  manual: 'bg-indigo-100 text-indigo-800',
};

export default function OrderHistorySection({ orderId, orderNumber }) {
  const [historyEntries, setHistoryEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    status_title: '',
    customer_message: '',
    admin_note: '',
    customer_visible: true,
  });

  useEffect(() => {
    loadHistory();
  }, [orderId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const entries = await base44.entities.OrderStatusHistory.filter(
        { order_id: orderId },
        '-created_date',
        100
      );
      setHistoryEntries(entries);
    } catch (err) {
      console.error('Error loading order history:', err);
      toast.error('Failed to load order history');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStatus = async () => {
    if (!formData.status_title.trim()) {
      toast.error('Status title is required');
      return;
    }

    setSaving(true);
    try {
      await base44.entities.OrderStatusHistory.create({
        order_id: orderId,
        order_number: orderNumber,
        status_title: formData.status_title,
        status_type: 'manual',
        customer_message: formData.customer_message,
        admin_note: formData.admin_note,
        customer_visible: formData.customer_visible,
        created_by: 'admin',
      });

      toast.success('Status update added');
      setFormData({
        status_title: '',
        customer_message: '',
        admin_note: '',
        customer_visible: true,
      });
      setModalOpen(false);
      await loadHistory();
    } catch (err) {
      console.error('Error adding status update:', err);
      toast.error('Failed to add status update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading history...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Order History
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Status Update
          </Button>
        </CardHeader>
        <CardContent>
          {historyEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status updates yet.</p>
          ) : (
            <div className="space-y-3">
              {historyEntries.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={`text-xs ${STATUS_TYPE_COLORS[entry.status_type] || ''}`}>
                        {entry.status_type}
                      </Badge>
                      <p className="font-semibold text-sm">{entry.status_title}</p>
                    </div>
                    {entry.customer_visible && (
                      <Badge variant="outline" className="text-xs">Customer Visible</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {format(new Date(entry.created_date), 'MMM d, yyyy h:mm a')} by {entry.created_by}
                  </p>
                  {entry.customer_message && (
                    <p className="text-sm mb-2">{entry.customer_message}</p>
                  )}
                  {entry.admin_note && (
                    <div className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-900">
                      <strong>Admin note:</strong> {entry.admin_note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Status Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Status Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="status-title" className="text-sm">Status Title *</Label>
              <Input
                id="status-title"
                placeholder="e.g., Payment Confirmed, Shipped"
                value={formData.status_title}
                onChange={(e) => setFormData({ ...formData, status_title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="customer-message" className="text-sm">Customer-Friendly Message</Label>
              <Textarea
                id="customer-message"
                placeholder="Message shown to customer on Track Order page"
                value={formData.customer_message}
                onChange={(e) => setFormData({ ...formData, customer_message: e.target.value })}
                className="mt-1 min-h-20"
              />
            </div>
            <div>
              <Label htmlFor="admin-note" className="text-sm">Admin Note (Internal Only)</Label>
              <Textarea
                id="admin-note"
                placeholder="Internal note - not visible to customers"
                value={formData.admin_note}
                onChange={(e) => setFormData({ ...formData, admin_note: e.target.value })}
                className="mt-1 min-h-20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="customer-visible"
                checked={formData.customer_visible}
                onCheckedChange={(checked) => setFormData({ ...formData, customer_visible: checked })}
              />
              <Label htmlFor="customer-visible" className="text-sm cursor-pointer">
                Show to customer on Track Order page
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddStatus} disabled={saving}>
              {saving ? 'Saving...' : 'Add Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}