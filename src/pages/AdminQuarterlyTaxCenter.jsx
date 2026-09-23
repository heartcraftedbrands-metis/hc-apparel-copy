import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import {
  currentQuarter, downloadText, downloadZip, isLiveTaxOrder,
  paymentMethodLabel, previousQuarter, quarterRange, quarterlyDataCheck, summarizeQuarter, toCsv,
} from '@/lib/quarterlyTax';

const currency = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const shortDate = value => value ? new Date(value).toLocaleDateString('en-US') : '';
const utcDate = value => value ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(new Date(value)) : '';
const number = value => Number(Number(value || 0).toFixed(2));
const filingStatuses = [
  ['open', 'Open'], ['reviewed', 'Reviewed'], ['ready_for_filing', 'Ready for Filing'], ['filed', 'Filed'],
];

function SummaryCard({ label, value, count = false }) {
  return <div className="rounded-xl border bg-white p-4"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-xl font-black text-primary">{count ? value : currency(value)}</p></div>;
}

function csvDownloads(periodLabel, summary) {
  const prefix = `HC-Apparel-${periodLabel}`;
  const orderRows = summary.rows.map(({ order, values }) => [
    shortDate(order.created_date), order.id, order.customer_name, order.customer_email, order.status,
    number(values.subtotal), number(values.shipping), number(values.tax), number(values.discounts), number(values.refund),
    number(values.paid), paymentMethodLabel(order), number(values.processing), number(values.vendorCost),
    number(values.vendorShipping), number(values.margin), order.fulfillment_source || order.shipping_components?.source || '',
    values.state, values.zip, shortDate(order.updated_date),
  ]);
  const summaryCsv = toCsv(['Metric', 'Amount'], [
    ['Gross Sales', number(summary.grossSales)], ['Merchandise Revenue', number(summary.merchandiseRevenue)],
    ['Shipping Revenue', number(summary.shippingRevenue)], ['Printing / Customization Revenue', number(summary.printingRevenue)],
    ['Discounts', number(summary.discounts)], ['Refunds', number(summary.refunds)], ['Net Sales', number(summary.netSales)],
    ['Sales Tax Collected', number(summary.salesTax)], ['Total Customer Payments', number(summary.customerPayments)],
    ['Payment Processing Fees', number(summary.processingFees)], ['S&S / Vendor Product Cost', number(summary.vendorCost)],
    ['Vendor Shipping Cost', number(summary.vendorShipping)], ['HC Apparel Shipping Cost', number(summary.hcShipping)],
    ['Other Vendor Fees', number(summary.otherVendorFees)], ['Estimated Gross Profit', number(summary.grossProfit)],
    ['Order Count', summary.orderCount], ['Refunded Order Count', summary.refundedOrderCount],
  ]);
  const ordersCsv = toCsv([
    'Order Date', 'Order ID', 'Customer', 'Customer Email', 'Order Status', 'Merchandise Subtotal',
    'Shipping Charged', 'Tax Collected', 'Discounts', 'Refunds', 'Total Paid', 'Payment Method',
    'Stripe Processing Cost', 'Vendor Cost', 'Vendor Shipping', 'Estimated Net Margin', 'Fulfillment Source',
    'State', 'ZIP', 'Refund / Last Updated Date',
  ], orderRows);
  const stateGroups = new Map();
  summary.rows.forEach(({ values }) => {
    const key = values.state || 'Unknown';
    const current = stateGroups.get(key) || { sales: 0, tax: 0, nonTaxable: 0 };
    current.sales += values.subtotal + values.shipping + values.printing - values.discounts;
    current.tax += values.tax;
    if (values.tax === 0) current.nonTaxable += values.subtotal + values.shipping + values.printing - values.discounts;
    stateGroups.set(key, current);
  });
  const taxCsv = toCsv(['State', 'Taxable / Reported Sales', 'Tax Collected', 'Non-Taxable Sales (based on stored $0 tax)'],
    [...stateGroups.entries()].map(([state, values]) => [state, number(values.sales - values.nonTaxable), number(values.tax), number(values.nonTaxable)]));
  const methods = new Map();
  summary.rows.forEach(({ order, values }) => {
    const key = paymentMethodLabel(order); const current = methods.get(key) || { count: 0, gross: 0, fees: 0, refunds: 0 };
    current.count += 1; current.gross += values.paid; current.fees += values.processing; current.refunds += values.refund; methods.set(key, current);
  });
  const feesCsv = toCsv(['Payment Method', 'Transaction Count', 'Gross Amount', 'Processing Fees', 'Refunds', 'Net Amount'],
    [...methods.entries()].map(([method, values]) => [method, values.count, number(values.gross), number(values.fees), number(values.refunds), number(values.gross - values.fees - values.refunds)]));
  const refundsCsv = toCsv(['Original Order Date', 'Refund / Last Updated Date', 'Order ID', 'Customer', 'Refunded Merchandise', 'Refunded Shipping', 'Refunded Tax', 'Total Refunded'],
    summary.rows.filter(({ values }) => values.refund > 0).map(({ order, values }) => [shortDate(order.created_date), shortDate(order.updated_date), order.id, order.customer_name, '', '', '', number(values.refund)]));
  return {
    [`${prefix}-Summary.csv`]: summaryCsv,
    [`${prefix}-Orders.csv`]: ordersCsv,
    [`${prefix}-Sales-Tax.csv`]: taxCsv,
    [`${prefix}-Payment-Fees.csv`]: feesCsv,
    [`${prefix}-Refunds.csv`]: refundsCsv,
  };
}

