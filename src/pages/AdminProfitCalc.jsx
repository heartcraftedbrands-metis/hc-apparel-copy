import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calculator, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import MarginBadge, { getMarginStatus } from '@/components/profit/MarginBadge';

const EMPTY = {
  customer_sale_price: '', quantity: '1',
  blank_garment_cost: '', print_cost: '', setup_fee: '',
  shipping_cost: '', packaging_cost: '', payment_processing_fee: '',
  other_fees: '', discount_amount: '', tax_collected: '',
};

function DollarInput({ label, value, onChange, accent, hint }) {
  return (
    <div className={`rounded-xl p-4 ${accent ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30'}`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className={`text-sm font-semibold ${accent ? 'text-primary' : 'text-foreground'}`}>{label}</label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">$</span>
        <Input type="number" step="0.01" min="0" placeholder="0.00" value={value} onChange={onChange}
          className={`pl-7 ${accent ? 'border-primary/30 focus-visible:ring-primary' : ''}`} />
      </div>
    </div>
  );
}

export default function AdminProfitCalc() {
  const [form, setForm] = useState(EMPTY);
  const n = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const reset = () => setForm(EMPTY);

  const qty              = Math.max(Number(form.quantity) || 1, 1);
  const salePriceEach    = Number(form.customer_sale_price) || 0;
  const blankEach        = Number(form.blank_garment_cost) || 0;
  const printEach        = Number(form.print_cost) || 0;
  const setupFeeTotal    = Number(form.setup_fee) || 0;
  const shippingTotal    = Number(form.shipping_cost) || 0;
  const packagingTotal   = Number(form.packaging_cost) || 0;
  const paymentFeeTotal  = Number(form.payment_processing_fee) || 0;
  const otherFeesTotal   = Number(form.other_fees) || 0;
  const discount         = Number(form.discount_amount) || 0;
  const taxCollected     = Number(form.tax_collected) || 0;

  const totalRevenue    = (salePriceEach * qty) - discount + taxCollected;
  const totalBlank      = blankEach * qty;
  const totalPrint      = printEach * qty;
  const totalFees       = setupFeeTotal + shippingTotal + packagingTotal + paymentFeeTotal + otherFeesTotal;
  const totalVendorCost = totalBlank + totalPrint + totalFees;
  const estimatedProfit = totalRevenue - totalVendorCost;
  const profitMargin    = totalRevenue > 0 ? (estimatedProfit / totalRevenue * 100) : 0;
  const profitPerItem   = qty > 0 ? (estimatedProfit / qty) : 0;
  const status          = getMarginStatus(profitMargin);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto flex items-center gap-3">
          <Calculator className="w-6 h-6 text-accent" />
          <div>
            <h1 className="text-xl font-bold">Profit Calculator</h1>
            <p className="text-primary-foreground/70 text-sm">Estimate margin and per-order profitability before quoting</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Inputs */}
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <h2 className="font-bold text-sm mb-4 text-muted-foreground uppercase tracking-wide">Revenue</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <DollarInput accent label="Customer Sale Price (per item)" value={form.customer_sale_price} onChange={n('customer_sale_price')} hint={qty > 1 ? `×${qty} = $${(salePriceEach * qty).toFixed(2)}` : ''} />
                </div>
                <div className={`rounded-xl p-4 bg-muted/30`}>
                  <label className="text-sm font-semibold block mb-1.5">Quantity</label>
                  <Input type="number" min="1" placeholder="1" value={form.quantity} onChange={n('quantity')} />
                </div>
                <DollarInput label="Discount Amount" value={form.discount_amount} onChange={n('discount_amount')} />
                <DollarInput label="Tax Collected" value={form.tax_collected} onChange={n('tax_collected')} hint="(not kept as profit)" />
              </div>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <h2 className="font-bold text-sm mb-4 text-muted-foreground uppercase tracking-wide">Per-Item Costs</h2>
              <div className="grid grid-cols-2 gap-3">
                <DollarInput label="Blank Garment Cost" value={form.blank_garment_cost} onChange={n('blank_garment_cost')} hint={qty > 1 ? `total $${totalBlank.toFixed(2)}` : ''} />
                <DollarInput label="Print Cost" value={form.print_cost} onChange={n('print_cost')} hint={qty > 1 ? `total $${totalPrint.toFixed(2)}` : ''} />
              </div>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <h2 className="font-bold text-sm mb-4 text-muted-foreground uppercase tracking-wide">Order-Level Fees</h2>
              <div className="grid grid-cols-2 gap-3">
                <DollarInput label="Setup Fee" value={form.setup_fee} onChange={n('setup_fee')} />
                <DollarInput label="Shipping Cost" value={form.shipping_cost} onChange={n('shipping_cost')} />
                <DollarInput label="Packaging Cost" value={form.packaging_cost} onChange={n('packaging_cost')} />
                <DollarInput label="Payment Processing Fee" value={form.payment_processing_fee} onChange={n('payment_processing_fee')} />
                <div className="col-span-2">
                  <DollarInput label="Other Fees" value={form.other_fees} onChange={n('other_fees')} />
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={reset} className="w-full gap-2">
              <RefreshCw className="w-4 h-4" /> Reset Calculator
            </Button>
          </div>

          {/* Results */}
          <div className="lg:col-span-2 space-y-4">
            {/* Alert banner */}
            <div className={`rounded-2xl border p-4 ${status.color}`}>
              <div className="flex items-center gap-2 font-bold">
                {status.icon === 'up' ? <TrendingUp className="w-5 h-5" /> : status.icon === 'warn' ? <AlertTriangle className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {status.label}
              </div>
            </div>

            {/* Main result */}
            <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">Results</h2>

              {[
                { label: 'Total Revenue', value: totalRevenue, bold: false, color: 'text-primary font-semibold' },
                { label: 'Total Blank Cost', value: totalBlank, bold: false, color: 'text-muted-foreground' },
                { label: 'Total Print Cost', value: totalPrint, bold: false, color: 'text-muted-foreground' },
                { label: 'Total Fees', value: totalFees, bold: false, color: 'text-muted-foreground' },
                { label: 'Total Vendor Cost', value: totalVendorCost, bold: true, color: 'text-red-600 font-bold' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-muted last:border-0">
                  <span className="text-sm text-muted-foreground">{r.label}</span>
                  <span className={r.color}>${r.value.toFixed(2)}</span>
                </div>
              ))}

              {/* Profit highlight */}
              <div className={`rounded-xl p-4 mt-2 ${estimatedProfit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold">Est. Profit</span>
                  <span className={`text-2xl font-black ${estimatedProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    ${estimatedProfit.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm mb-3">
                  <span className="text-muted-foreground">Profit Margin</span>
                  <span className="font-bold">{profitMargin.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center text-sm mb-4">
                  <span className="text-muted-foreground">Profit Per Item</span>
                  <span className="font-bold">${profitPerItem.toFixed(2)}</span>
                </div>

                {/* Bar */}
                <div className="h-3 bg-white/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${status.bar}`}
                    style={{ width: `${Math.min(Math.max(profitMargin, 0), 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0%</span><span>20%</span><span>35%</span><span>100%</span>
                </div>
              </div>
            </div>

            {/* Breakdown summary */}
            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wide mb-3">Summary ({qty} item{qty !== 1 ? 's' : ''})</h2>
              <div className="space-y-2 text-sm">
                {[
                  ['Customer Revenue', totalRevenue, 'text-primary'],
                  ['Blank Garments', totalBlank, 'text-foreground'],
                  ['Print / Decoration', totalPrint, 'text-foreground'],
                  ['All Fees', totalFees, 'text-foreground'],
                  ['Your Profit', estimatedProfit, estimatedProfit >= 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-muted-foreground">{l}</span>
                    <span className={c}>${Number(v).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}