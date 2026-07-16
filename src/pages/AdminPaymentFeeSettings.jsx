import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function AdminPaymentFeeSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    stripe_fee_buffer_percent: 3.5,
    stripe_fixed_fee_buffer: 0.50,
    paypal_fee_buffer_percent: 4.0,
    paypal_fixed_fee_buffer: 0.50,
    additional_profit_buffer_percent: 0,
    price_rounding_mode: 'nearest_99'
  });

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['payment-fee-settings'],
    queryFn: () => base44.entities.PaymentFeeSettings.list()
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
        return base44.entities.PaymentFeeSettings.update(settingsRecord.id, data);
      } else {
        return base44.entities.PaymentFeeSettings.create(data);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-fee-settings'] });
      toast.success('Payment fee settings saved!');
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
          <div className="flex items-center gap-2 mb-2">
            <Link to="/AdminDashboard">
              <Button size="sm" variant="ghost" className="text-primary-foreground/80 hover:text-primary-foreground gap-1.5 -ml-3">
                <ArrowLeft className="w-4 h-4" />Admin Dashboard
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <DollarSign className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-extrabold">Payment Fee Buffer Settings</h1>
          </div>
          <p className="text-primary-foreground/70 text-sm mt-1">
            Configure payment processing fee buffers. These are embedded into advertised product prices.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {isLoading ? (
          <div className="animate-pulse h-40 bg-white rounded-xl" />
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Stripe Settings */}
            <Card className="p-6 border shadow-sm">
              <h2 className="text-lg font-bold mb-4">Stripe Fee Buffer</h2>
              <p className="text-sm text-muted-foreground mb-4">These percentages and fixed amounts are added to product cost to cover Stripe processing fees.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Stripe Fee Buffer Percent (%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.stripe_fee_buffer_percent}
                    onChange={(e) => updateForm('stripe_fee_buffer_percent', parseFloat(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Default: 3.5% (covers ~2.2% card + 0.5% platform fees)</p>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">Stripe Fixed Fee Buffer ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.stripe_fixed_fee_buffer}
                    onChange={(e) => updateForm('stripe_fixed_fee_buffer', parseFloat(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Default: $0.50 (covers fixed per-transaction cost)</p>
                </div>
              </div>
            </Card>

            {/* PayPal Settings */}
            <Card className="p-6 border shadow-sm">
              <h2 className="text-lg font-bold mb-4">PayPal Fee Buffer</h2>
              <p className="text-sm text-muted-foreground mb-4">These percentages and fixed amounts are added to product cost to cover PayPal processing fees.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">PayPal Fee Buffer Percent (%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.paypal_fee_buffer_percent}
                    onChange={(e) => updateForm('paypal_fee_buffer_percent', parseFloat(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Default: 4.0% (covers ~2.2% card + 1.5% platform fees)</p>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">PayPal Fixed Fee Buffer ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.paypal_fixed_fee_buffer}
                    onChange={(e) => updateForm('paypal_fixed_fee_buffer', parseFloat(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Default: $0.50 (covers fixed per-transaction cost)</p>
                </div>
              </div>
            </Card>

            {/* Additional Profit Buffer */}
            <Card className="p-6 border shadow-sm">
              <h2 className="text-lg font-bold mb-4">Additional Profit Buffer</h2>
              <p className="text-sm text-muted-foreground mb-4">Extra margin above payment fees to increase profit on all products.</p>
              <div>
                <label className="text-sm font-medium block mb-2">Additional Profit Buffer Percent (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.additional_profit_buffer_percent}
                  onChange={(e) => updateForm('additional_profit_buffer_percent', parseFloat(e.target.value))}
                />
                <p className="text-xs text-muted-foreground mt-1">Default: 0% (no extra markup). Set to 5 for 5% additional profit.</p>
              </div>
            </Card>

            {/* Price Rounding */}
            <Card className="p-6 border shadow-sm">
              <h2 className="text-lg font-bold mb-4">Price Rounding</h2>
              <p className="text-sm text-muted-foreground mb-4">How to round final advertised prices after fee calculation.</p>
              <div>
                <label className="text-sm font-medium block mb-2">Round Final Price To *</label>
                <Select value={form.price_rounding_mode} onValueChange={(val) => updateForm('price_rounding_mode', val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Rounding</SelectItem>
                    <SelectItem value="nearest_99">Nearest $X.99 (recommended)</SelectItem>
                    <SelectItem value="nearest_49">Nearest $X.49</SelectItem>
                    <SelectItem value="whole_dollar">Whole Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-2">How this works:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Final Customer Price = Blank Cost + Markup + (Stripe Fee % × Cost) + Stripe Fixed Fee + (Profit % × Cost)</li>
                <li>No processing fees are shown to customers—they're built into the advertised price.</li>
                <li>Admin can see the fee breakdown in product detail pages.</li>
                <li>Changes here apply to new prices and recalculated orders.</li>
              </ul>
            </div>

            {/* Save Button */}
            <div className="flex gap-3">
              <Button type="submit" disabled={upsert.isPending} className="gap-2">
                {upsert.isPending ? 'Saving...' : 'Save Fee Settings'}
              </Button>
              <Link to="/AdminDashboard">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}