export default function AdminQuarterlyTaxCenter() {
  const now = currentQuarter();
  const [mode, setMode] = useState('quarter');
  const [year, setYear] = useState(now.year);
  const [quarter, setQuarter] = useState(now.quarter);
  const [customStart, setCustomStart] = useState(`${now.year}-01-01`);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10));
  const [check, setCheck] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [filing, setFiling] = useState({ status: 'open', filed_date: '', confirmation_reference: '', admin_notes: '' });

  const range = useMemo(() => mode === 'custom'
    ? { start: new Date(`${customStart}T00:00:00Z`), end: new Date(`${customEnd}T23:59:59.999Z`), endExclusive: new Date(new Date(`${customEnd}T23:59:59.999Z`).getTime() + 1), key: 'custom' }
    : quarterRange(year, quarter), [mode, year, quarter, customStart, customEnd]);
  const periodLabel = mode === 'custom' ? `${customStart}-to-${customEnd}` : `${year}-Q${quarter}`;

  const { data: rawOrders = [], isLoading, error: ordersError, refetch } = useQuery({
    queryKey: ['quarterly-tax-orders', range.start.toISOString(), range.endExclusive.toISOString()],
    queryFn: async () => {
      const start = range.start.toISOString(); const end = range.endExclusive.toISOString();
      const { data, error: loadError } = await supabase.from('orders').select('*')
        .or(`and(created_date.gte.${start},created_date.lt.${end}),and(updated_date.gte.${start},updated_date.lt.${end},payment_status.eq.refunded)`)
        .order('created_date', { ascending: false });
      if (loadError) throw loadError;
      return (data || []).map(order => {
        const created = new Date(order.created_date).getTime(); const updated = new Date(order.updated_date).getTime();
        return { ...order, _saleInPeriod: created >= range.start.getTime() && created < range.endExclusive.getTime(), _refundInPeriod: (order.payment_status === 'refunded' || order.status === 'refunded') && updated >= range.start.getTime() && updated < range.endExclusive.getTime() };
      }).filter(isLiveTaxOrder);
    },
  });
  const summary = useMemo(() => summarizeQuarter(rawOrders), [rawOrders]);
  const exports = useMemo(() => csvDownloads(periodLabel, summary), [periodLabel, summary]);

  const { refetch: refetchFiling } = useQuery({
    queryKey: ['quarterly-tax-filing', range.key], enabled: mode === 'quarter',
    queryFn: async () => {
      const { data, error: loadError } = await supabase.from('quarterly_tax_filings').select('*').eq('period_key', range.key).maybeSingle();
      if (loadError) throw loadError;
      const value = data || { status: 'open', filed_date: '', confirmation_reference: '', admin_notes: '' };
      setFiling(value); setCheck(value.data_check_result?.status ? value.data_check_result : null); return value;
    },
  });

  const chooseRelative = previous => {
    const value = previous ? previousQuarter() : currentQuarter(); setMode('quarter'); setYear(value.year); setQuarter(value.quarter); setCheck(null);
  };
  const runCheck = async () => {
    const result = quarterlyDataCheck(rawOrders); setCheck(result); setMessage('Quarterly data check completed. No historical records were changed.'); setError('');
    if (mode === 'quarter') await supabase.from('quarterly_tax_filings').upsert({ period_key: range.key, year: Number(year), quarter: Number(quarter), status: filing.status || 'open', data_check_status: result.status, data_check_result: result }, { onConflict: 'period_key' });
  };
  const saveFiling = async () => {
    setError(''); setMessage('');
    if (mode !== 'quarter') { setError('Filing status is available for calendar quarters, not custom ranges.'); return; }
    if (filing.status === 'ready_for_filing' && (!check || check.status === 'needs_review')) { setError('Run the data check and resolve blocking errors before marking this quarter Ready for Filing.'); return; }
    const { error: saveError } = await supabase.from('quarterly_tax_filings').upsert({
      period_key: range.key, year: Number(year), quarter: Number(quarter), status: filing.status,
      filed_date: filing.filed_date || null, confirmation_reference: filing.confirmation_reference || null,
      admin_notes: filing.admin_notes || null, data_check_status: check?.status || null, data_check_result: check || {},
    }, { onConflict: 'period_key' });
    if (saveError) setError('Quarter status could not be saved. Please try again.');
    else { setMessage('Quarter filing status saved. No tax return was submitted.'); await refetchFiling(); }
  };
  const download = suffix => { const entry = Object.entries(exports).find(([name]) => name.endsWith(suffix)); if (entry) downloadText(...entry); };

  const paymentMethods = useMemo(() => {
    const groups = new Map(); summary.rows.forEach(({ order, values }) => { const key = paymentMethodLabel(order); const row = groups.get(key) || { count: 0, gross: 0, fees: 0, refunds: 0 }; row.count += 1; row.gross += values.paid; row.fees += values.processing; row.refunds += values.refund; groups.set(key, row); }); return [...groups.entries()];
  }, [summary]);
  const stateTaxes = useMemo(() => {
    const groups = new Map(); summary.rows.forEach(({ values }) => { const key = values.state || 'Unknown'; const row = groups.get(key) || { sales: 0, tax: 0 }; row.sales += values.subtotal + values.shipping + values.printing - values.discounts; row.tax += values.tax; groups.set(key, row); }); return [...groups.entries()];
  }, [summary]);

  return <main className="min-h-screen bg-[#f6f3ea] p-4 md:p-8"><div className="mx-auto max-w-7xl space-y-7">
    <div><Link to="/AdminDashboard" className="text-sm text-primary underline">← Admin Dashboard</Link><h1 className="mt-3 text-3xl font-black text-primary">Quarterly Tax Center</h1><p className="mt-1 text-sm text-muted-foreground">Review and download quarterly sales, tax, payment, refund, and order records. This tool does not file tax returns.</p></div>
    {(error || ordersError) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error || 'Quarterly order records could not be loaded.'}</p>}
    {message && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{message}</p>}
    <section className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap gap-3"><button type="button" onClick={() => chooseRelative(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Current Quarter</button><button type="button" onClick={() => chooseRelative(true)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Previous Quarter</button><button type="button" onClick={() => setMode('custom')} className="rounded-lg border px-4 py-2 text-sm font-semibold">Custom Date Range</button><button type="button" onClick={() => refetch()} className="ml-auto inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />Refresh</button></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{mode === 'quarter' ? <><label className="text-sm font-semibold">Year<select value={year} onChange={event => { setYear(Number(event.target.value)); setCheck(null); }} className="mt-1 w-full rounded-lg border bg-white p-2">{Array.from({ length: 8 }, (_, index) => now.year - index).map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-semibold">Quarter<select value={quarter} onChange={event => { setQuarter(Number(event.target.value)); setCheck(null); }} className="mt-1 w-full rounded-lg border bg-white p-2">{[1,2,3,4].map(value => <option key={value} value={value}>Q{value} — {['Jan–Mar','Apr–Jun','Jul–Sep','Oct–Dec'][value - 1]}</option>)}</select></label></> : <><label className="text-sm font-semibold">Start date<input type="date" value={customStart} onChange={event => setCustomStart(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm font-semibold">End date<input type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label></>}<div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Selected period</p><p className="font-bold">{periodLabel}</p><p className="text-sm">{utcDate(range.start)} – {utcDate(range.end)}</p></div></div>
    </section>
    <section><h2 className="mb-3 text-xl font-black">Quarter Summary</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><SummaryCard label="Gross Sales" value={summary.grossSales} /><SummaryCard label="Merchandise Revenue" value={summary.merchandiseRevenue} /><SummaryCard label="Shipping Revenue" value={summary.shippingRevenue} /><SummaryCard label="Printing / Customization" value={summary.printingRevenue} /><SummaryCard label="Discounts" value={summary.discounts} /><SummaryCard label="Refunds" value={summary.refunds} /><SummaryCard label="Net Sales" value={summary.netSales} /><SummaryCard label="Sales Tax Collected" value={summary.salesTax} /><SummaryCard label="Customer Payments" value={summary.customerPayments} /><SummaryCard label="Processing Fees" value={summary.processingFees} /><SummaryCard label="Vendor Product Cost" value={summary.vendorCost} /><SummaryCard label="Vendor Shipping" value={summary.vendorShipping} /><SummaryCard label="HC Apparel Shipping" value={summary.hcShipping} /><SummaryCard label="Other Vendor Fees" value={summary.otherVendorFees} /><SummaryCard label="Estimated Gross Profit" value={summary.grossProfit} /><SummaryCard label="Order Count" value={summary.orderCount} count /><SummaryCard label="Refunded Orders" value={summary.refundedOrderCount} count /></div><p className="mt-3 text-xs text-muted-foreground">Sales tax collected is reported separately and is not included in revenue or estimated profit.</p></section>
    <section className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Data Quality Check</h2><p className="text-sm text-muted-foreground">Checks missing tax, payment, shipping, costs, refunds, duplicates, total mismatches, test records, and fulfillment source.</p></div><button type="button" onClick={runCheck} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Run Quarterly Data Check</button></div>{check && <div className={`mt-4 rounded-xl p-4 ${check.status === 'passed' ? 'bg-green-50 text-green-800' : check.status === 'needs_review' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}><p className="flex items-center gap-2 font-bold">{check.status === 'passed' ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}{check.status === 'passed' ? 'Passed' : check.status === 'needs_review' ? 'Needs Review' : 'Warnings'}</p>{check.warnings.length > 0 && <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">{check.warnings.map((item, index) => <li key={`${item.order_id}-${index}`}>#{String(item.order_id).slice(-8)} — {item.message}</li>)}</ul>}</div>}</section>
    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Sales Tax</h2><p className="mt-1 text-xs text-muted-foreground">Based only on stored order tax and shipping-state data. Locality is not guessed.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">State</th><th>Reported sales</th><th>Tax collected</th></tr></thead><tbody>{stateTaxes.map(([state, values]) => <tr key={state} className="border-b"><td className="py-2">{state}</td><td>{currency(values.sales)}</td><td>{currency(values.tax)}</td></tr>)}</tbody></table></div></section><section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Payment Methods</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Method</th><th>Count</th><th>Gross</th><th>Fees</th><th>Net</th></tr></thead><tbody>{paymentMethods.map(([method, values]) => <tr key={method} className="border-b"><td className="py-2">{method}</td><td>{values.count}</td><td>{currency(values.gross)}</td><td>{currency(values.fees)}</td><td>{currency(values.gross - values.fees - values.refunds)}</td></tr>)}</tbody></table></div></section></div>
    <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Quarterly Orders</h2><div className="mt-4 overflow-x-auto"><table className="min-w-[1250px] w-full text-xs"><thead><tr className="border-b text-left">{['Order Date','Order ID','Customer','Status','Merchandise','Shipping','Tax','Discounts','Refunds','Paid','Payment','Processing','Vendor Cost','Vendor Shipping','Net Margin','Fulfillment','State','ZIP'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{summary.rows.map(({ order, values }) => <tr key={order.id} className="border-b"><td className="p-2">{shortDate(order.created_date)}</td><td>{String(order.id).slice(-8).toUpperCase()}</td><td>{order.customer_name}</td><td>{order.status}</td><td>{currency(values.subtotal)}</td><td>{currency(values.shipping)}</td><td>{currency(values.tax)}</td><td>{currency(values.discounts)}</td><td>{currency(values.refund)}</td><td>{currency(values.paid)}</td><td>{paymentMethodLabel(order)}</td><td>{currency(values.processing)}</td><td>{currency(values.vendorCost)}</td><td>{currency(values.vendorShipping)}</td><td>{currency(values.margin)}</td><td>{order.fulfillment_source || 'Not stored'}</td><td>{values.state}</td><td>{values.zip}</td></tr>)}</tbody></table>{!isLoading && summary.rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No live financial orders found for this period.</p>}</div></section>
    <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Downloads</h2><div className="mt-4 flex flex-wrap gap-2">{[['Summary.csv','Quarterly Summary'],['Orders.csv','Detailed Orders'],['Sales-Tax.csv','Sales Tax'],['Payment-Fees.csv','Payment Fees'],['Refunds.csv','Refunds']].map(([suffix, label]) => <button key={suffix} type="button" onClick={() => download(suffix)} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold"><FileSpreadsheet className="h-4 w-4" />Download {label} CSV</button>)}<button type="button" onClick={() => downloadZip(`HC-Apparel-${periodLabel}-Tax-Package.zip`, exports)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"><Download className="h-4 w-4" />Download Full Quarterly Package</button></div></section>
    <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Quarter Filing Status</h2><p className="mt-1 text-sm text-muted-foreground">Internal bookkeeping status only. No tax return is submitted.</p>{mode === 'custom' ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm">Choose a calendar quarter to save filing status.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Status<select value={filing.status || 'open'} onChange={event => setFiling(value => ({ ...value, status: event.target.value }))} className="mt-1 w-full rounded-lg border bg-white p-2">{filingStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-semibold">Filed date<input type="date" value={filing.filed_date || ''} onChange={event => setFiling(value => ({ ...value, filed_date: event.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm font-semibold sm:col-span-2">Confirmation / Reference Number<input value={filing.confirmation_reference || ''} onChange={event => setFiling(value => ({ ...value, confirmation_reference: event.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label><label className="text-sm font-semibold sm:col-span-2">Admin Notes<textarea rows={4} value={filing.admin_notes || ''} onChange={event => setFiling(value => ({ ...value, admin_notes: event.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label><button type="button" onClick={saveFiling} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white sm:col-span-2">Save Quarter Status</button></div>}</section>
  </div></main>;
}
