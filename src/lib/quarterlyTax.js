const money = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const jsonValue = (value, keys) => {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    const parsed = Number(value[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export function quarterRange(year, quarter) {
  const startMonth = (Number(quarter) - 1) * 3;
  const start = new Date(Date.UTC(Number(year), startMonth, 1));
  const endExclusive = new Date(Date.UTC(Number(year), startMonth + 3, 1));
  const end = new Date(endExclusive.getTime() - 1);
  return { start, end, endExclusive, key: `${year}-Q${quarter}` };
}

export function currentQuarter(reference = new Date()) {
  return { year: reference.getUTCFullYear(), quarter: Math.floor(reference.getUTCMonth() / 3) + 1 };
}

export function previousQuarter(reference = new Date()) {
  const current = currentQuarter(reference);
  return current.quarter === 1
    ? { year: current.year - 1, quarter: 4 }
    : { year: current.year, quarter: current.quarter - 1 };
}

export function isLiveTaxOrder(order) {
  const text = [order?.status, order?.payment_status, order?.internal_notes, order?.notes]
    .map(value => String(value || '').toLowerCase()).join(' ');
  if (order?.is_sample || /\b(qa|test|sandbox|demo|checkout_failed|payment_start_failed)\b/.test(text)) return false;
  if (String(order?.stripe_session_id || '').startsWith('cs_test_')) return false;
  if (['checkout_failed', 'payment_start_failed', 'archived'].includes(String(order?.status || ''))) return false;
  if (['paid', 'partially_paid', 'refunded'].includes(String(order?.payment_status || ''))) return true;
  return ['paid', 'refunded', 'completed', 'shipped'].includes(String(order?.status || '')) && money(order?.amount_paid) > 0;
}

export function paymentMethodLabel(order) {
  const value = String(order?.payment_method_type || order?.payment_method || '').toLowerCase();
  if (value.includes('afterpay') || value.includes('clearpay')) return 'Cash App Afterpay';
  if (value.includes('klarna')) return 'Klarna';
  if (value.includes('apple')) return 'Apple Pay';
  if (value.includes('cash')) return 'Cash App Pay';
  if (value.includes('link')) return 'Link';
  if (value.includes('card')) return 'Card';
  return value ? 'Other' : 'Unknown';
}

export function orderFinancials(order) {
  const includeSale = order?._saleInPeriod !== false;
  const includeRefund = order?._refundInPeriod !== false;
  const snapshot = order?.pricing_snapshot || {};
  const subtotal = money(order?.product_subtotal ?? jsonValue(snapshot, ['product_subtotal', 'merchandise_subtotal']));
  const shipping = money(order?.shipping_amount ?? jsonValue(snapshot, ['shipping_amount', 'shipping']));
  const printing = money(order?.printing_revenue ?? jsonValue(snapshot, ['printing_revenue', 'customization_total']));
  const tax = money(order?.sales_tax_amount ?? jsonValue(snapshot, ['sales_tax_amount', 'tax_amount']));
  const discounts = money(jsonValue(snapshot, ['discount_amount', 'discounts']));
  const paid = money(order?.amount_paid ?? order?.total_amount);
  const storedRefund = jsonValue(snapshot, ['refund_amount', 'refunded_amount', 'total_refunded']);
  const refund = includeRefund ? (storedRefund === null && (order?.payment_status === 'refunded' || order?.status === 'refunded') ? paid : money(storedRefund)) : 0;
  const processing = money(order?.actual_processing_cost ?? order?.estimated_processing_cost ?? order?.payment_processing_estimate);
  const vendorCost = money(order?.vendor_garment_cost ?? order?.vendor_cost_estimate);
  const vendorShipping = money(order?.actual_vendor_shipping ?? order?.estimated_vendor_shipping);
  const hcShipping = money(order?.actual_shipping_cost);
  const otherFees = money(order?.other_vendor_fees);
  const merchandiseRevenue = subtotal || Math.max(0, paid - shipping - printing - tax + discounts);
  const grossSales = includeSale ? merchandiseRevenue + shipping + printing - discounts : 0;
  const netSales = grossSales - refund;
  const address = order?.shipping_address || {};
  return {
    subtotal: includeSale ? merchandiseRevenue : 0,
    shipping: includeSale ? shipping : 0,
    printing: includeSale ? printing : 0,
    tax: includeSale ? tax : 0,
    discounts: includeSale ? discounts : 0,
    refund,
    paid: includeSale ? paid : 0,
    processing: includeSale ? processing : 0,
    vendorCost: includeSale ? vendorCost : 0,
    vendorShipping: includeSale ? vendorShipping : 0,
    hcShipping: includeSale ? hcShipping : 0,
    otherFees: includeSale ? otherFees : 0,
    grossSales, netSales, margin: netSales - (includeSale ? processing + vendorCost + vendorShipping + hcShipping + otherFees : 0),
    state: String(address.state || '').toUpperCase(),
    zip: String(address.zip || address.postal_code || ''),
    locality: String(address.county || address.locality || ''),
  };
}

export function summarizeQuarter(orders) {
  const rows = orders.map(order => ({ order, values: orderFinancials(order) }));
  const sum = key => rows.reduce((total, row) => total + money(row.values[key]), 0);
  return {
    rows,
    grossSales: sum('grossSales'),
    merchandiseRevenue: sum('subtotal'),
    shippingRevenue: sum('shipping'),
    printingRevenue: sum('printing'),
    discounts: sum('discounts'),
    refunds: sum('refund'),
    netSales: sum('netSales'),
    salesTax: sum('tax'),
    customerPayments: sum('paid'),
    processingFees: sum('processing'),
    vendorCost: sum('vendorCost'),
    vendorShipping: sum('vendorShipping'),
    hcShipping: sum('hcShipping'),
    otherVendorFees: sum('otherFees'),
    grossProfit: sum('margin'),
    orderCount: rows.length,
    refundedOrderCount: rows.filter(row => row.values.refund > 0).length,
  };
}

export function quarterlyDataCheck(orders) {
  const warnings = [];
  const seen = new Set();
  orders.forEach(order => {
    const values = orderFinancials(order);
    if (seen.has(order.id)) warnings.push({ severity: 'error', order_id: order.id, message: 'Duplicate order ID.' });
    seen.add(order.id);
    if (order.sales_tax_amount == null) warnings.push({ severity: 'warning', order_id: order.id, message: 'Tax amount is not stored.' });
    if (!order.payment_method_type && !order.payment_method) warnings.push({ severity: 'warning', order_id: order.id, message: 'Payment method is missing.' });
    if (order.shipping_amount == null) warnings.push({ severity: 'warning', order_id: order.id, message: 'Shipping amount is not stored.' });
    if ((order.status === 'refunded' || order.payment_status === 'refunded') && jsonValue(order.pricing_snapshot, ['refund_amount', 'refunded_amount', 'total_refunded']) === null) warnings.push({ severity: 'warning', order_id: order.id, message: 'Refund total is inferred from the paid amount; refund breakdown is unavailable.' });
    if (values.paid <= 0) warnings.push({ severity: 'error', order_id: order.id, message: 'Paid order has a zero amount.' });
    if (!order.fulfillment_source && !order.shipping_components) warnings.push({ severity: 'warning', order_id: order.id, message: 'Fulfillment source is missing.' });
    const expected = values.subtotal + values.shipping + values.printing + values.tax - values.discounts;
    if (values.paid > 0 && Math.abs(expected - values.paid) > 0.02) warnings.push({ severity: 'warning', order_id: order.id, message: 'Stored components do not reconcile to total paid.' });
  });
  const errors = warnings.filter(item => item.severity === 'error');
  return { status: errors.length ? 'needs_review' : warnings.length ? 'warnings' : 'passed', warnings };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers, rows) {
  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  bytes.forEach(byte => { crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); });
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) { return [value & 255, (value >>> 8) & 255]; }
function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }

export function downloadZip(filename, files) {
  const encoder = new TextEncoder();
  const local = []; const central = []; let offset = 0;
  Object.entries(files).forEach(([name, text]) => {
    const nameBytes = encoder.encode(name); const data = encoder.encode(text); const crc = crc32(data);
    const localHeader = new Uint8Array([0x50,0x4b,0x03,0x04,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(nameBytes.length),0,0]);
    local.push(localHeader, nameBytes, data);
    central.push(new Uint8Array([0x50,0x4b,0x01,0x02,20,0,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(nameBytes.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(offset)]), nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  });
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array([0x50,0x4b,0x05,0x06,0,0,0,0,...u16(Object.keys(files).length),...u16(Object.keys(files).length),...u32(centralSize),...u32(offset),0,0]);
  const url = URL.createObjectURL(new Blob([...local, ...central, end], { type: 'application/zip' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
