import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const PAYMENT_MODES = {
  demo: { label: 'Demo / Test Mode', description: 'Customers can place test orders. No real payment collected.' },
  manual: { label: 'Manual Payment / Invoice', description: 'Customers place orders; HC Apparel sends payment instructions.' },
  pay_later: { label: 'Pay Later', description: 'Customers can defer payment. Admin marks as paid when received.' },
  stripe: { label: 'Stripe Checkout', description: 'Connect Stripe for online payments (coming soon).' },
};

export default function AdminPaymentSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    payment_mode: 'manual',
    stripe_connected: false,
    test_mode_enabled: false,
    invoice_instructions: '',
    payment_notes_customer: '',
    payment_notes_admin: '',
  });

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['payment-settings'],
    queryFn: () => base44.entities.PaymentSettings.list()
  });

  const settingsRecord = settings[0] || null;

  useEffect(() => {
    if (settingsRecord) {
      setForm(settingsRecord);
    }
  }, [settingsRecord]);

  const upsert = useMutation({
    mutationFn: async (data) => {
      if (settingsRecord) {
        return base44.entities.PaymentSettings.update(settingsRecord.id, data);
      } else {
        return base44.entities.PaymentSettings.create(data);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(['payment-settings']);
      toast.success('Payment settings saved!');
    },
  });

  const handleSave = (e) => {
    e.preventDefault();
    upsert.mutate(form);
  };

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto">
          <h1 className="text-xl font-bold">Payment Settings</h1>
          <p className="text-primary-foreground/70 text-sm">Configure how HC Apparel processes customer payments</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="animate-pulse h-40 bg-white rounded-xl" />
        ) : (
          <form onSubmit={handleSave} className="space-y-8">
            {/* Payment Mode Selection */}
            <Card className="p-6 border shadow-sm">
              <h2 className="text-lg font-bold mb-4">Payment Mode</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Current Payment Mode *</label>
                  <Select value={form.payment_mode} onValueChange={(val) => updateForm('payment_mode', val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_MODES).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    {PAYMENT_MODES[form.payment_mode]?.description}
                  </p>
                </div>
              </div>
            </Card>

            {/* Connection Status */}
            <Card className="p-6 border shadow-sm">
              <h2 className="text-lg font-bold mb-4">Payment Connections</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Stripe Status</span>
                  <Badge variant="outline" className="bg-gray-100 text-gray-700">Not Connected</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Stripe checkout integration coming soon. Contact support to enable.</p>
              </div>
            </Card>

            {/* Test Mode */}
            <Card className="p-6 border shadow-sm">
              <h2 className="text-lg font-bold mb-4">Test Order Mode</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Allow Test Orders</p>
                    <p className="text-xs text-muted-foreground mt-1">Customers can place demo orders when Demo / Test Mode is active</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.test_mode_enabled}
                      onChange={(e) => updateForm('test_mode_enabled', e.target.checked)}
                      className="w-4 h-4 rounded border-input"
                    />
                    <span className="text-sm">{form.test_mode_enabled ? 'On' : 'Off'}</span>
                  </label>
                </div>
              </div>
            </Card>

            {/* Manual Payment / Invoice Instructions */}
            {form.payment_mode === 'manual' && (
              <Card className="p-6 border shadow-sm">
                <h2 className="text-lg font-bold mb-4">Invoice Instructions</h2>
                <p className="text-sm text-muted-foreground mb-3">Instructions shown to customers after they place an order via manual payment:</p>
                <Textarea
                  placeholder="E.g., 'Please wait for payment instructions via email. We accept PayPal, credit card, and other payment methods.'"
                  value={form.invoice_instructions}
                  onChange={(e) => updateForm('invoice_instructions', e.target.value)}
                  rows={4}
                  className="mt-2"
                />
              </Card>
            )}

            {/* Customer Payment Notes */}
            <Card className="p-6 border shadow-sm">
              <h2 className="text-lg font-bold mb-4">Payment Notes (Customer Visible)</h2>
              <p className="text-sm text-muted-foreground mb-3">Notes shown to customers about payment on their order confirmation page:</p>
              <Textarea
                placeholder="E.g., 'We appreciate your order. Payment details will be sent separately.'"
                value={form.payment_notes_customer}
                onChange={(e) => updateForm('payment_notes_customer', e.target.value)}
                rows={3}
                className="mt-2"
              />
            </Card>

            {/* Admin Payment Notes */}
            <Card className="p-6 border shadow-sm">
              <h2 className="text-lg font-bold mb-4">Internal Payment Notes (Admin Only)</h2>
              <p className="text-sm text-muted-foreground mb-3">Private notes for your team about the payment process:</p>
              <Textarea
                placeholder="E.g., 'Follow up within 48 hours if payment not received. Check customer email validity.'"
                value={form.payment_notes_admin}
                onChange={(e) => updateForm('payment_notes_admin', e.target.value)}
                rows={3}
                className="mt-2"
              />
            </Card>

            {/* Save Button */}
            <div className="flex gap-3">
              <Button type="submit" disabled={upsert.isPending} className="gap-2">
                {upsert.isPending ? 'Saving...' : 'Save Payment Settings'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}