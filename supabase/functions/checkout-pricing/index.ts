import { createClient } from 'npm:@supabase/supabase-js@2';
import { getSupabasePublishableKey, getSupabaseServiceCredential } from '../_shared/supabaseCredentials.ts';

const allowedOrigins = ['https://www.ilovehcapparel.net', 'https://ilovehcapparel.net', 'http://localhost:5173'];
const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
});
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const safeNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const optionalPriceNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return optionalPriceNumber(record.value ?? record.amount ?? record.price ?? record.total);
  }
  return null;
};
const positivePrice = (...values: unknown[]) => values.map(optionalPriceNumber).find((value) => value != null && value > 0) ?? null;
const firstPrice = (...values: unknown[]) => values.map(optionalPriceNumber).find((value) => value != null) ?? null;

const booleanValue = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (value === 1 || String(value).trim().toLowerCase() === 'true') return true;
  if (value === 0 || String(value).trim().toLowerCase() === 'false') return false;
  return null;
};

type Settings = Record<string, unknown>;
type Item = Record<string, unknown>;
type Product = Record<string, unknown>;

class CheckoutConfigurationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CheckoutConfigurationError';
    this.code = code;
  }
}

const customerShippingError = 'We’re having trouble calculating shipping. Please try again or contact HC Apparel.';

const customerSafeQuote = (quote: Record<string, unknown>) => ({
  merchandise: quote.merchandise,
  shipping: quote.shipping,
  tax: quote.tax,
  tax_detail: quote.taxDetail ? {
    method: (quote.taxDetail as Item).method,
    jurisdiction_name: (quote.taxDetail as Item).jurisdiction_name,
    rate_percent: (quote.taxDetail as Item).rate_percent,
  } : null,
  total: quote.total,
  services: quote.services,
  needsSelection: quote.needsSelection,
  warnings: quote.warnings,
  components: Array.isArray(quote.components)
    ? quote.components.map((component: Item) => ({
      customer_charge: component.customer_charge,
      carrier: component.carrier === 'Fallback' ? 'Standard' : component.carrier,
      service: component.source === 'ss_activewear'
        ? 'Standard shipping'
        : component.service || 'Standard shipping',
    }))
    : [],
});

const paymentMethodDefaults: Record<string, Item> = {
  card: { label: 'Card', enabled: true, percentage: 2.9, fixed_fee: 0.3 },
  apple_pay: { label: 'Apple Pay', enabled: true, percentage: 2.9, fixed_fee: 0.3 },
  cashapp: { label: 'Cash App Pay', enabled: true, percentage: 2.9, fixed_fee: 0.3 },
  link: { label: 'Link / Card', enabled: true, percentage: 2.9, fixed_fee: 0.3 },
  afterpay_clearpay: { label: 'Cash App Afterpay', enabled: true, percentage: 6, fixed_fee: 0.3 },
  klarna: { label: 'Klarna', enabled: true, percentage: 5.99, fixed_fee: 0.3 },
};
const normalizePaymentMethods = (value: unknown) => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Item> : {};
  return Object.fromEntries(Object.entries(paymentMethodDefaults).map(([key, defaults]) => {
    const supplied = input[key] || {};
    return [key, {
      ...defaults,
      ...supplied,
      enabled: supplied.enabled == null ? defaults.enabled : supplied.enabled === true,
      percentage: Math.max(0, Math.min(99, safeNumber(supplied.percentage ?? defaults.percentage))),
      fixed_fee: Math.max(0, safeNumber(supplied.fixed_fee ?? defaults.fixed_fee)),
    }];
  }));
};
const worstPaymentCost = (charge: number, value: unknown) => Object.entries(normalizePaymentMethods(value))
  .filter(([, method]) => method.enabled === true)
  .map(([key, method]) => ({
    key,
    label: String(method.label || key),
    percentage: safeNumber(method.percentage),
    fixed_fee: safeNumber(method.fixed_fee),
    amount: money(charge * safeNumber(method.percentage) / 100 + safeNumber(method.fixed_fee)),
  }))
  .sort((a, b) => b.amount - a.amount)[0] || { key: null, label: 'Disabled', percentage: 0, fixed_fee: 0, amount: 0 };

const settingsBooleanFields = new Set([
  'processing_enabled', 'sales_tax_enabled', 'ss_shipping_enabled', 'usps_enabled',
  'usps_ground_advantage_enabled', 'usps_priority_mail_enabled', 'hc_fallback_enabled',
  'hc_free_shipping_enabled', 'public_visitor_price_markup_enabled', 'georgia_sales_tax_enabled',
]);
const settingsNumberFields = new Set([
  'minimum_margin_per_item', 'processing_percent', 'processing_fixed_fee',
  'sales_tax_rate_percent', 'ss_free_freight_threshold', 'ss_tier_1_2', 'ss_tier_3_5',
  'ss_tier_6_12', 'ss_tier_13_plus', 'ss_shipping_buffer', 'default_product_weight_oz',
  'default_package_length_in', 'default_package_width_in', 'default_package_height_in',
  'hc_fallback_rate', 'hc_free_shipping_threshold', 'hc_handling_amount',
  'public_visitor_price_difference',
]);
const settingsTextFields = new Set([
  'origin_street', 'origin_city', 'origin_state', 'origin_zip',
  'default_product_weight_unit', 'default_package_dimension_unit', 'georgia_tax_method',
]);

let uspsToken: { value: string; expiresAt: number } | null = null;
let uspsTokenMetadata: { status: string | null; scope: string[]; apiProducts: string[] } | null = null;

async function getUspsToken() {
  if (uspsToken && Date.now() < uspsToken.expiresAt - 60_000) return uspsToken.value;
  const clientId = Deno.env.get('USPS_CLIENT_ID')?.trim();
  const clientSecret = Deno.env.get('USPS_CLIENT_SECRET')?.trim();
  if (!clientId || !clientSecret) throw new Error('USPS credentials are not configured.');
  const response = await fetch('https://apis.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const safeCode = String(data.error || data.code || 'oauth_failed').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
    const safeDescription = String(data.error_description || data.message || '').replace(/[\r\n]+/g, ' ').slice(0, 180);
    throw new Error(`USPS OAuth failed (${response.status}, ${safeCode})${safeDescription ? `: ${safeDescription}` : '.'}`);
  }
  uspsToken = { value: data.access_token, expiresAt: Date.now() + safeNumber(data.expires_in || 28_800) * 1000 };
  uspsTokenMetadata = {
    status: typeof data.status === 'string' ? data.status.slice(0, 80) : null,
    scope: typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean).slice(0, 30) : [],
    apiProducts: Array.isArray(data.api_products)
      ? data.api_products.map(String).slice(0, 20)
      : typeof data.api_products === 'string' ? [data.api_products.slice(0, 200)] : [],
  };
  return uspsToken.value;
}

const variantFor = (product: Product, item: Item) => {
  const variants = Array.isArray(product.size_prices) ? product.size_prices as Item[] : [];
  const color = String(item.color || '').trim().toLowerCase();
  const size = String(item.size || '').trim().toLowerCase();
  return variants.find((variant) => {
    const label = String(variant.size || '').trim().toLowerCase();
    return label === `${color} / ${size}` || (
      String(variant.color || '').trim().toLowerCase() === color
      && String(variant.size || '').trim().toLowerCase() === size
    );
  });
};

async function ssFreeFreightEligibility(legs: Item[]) {
  if (legs.some((item) => (item.product as Product)?.ss_exclude_free_freight === true)) {
    return { eligible: false, verified: true, reason: 'At least one S&S product is excluded from free freight' };
  }
  if (legs.every((item) => (item.product as Product)?.ss_exclude_free_freight === false)) {
    return { eligible: true, verified: true, reason: 'Stored S&S free-freight eligibility verified' };
  }

  const skuList = [...new Set(legs.map((item) => {
    const variant = variantFor(item.product as Product, item);
    return String(variant?.sku || item.sku || '').trim();
  }).filter(Boolean))];
  const accountNumber = Deno.env.get('SS_ACCOUNT_NUMBER')?.trim();
  const apiKey = Deno.env.get('SS_API_KEY')?.trim();
  if (!skuList.length || !accountNumber || !apiKey) {
    return { eligible: false, verified: false, reason: 'S&S free-freight eligibility could not be verified' };
  }

  try {
    const url = new URL(`https://api.ssactivewear.com/v2/products/${skuList.map(encodeURIComponent).join(',')}`);
    url.searchParams.set('fields', 'Sku,ExcludeFreeFreight');
    url.searchParams.set('mediatype', 'json');
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${btoa(`${accountNumber}:${apiKey}`)}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { eligible: false, verified: false, reason: 'S&S free-freight eligibility lookup failed' };
    const result = await response.json();
    const rows = (Array.isArray(result) ? result : [result]) as Item[];
    const eligibilityBySku = new Map(rows.map((row) => [
      String(row.sku ?? row.Sku ?? '').trim().toLowerCase(),
      booleanValue(row.excludeFreeFreight ?? row.ExcludeFreeFreight),
    ]));
    const exclusions = skuList.map((sku) => eligibilityBySku.get(sku.toLowerCase()));
    if (exclusions.length !== skuList.length || exclusions.some((value) => value == null)) {
      return { eligible: false, verified: false, reason: 'S&S returned incomplete free-freight eligibility' };
    }
    return exclusions.some(Boolean)
      ? { eligible: false, verified: true, reason: 'At least one S&S SKU is excluded from free freight' }
      : { eligible: true, verified: true, reason: 'All S&S SKUs are eligible for free freight' };
  } catch (error) {
    console.warn('S&S free-freight eligibility lookup unavailable', { name: error instanceof Error ? error.name : 'Unknown' });
    return { eligible: false, verified: false, reason: 'S&S free-freight eligibility could not be verified' };
  }
}

type UspsRateDiagnostics = { requests: Array<Record<string, unknown>> };

const sanitizeUspsValue = (value: unknown, depth = 0): unknown => {
  if (depth > 10) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 30).map((entry) => sanitizeUspsValue(entry, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 500) : value;
  const blocked = /token|authorization|credential|secret|client|^account$|account(number|id)|crid|^mid$/i;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !blocked.test(key))
    .slice(0, 60)
    .map(([key, entry]) => [key, sanitizeUspsValue(entry, depth + 1)]));
};

const uspsOptionSummaries = (value: unknown) => {
  const summaries: Array<Record<string, unknown>> = [];
  const visit = (entry: unknown, inherited: Record<string, unknown> = {}, depth = 0) => {
    if (depth > 10 || entry == null) return;
    if (Array.isArray(entry)) return entry.forEach((item) => visit(item, inherited, depth + 1));
    if (typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const context = {
      mailClass: record.mailClass ?? inherited.mailClass ?? null,
      description: record.description ?? record.serviceName ?? record.productName ?? inherited.description ?? null,
      SKU: record.SKU ?? record.sku ?? inherited.SKU ?? null,
      priceType: record.priceType ?? inherited.priceType ?? null,
      zone: record.zone ?? inherited.zone ?? null,
      warnings: record.warnings ?? inherited.warnings ?? [],
    };
    const hasRateFields = ['price', 'totalBasePrice', 'totalPrice', 'fees'].some((key) => key in record);
    if (hasRateFields) summaries.push({
      ...context,
      price: optionalPriceNumber(record.price),
      totalBasePrice: optionalPriceNumber(record.totalBasePrice),
      totalPrice: optionalPriceNumber(record.totalPrice),
      fees: sanitizeUspsValue(record.fees ?? []),
    });
    for (const key of ['pricingOptions', 'rates', 'rateOptions', 'prices', 'shippingOptions', 'options']) {
      if (key in record) visit(record[key], context, depth + 1);
    }
  };
  visit(value);
  return summaries;
};

async function uspsDomesticRates(settings: Settings, destinationZip: string, ounces: number, dimensions: Record<string, number> | null, diagnostics?: UspsRateDiagnostics) {
  const token = await getUspsToken();
  const pounds = Math.max(0.01, ounces / 16);
  const dimensionFields = dimensions && dimensions.length > 0 && dimensions.width > 0 && dimensions.height > 0
    ? { length: dimensions.length, width: dimensions.width, height: dimensions.height }
    : {};
  const baseRequest = {
    originZIPCode: String(settings.origin_zip || '').replace(/\D/g, '').slice(0, 5),
    destinationZIPCode: destinationZip.replace(/\D/g, '').slice(0, 5),
    weight: pounds,
    ...dimensionFields,
    processingCategory: 'MACHINABLE',
    destinationEntryFacilityType: 'NONE',
    rateIndicator: 'SP',
    priceType: 'RETAIL',
    mailingDate: new Date().toISOString().slice(0, 10),
  };
  const mailClasses = [
    settings.usps_ground_advantage_enabled !== false ? 'USPS_GROUND_ADVANTAGE' : null,
    settings.usps_priority_mail_enabled !== false ? 'PRIORITY_MAIL' : null,
  ].filter(Boolean);
  const failures: string[] = [];
  const results = await Promise.all(mailClasses.map(async (mailClass) => {
    const response = await fetch('https://apis.usps.com/prices/v3/base-rates/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseRequest, mailClass }),
    });
    const data = await response.json().catch(() => ({}));
    diagnostics?.requests.push({
      mail_class: mailClass,
      status: response.status,
      top_level_keys: data && typeof data === 'object' ? Object.keys(data).slice(0, 20) : [],
      rate_count: Array.isArray(data?.rates) ? data.rates.length : null,
      rate_option_count: Array.isArray(data?.rateOptions) ? data.rateOptions.length : null,
      total_price: optionalPriceNumber(data?.totalPrice),
      total_base_price: optionalPriceNumber(data?.totalBasePrice),
      total_base_price_type: typeof data?.totalBasePrice,
      first_rate_keys: Array.isArray(data?.rates) && data.rates[0] && typeof data.rates[0] === 'object' ? Object.keys(data.rates[0]).slice(0, 20) : [],
      first_rate_price: Array.isArray(data?.rates) ? optionalPriceNumber(data.rates[0]?.price) : null,
      options: uspsOptionSummaries(data),
      sanitized_response: sanitizeUspsValue(data),
    });
    if (!response.ok) {
      console.warn('USPS Domestic Pricing rejected a rate request', { status: response.status, mail_class: mailClass });
      const safeCode = String(data.error?.code || data.code || data.error || 'rate_failed').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
      const safeMessage = String(data.error?.message || data.message || data.error_description || '').replace(/[\r\n]+/g, ' ').slice(0, 180);
      failures.push(`${mailClass}: ${response.status} ${safeCode}${safeMessage ? ` — ${safeMessage}` : ''}`);
      return [];
    }
    const candidates = Array.isArray(data) ? data : (data.rates || data.rateOptions || data.prices || []);
    return candidates.flatMap((entry: Item) => Array.isArray(entry.rates) ? entry.rates : [entry])
      .map((rate: Item) => ({ ...rate, requestedMailClass: mailClass, responseTotalBasePrice: data.totalBasePrice }));
  }));
  const rates = results.flat().map((rate: Item) => {
    const rawName = String(rate.mailClass || rate.requestedMailClass || rate.serviceName || rate.description || rate.productName || '');
    const normalizedName = rawName.replace(/[_-]+/g, ' ');
    const name = /USPS GROUND ADVANTAGE/i.test(normalizedName)
      ? 'USPS Ground Advantage'
      : /PRIORITY MAIL/i.test(normalizedName)
        ? 'USPS Priority Mail'
        : normalizedName;
    return {
      id: String(rate.mailClass || rate.productId || name).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      service: name,
      amount: money([
        rate.totalPrice,
        rate.totalBasePrice,
        rate.price,
        rate.responseTotalBasePrice,
        rate.rate,
      ].map(optionalPriceNumber).find((value) => value != null && value > 0) ?? Number.NaN),
      delivery: rate.deliveryTime || rate.serviceStandard || null,
    };
  }).filter((rate: { service: string; amount: number }) => rate.amount > 0);
  if (!rates.length && failures.length) throw new Error(`USPS Domestic Pricing failed: ${failures.join('; ')}`);
  return rates;
}

const shippingOptionsPayload = (originZip: string, destinationZip: string, ounces: number, dimensions: Record<string, number> | null) => ({
  pricingOptions: [{ priceType: 'RETAIL' }],
  originZIPCode: originZip.replace(/\D/g, '').slice(0, 5),
  destinationZIPCode: destinationZip.replace(/\D/g, '').slice(0, 5),
  packageDescription: {
    weight: Math.max(0.01, ounces / 16),
    ...(dimensions && dimensions.length > 0 && dimensions.width > 0 && dimensions.height > 0
      ? { length: dimensions.length, width: dimensions.width, height: dimensions.height }
      : {}),
    mailClass: 'ALL',
    extraServices: [],
    mailingDate: new Date().toISOString().slice(0, 10),
    packageValue: 0,
  },
});

async function fetchUspsShippingOptions(originZip: string, destinationZip: string, ounces: number, dimensions: Record<string, number> | null) {
  const token = await getUspsToken();
  const response = await fetch('https://apis.usps.com/shipments/v3/options/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(shippingOptionsPayload(originZip, destinationZip, ounces, dimensions)),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function uspsShippingOptionRates(settings: Settings, destinationZip: string, ounces: number, dimensions: Record<string, number> | null) {
  const { response, data } = await fetchUspsShippingOptions(String(settings.origin_zip || ''), destinationZip, ounces, dimensions);
  if (!response.ok) {
    const safeCode = String(data?.error?.code || data?.code || 'options_failed').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
    const safeMessage = String(data?.error?.message || data?.message || '').replace(/[\r\n]+/g, ' ').slice(0, 180);
    throw new Error(`USPS Shipping Options failed (${response.status}, ${safeCode})${safeMessage ? `: ${safeMessage}` : '.'}`);
  }
  const wanted = new Set([
    settings.usps_ground_advantage_enabled !== false ? 'USPS_GROUND_ADVANTAGE' : null,
    settings.usps_priority_mail_enabled !== false ? 'PRIORITY_MAIL' : null,
  ].filter(Boolean));
  const pricingOptions = Array.isArray(data?.pricingOptions) ? data.pricingOptions : [];
  const shippingOptions = pricingOptions.flatMap((option: Item) => Array.isArray(option.shippingOptions) ? option.shippingOptions : []);
  return shippingOptions.flatMap((shippingOption: Item) => {
    const mailClass = String(shippingOption.mailClass || '');
    if (!wanted.has(mailClass)) return [];
    const rateOptions = Array.isArray(shippingOption.rateOptions) ? shippingOption.rateOptions as Item[] : [];
    const singlePiece = rateOptions.filter((option) => (Array.isArray(option.rates) ? option.rates as Item[] : [])
      .some((rate) => String(rate.rateIndicator || '') === 'SP'));
    const candidates = singlePiece.length ? singlePiece : rateOptions;
    return candidates.map((option, index) => {
      const nestedRates = Array.isArray(option.rates) ? option.rates as Item[] : [];
      const nestedPrice = nestedRates.map((rate) => optionalPriceNumber(rate.price)).find((price) => price != null && price > 0);
      const amount = positivePrice(option.totalPrice, option.totalBasePrice, nestedPrice);
      const rate = nestedRates.find((entry) => optionalPriceNumber(entry.price) != null) || nestedRates[0] || {};
      const commitment = option.commitment && typeof option.commitment === 'object' ? option.commitment as Item : {};
      return {
        id: `usps-${mailClass.toLowerCase().replace(/_/g, '-')}-${String(rate.SKU || index).toLowerCase()}`,
        service: mailClass === 'USPS_GROUND_ADVANTAGE' ? 'USPS Ground Advantage' : 'USPS Priority Mail',
        amount: amount == null ? Number.NaN : money(amount),
        delivery: commitment.name || null,
        expected_delivery_date: commitment.expectedDeliveryDate || commitment.scheduleDeliveryDate || null,
      };
    });
  }).filter((rate: { amount: number }) => Number.isFinite(rate.amount) && rate.amount > 0);
}

async function georgiaDestinationTax(
  admin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  settings: Settings,
  taxableAmount: number,
) {
  const address = (payload.shipping_address || {}) as Item;
  const state = String(address.state || '').trim().toUpperCase();
  if (state !== 'GA') return { amount: 0, detail: { method: 'destination_based', state, jurisdiction_name: null, rate_percent: 0 } };
  if (settings.georgia_sales_tax_enabled !== true) {
    throw new CheckoutConfigurationError('GA_TAX_DISABLED', 'Georgia destination sales tax is disabled in admin settings.');
  }
  const zip = String(address.zip || address.postal_code || '').trim();
  const city = String(address.city || '').trim();
  const { data, error } = await admin.rpc('get_georgia_checkout_tax_rate', {
    destination_zip: zip,
    destination_city: city,
    calculation_date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw new CheckoutConfigurationError('GA_TAX_LOOKUP_FAILED', 'Georgia destination tax could not be verified.');
  const detail = (data || {}) as Item;
  if (detail.ok !== true) {
    throw new CheckoutConfigurationError(
      String(detail.code || 'GA_TAX_JURISDICTION_UNRESOLVED'),
      String(detail.message || 'Georgia destination tax could not be verified.'),
    );
  }
  const rate = safeNumber(detail.rate_percent);
  if (rate <= 0) throw new CheckoutConfigurationError('GA_TAX_RATE_INVALID', 'The configured Georgia destination tax rate is invalid.');
  return { amount: money(taxableAmount * rate / 100), detail };
}

async function calculate(admin: ReturnType<typeof createClient>, payload: Record<string, unknown>, settings: Settings) {
  const items = Array.isArray(payload.items) ? payload.items as Item[] : [];
  if (!items.length) throw new Error('Your cart is empty.');
  const ids = [...new Set(items.map((item) => String(item.product_id || '')).filter(Boolean))];
  const { data: products, error } = await admin.from('products').select('id,name,price,sale_price,product_type,size_prices,vendor_cost,blank_garment_cost,print_cost_estimate,fulfillment_source,ss_exclude_free_freight,shipping_weight_oz,package_length_in,package_width_in,package_height_in,visibility,is_active').in('id', ids);
  if (error) throw new Error('Products could not be validated.');
  const byId = new Map((products || []).map((product: Product) => [String(product.id), product]));
  let merchandise = 0;
  let vendorCost = 0;
  let printCost = 0;
  const legs = { ss_activewear: [] as Item[], hc_apparel: [] as Item[] };
  for (const item of items) {
    const product = byId.get(String(item.product_id || ''));
    if (!product || product.visibility !== 'public' || product.is_active !== true) throw new Error('A checkout product is unavailable.');
    const quantity = Math.floor(safeNumber(item.quantity));
    if (quantity < 1) throw new Error('Cart quantity is invalid.');
    if (product.product_type === 'digital') {
      if (quantity !== 1) throw new Error('Digital mockups can be purchased once per order.');
      const price = safeNumber(product.sale_price || product.price);
      if (price <= 0) throw new Error('A digital mockup price is unavailable.');
      merchandise += price;
      continue;
    }
    const variant = variantFor(product, item);
    const price = safeNumber(variant?.price || product.sale_price || product.price);
    const cost = safeNumber(variant?.vendor_cost || variant?.cost || product.vendor_cost || product.blank_garment_cost);
    if (price <= 0) throw new Error('A product price is unavailable.');
    if (cost <= 0) throw new Error('A product vendor cost is unavailable. Please contact support@ilovehcapparel.net.');
    if (item.is_customized === true && safeNumber(product.print_cost_estimate) <= 0) {
      throw new Error('Custom printing pricing requires review before checkout. Please request a print quote.');
    }
    merchandise += price * quantity;
    vendorCost += cost * quantity;
    printCost += item.is_customized === true ? safeNumber(product.print_cost_estimate) * quantity : 0;
    const source = product.fulfillment_source === 'hc_apparel' ? 'hc_apparel' : 'ss_activewear';
    legs[source].push({ ...item, quantity, product, price, cost });
  }
  merchandise = money(merchandise);
  vendorCost = money(vendorCost);
  printCost = money(printCost);
  const components: Item[] = [];
  const services: Item[] = [];
  const warnings: string[] = [];
  let estimatedVendorShipping = 0;
  let uspsQuotedShipping = 0;

  if (legs.ss_activewear.length) {
    if (settings.ss_shipping_enabled === false) throw new CheckoutConfigurationError('SS_SHIPPING_DISABLED', 'S&S checkout shipping is disabled.');
    const quantity = legs.ss_activewear.reduce((sum, item) => sum + safeNumber(item.quantity), 0);
    const subtotal = money(legs.ss_activewear.reduce((sum, item) => sum + safeNumber(item.price) * safeNumber(item.quantity), 0));
    const threshold = safeNumber(settings.ss_free_freight_threshold);
    let base: number | null = null;
    let rule = '';
    const freeFreight = threshold > 0 && subtotal >= threshold
      ? await ssFreeFreightEligibility(legs.ss_activewear)
      : { eligible: false, verified: false, reason: 'S&S subtotal is below the free-freight threshold' };
    if (threshold > 0 && subtotal >= threshold && freeFreight.eligible) { base = 0; rule = 'Verified S&S free freight'; }
    else if (quantity <= 2) { base = settings.ss_tier_1_2 == null ? null : safeNumber(settings.ss_tier_1_2); rule = 'S&S fallback: 1–2 garments'; }
    else if (quantity <= 5) { base = settings.ss_tier_3_5 == null ? null : safeNumber(settings.ss_tier_3_5); rule = 'S&S fallback: 3–5 garments'; }
    else if (quantity <= 12) { base = settings.ss_tier_6_12 == null ? null : safeNumber(settings.ss_tier_6_12); rule = 'S&S fallback: 6–12 garments'; }
    else { base = settings.ss_tier_13_plus == null ? null : safeNumber(settings.ss_tier_13_plus); rule = 'S&S fallback: 13+ garments'; }
    if (base == null && quantity >= 13) throw new CheckoutConfigurationError('SS_SHIPPING_REVIEW_REQUIRED', 'Shipping for this S&S order requires review because the 13+ garment fallback is not configured.');
    if (base == null) throw new CheckoutConfigurationError('SS_SHIPPING_TIERS_INCOMPLETE', `${rule} is missing.`);
    const charge = money(base + safeNumber(settings.ss_shipping_buffer));
    estimatedVendorShipping += base;
    components.push({ source: 'ss_activewear', quantity, subtotal, customer_charge: charge, estimated_vendor_shipping: base, rule, exact_quote: false, free_freight_verified: freeFreight.verified, free_freight_reason: freeFreight.reason });
  }

  if (legs.hc_apparel.length) {
    const subtotal = money(legs.hc_apparel.reduce((sum, item) => sum + safeNumber(item.price) * safeNumber(item.quantity), 0));
    let ounces = 0;
    let usedDefaultWeight = false;
    for (const item of legs.hc_apparel) {
      const product = item.product as Product;
      let unitWeight = safeNumber(product.shipping_weight_oz);
      if (unitWeight <= 0) {
        unitWeight = safeNumber(settings.default_product_weight_oz) * (settings.default_product_weight_unit === 'lb' ? 16 : 1);
        usedDefaultWeight = true;
      }
      if (unitWeight <= 0) throw new CheckoutConfigurationError('USPS_PRODUCT_WEIGHT_MISSING', `Shipping weight is missing for ${String(product.name || 'an HC Apparel product')}. Add the SKU/product weight or configure a real fallback weight.`);
      ounces += unitWeight * safeNumber(item.quantity);
    }
    if (usedDefaultWeight) warnings.push('Using default shipping weight');
    const actualDimensions = legs.hc_apparel.map((item) => {
      const product = item.product as Product;
      return {
        length: safeNumber(product.package_length_in),
        width: safeNumber(product.package_width_in),
        height: safeNumber(product.package_height_in),
        quantity: safeNumber(item.quantity),
      };
    });
    const allProductDimensionsAvailable = actualDimensions.every((entry) => entry.length > 0 && entry.width > 0 && entry.height > 0);
    const dimensionFactor = settings.default_package_dimension_unit === 'cm' ? 1 / 2.54 : 1;
    const globalDimensions = {
      length: safeNumber(settings.default_package_length_in) * dimensionFactor,
      width: safeNumber(settings.default_package_width_in) * dimensionFactor,
      height: safeNumber(settings.default_package_height_in) * dimensionFactor,
    };
    const dimensions = allProductDimensionsAvailable
      ? {
        length: Math.max(...actualDimensions.map((entry) => entry.length)),
        width: Math.max(...actualDimensions.map((entry) => entry.width)),
        height: actualDimensions.reduce((sum, entry) => sum + entry.height * entry.quantity, 0),
      }
      : globalDimensions.length > 0 && globalDimensions.width > 0 && globalDimensions.height > 0
        ? globalDimensions
        : null;
    if (!dimensions) warnings.push('USPS request uses product/cart weight without package dimensions');
    const destinationZip = String((payload.shipping_address as Item)?.zip || (payload.shipping_address as Item)?.postal_code || '');
    if (!/^\d{5}(-\d{4})?$/.test(destinationZip)) throw new Error('Enter a valid destination ZIP code.');
    let rates: Item[] = [];
    let fallback = false;
    let uspsFailure = '';
    if (settings.hc_free_shipping_enabled === true && safeNumber(settings.hc_free_shipping_threshold) > 0 && subtotal >= safeNumber(settings.hc_free_shipping_threshold)) {
      rates = [{ id: 'hc-free-shipping', service: 'HC Apparel free shipping', amount: 0, delivery: null }];
    } else if (settings.usps_enabled === true) {
      try { rates = await uspsShippingOptionRates(settings, destinationZip, ounces, dimensions); }
      catch (error) {
        uspsFailure = error instanceof Error ? error.message.slice(0, 220) : 'USPS request failed';
        console.warn('USPS quote unavailable', { name: error instanceof Error ? error.name : 'Unknown', has_dimensions: Boolean(dimensions) });
      }
    }
    if (!rates.length && settings.hc_fallback_enabled === true && settings.hc_fallback_rate != null) {
      fallback = true;
      rates = [{ id: 'hc-fallback', service: 'Standard shipping', amount: safeNumber(settings.hc_fallback_rate), delivery: null }];
      warnings.push('Live USPS rates are temporarily unavailable. A fallback shipping rate has been applied.');
    }
    if (!rates.length) {
      if (!dimensions && /dimension|length|width|height|package/i.test(uspsFailure)) {
        throw new CheckoutConfigurationError('USPS_PACKAGE_DATA_REQUIRED', 'USPS requires package dimensions for this cart. Add product dimensions or an active package preset before checkout.');
      }
      throw new CheckoutConfigurationError('USPS_RATE_AND_FALLBACK_UNAVAILABLE', 'USPS live rate unavailable and fallback shipping is disabled or incomplete.');
    }
    rates = rates.map((rate) => ({ ...rate, amount: money(safeNumber(rate.amount) + safeNumber(settings.hc_handling_amount)) }));
    services.push(...rates);
    const selectedId = String(payload.shipping_service_id || '');
    const selected = rates.find((rate) => rate.id === selectedId) || (rates.length === 1 ? rates[0] : null);
    if (selected) {
      uspsQuotedShipping += fallback ? 0 : safeNumber(selected.amount) - safeNumber(settings.hc_handling_amount);
      components.push({ source: 'hc_apparel', customer_charge: selected.amount, carrier: fallback ? 'Fallback' : 'USPS', service: selected.service, package_weight_oz: ounces, dimensions, quote_timestamp: new Date().toISOString() });
    }
  }

  const needsSelection = legs.hc_apparel.length > 0 && services.length > 1 && !components.some((component) => component.source === 'hc_apparel');
  const shipping = money(components.reduce((sum, component) => sum + safeNumber(component.customer_charge), 0));
  const taxResult = await georgiaDestinationTax(admin, payload, settings, merchandise + shipping);
  const tax = taxResult.amount;
  const total = money(merchandise + shipping + tax);
  const processingMethod = settings.processing_enabled === false
    ? { key: null, label: 'Disabled', percentage: 0, fixed_fee: 0, amount: 0 }
    : worstPaymentCost(total, settings.payment_method_costs);
  const processing = processingMethod.amount;
  const beforeShipping = money(merchandise - vendorCost - printCost - processing);
  const estimatedMargin = money(beforeShipping + shipping - estimatedVendorShipping - uspsQuotedShipping);
  const physicalQuantity = items.reduce((sum, item) => {
    const product = byId.get(String(item.product_id || ''));
    return sum + (product?.product_type === 'digital' ? 0 : safeNumber(item.quantity));
  }, 0);
  const requiredMargin = money(safeNumber(settings.minimum_margin_per_item) * physicalQuantity);
  if (estimatedMargin < requiredMargin) throw new Error('This cart requires a pricing review before checkout. Please contact support@ilovehcapparel.net.');
  return { merchandise, shipping, tax, taxDetail: taxResult.detail, total, processing, processingMethod, vendorCost, printCost, beforeShipping, estimatedMargin, estimatedVendorShipping: money(estimatedVendorShipping), uspsQuotedShipping: money(uspsQuotedShipping), components, services, warnings, needsSelection, requiredMargin };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') || '';
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
  if (request.method === 'OPTIONS') return respond({ ok: true });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = getSupabasePublishableKey();
    const serviceCredential = getSupabaseServiceCredential();
    const serviceKey = serviceCredential.key;
    if (!supabaseUrl || !publishableKey || !serviceKey) return respond({ error: 'Checkout is not configured.' }, 503);
    const body = await request.json();
    const action = String(body.action || 'quote');
    const payload = (body.payload || body) as Record<string, unknown>;
    const authorization = request.headers.get('Authorization') || '';
    const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const apiKeyHeader = request.headers.get('apikey')?.trim() || '';
    const acceptedServiceKeys = [
      serviceKey,
      Deno.env.get('SUPABASE_SECRET_KEY')?.trim(),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim(),
    ].filter((value): value is string => Boolean(value));
    const serviceRequest = acceptedServiceKeys.includes(bearerToken) || acceptedServiceKeys.includes(apiKeyHeader);
    let admin = createClient(supabaseUrl, serviceKey);
    if (serviceRequest && action === 'invoice_tax_quote') {
      const state = String(payload.state || '').trim().toUpperCase();
      if (state !== 'GA') return respond({ ok: true, state, amount: 0, rate_percent: 0, method: 'Georgia tax not applied outside Georgia', jurisdiction_name: null, creates_order: false, creates_payment: false });
      const { data, error } = await admin.rpc('get_georgia_checkout_tax_rate', {
        destination_zip: String(payload.destination_zip || ''),
        destination_city: String(payload.destination_city || ''),
        calculation_date: new Date().toISOString().slice(0, 10),
      });
      if (error) return respond({ error: 'Georgia destination tax lookup failed.', code: error.code }, 400);
      return respond({ ...(data || {}), state, creates_order: false, creates_payment: false });
    }
    if (serviceRequest && action === 'invoice_usps_rate_quote') {
      const originZip = String(payload.origin_zip || '').replace(/\D/g, '').slice(0, 5);
      const destinationZip = String(payload.destination_zip || '').replace(/\D/g, '').slice(0, 5);
      const ounces = safeNumber(payload.weight_oz);
      const dimensions = {
        length: safeNumber(payload.length_in),
        width: safeNumber(payload.width_in),
        height: safeNumber(payload.height_in),
      };
      if (!/^\d{5}$/.test(originZip) || !/^\d{5}$/.test(destinationZip)) return respond({ error: 'A valid origin and destination ZIP are required.' }, 400);
      if (ounces <= 0) return respond({ error: 'A positive packed weight is required.' }, 400);
      if (dimensions.length <= 0 || dimensions.width <= 0 || dimensions.height <= 0) return respond({ error: 'Complete package dimensions are required.' }, 400);
      const settings = {
        origin_zip: originZip,
        usps_ground_advantage_enabled: payload.ground_enabled === true,
        usps_priority_mail_enabled: payload.priority_enabled === true,
      };
      const [domestic, options] = await Promise.allSettled([
        uspsDomesticRates(settings, destinationZip, ounces, dimensions),
        uspsShippingOptionRates(settings, destinationZip, ounces, dimensions),
      ]);
      const domesticRates = domestic.status === 'fulfilled' ? domestic.value : [];
      const optionRates = options.status === 'fulfilled' ? options.value : [];
      const rates = optionRates.length ? optionRates : domesticRates;
      if (!rates.length) return respond({ error: [domestic, options].filter(result => result.status === 'rejected').map(result => String(result.reason instanceof Error ? result.reason.message : result.reason).replace(/[\r\n]+/g, ' ').slice(0, 280)).join(' | ') || 'USPS returned no valid non-zero rate for this package.', code: 'USPS_RATE_UNAVAILABLE' }, 400);
      return respond({
        rates,
        source: optionRates.length ? 'USPS Shipping Options v3' : 'USPS Domestic Prices v3',
        package_data: { weight_oz: ounces, dimensions_in: dimensions },
        quote_timestamp: new Date().toISOString(),
        creates_order: false,
        creates_label: false,
        creates_payment: false,
      });
    }
    const userClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return respond({ error: 'Please sign in again to continue checkout.', code: 'AUTH_REQUIRED' }, 401);
    if (action === 'settings_get' || action === 'settings_save') {
      const { data: isAdmin } = await userClient.rpc('is_admin');
      if (!isAdmin) return respond({ error: 'Administrator access required.' }, 403);
      if (action === 'settings_get') {
        const { data, error } = await userClient.from('checkout_financial_settings').select('*').eq('id', 'default').single();
        if (error) {
          console.error('Checkout settings read failed', { code: error.code });
          return respond({ error: 'Settings could not be loaded. Please try again.', code: error.code }, 500);
        }
        const { data: currentTaxRate } = await admin.rpc('get_georgia_checkout_tax_rate', {
          destination_zip: '30303',
          destination_city: 'Atlanta',
          calculation_date: new Date().toISOString().slice(0, 10),
        });
        const latestTaxRate = currentTaxRate?.ok === true ? currentTaxRate : null;
        return respond({
          settings: {
            ...data,
            _usps_credentials_configured: Boolean(Deno.env.get('USPS_CLIENT_ID') && Deno.env.get('USPS_CLIENT_SECRET')),
            _georgia_tax_status: latestTaxRate ? {
              last_tax_rate_update: latestTaxRate.last_tax_rate_update,
              effective_through: latestTaxRate.effective_to,
              rate_source: latestTaxRate.rate_source,
              source_url: latestTaxRate.source_url,
              expired: String(latestTaxRate.effective_to) < new Date().toISOString().slice(0, 10),
            } : { expired: true },
          },
        });
      }
      const updates: Record<string, unknown> = {};
      const nullableNumberFields = new Set(['ss_tier_13_plus']);
      for (const [key, value] of Object.entries(payload)) {
        if (settingsBooleanFields.has(key) && typeof value === 'boolean') updates[key] = value;
        if (settingsNumberFields.has(key) && nullableNumberFields.has(key) && (value === '' || value == null)) updates[key] = null;
        else if (settingsNumberFields.has(key) && value !== '' && value != null && Number.isFinite(Number(value))) updates[key] = Number(value);
        if (settingsTextFields.has(key) && typeof value === 'string' && value.trim() !== '') updates[key] = value.trim();
      }
      if (payload.payment_method_costs && typeof payload.payment_method_costs === 'object' && !Array.isArray(payload.payment_method_costs)) {
        const normalized = normalizePaymentMethods(payload.payment_method_costs);
        const updatedAt = new Date().toISOString();
        updates.payment_method_costs = Object.fromEntries(Object.entries(normalized).map(([key, method]) => [key, { ...method, updated_at: updatedAt }]));
        const legacyWorst = worstPaymentCost(100, updates.payment_method_costs);
        updates.processing_percent = legacyWorst.percentage;
        updates.processing_fixed_fee = legacyWorst.fixed_fee;
      }
      if (Array.isArray(payload.package_presets)) {
        const normalizedPresets = payload.package_presets.map((entry, index) => {
          const preset = entry && typeof entry === 'object' ? entry as Item : {};
          const name = String(preset.name || '').trim();
          const length = safeNumber(preset.length);
          const width = safeNumber(preset.width);
          const height = safeNumber(preset.height);
          const emptyPackageWeight = safeNumber(preset.empty_package_weight);
          if (!name || length <= 0 || width <= 0 || height <= 0 || emptyPackageWeight < 0) {
            throw new CheckoutConfigurationError('PACKAGE_PRESET_INVALID', `Package preset ${index + 1} is incomplete.`);
          }
          return {
            id: String(preset.id || crypto.randomUUID()),
            name,
            length,
            width,
            height,
            empty_package_weight: emptyPackageWeight,
            dimension_unit: preset.dimension_unit === 'cm' ? 'cm' : 'in',
            weight_unit: preset.weight_unit === 'lb' ? 'lb' : 'oz',
            active: preset.active !== false,
          };
        });
        updates.package_presets = normalizedPresets;
      }
      if (updates.default_product_weight_unit && !['oz', 'lb'].includes(String(updates.default_product_weight_unit))) return respond({ error: 'Settings could not be saved. Please try again.' }, 400);
      if (updates.default_package_dimension_unit && !['in', 'cm'].includes(String(updates.default_package_dimension_unit))) return respond({ error: 'Settings could not be saved. Please try again.' }, 400);
      const { data, error } = await userClient.from('checkout_financial_settings').update(updates).eq('id', 'default').select('*').single();
      if (error) {
        console.error('Checkout settings save failed', { code: error.code, details: String(error.details || '').slice(0, 160) });
        return respond({ error: 'Settings could not be saved. Please try again.', code: error.code }, 500);
      }
      return respond({ settings: data, saved: true });
    }
    if (action === 'georgia_tax_test') {
      const { data: isAdmin } = await userClient.rpc('is_admin');
      if (!isAdmin) return respond({ error: 'Administrator access required.' }, 403);
      const state = String(payload.state || '').trim().toUpperCase();
      if (state !== 'GA') return respond({ ok: true, state, amount: 0, rate_percent: 0, method: 'Georgia tax not applied outside Georgia', creates_order: false, creates_payment: false });
      const { data, error } = await admin.rpc('get_georgia_checkout_tax_rate', {
        destination_zip: String(payload.destination_zip || ''),
        destination_city: String(payload.destination_city || ''),
        calculation_date: new Date().toISOString().slice(0, 10),
      });
      if (error) return respond({ error: 'Georgia destination tax lookup failed.', code: error.code }, 400);
      return respond({ ...(data || {}), state, creates_order: false, creates_payment: false });
    }
    if (action === 'usps_rate_test') {
      const { data: isAdmin } = await userClient.rpc('is_admin');
      if (!isAdmin) return respond({ error: 'Administrator access required.' }, 403);
      const originZip = String(payload.origin_zip || '').replace(/\D/g, '').slice(0, 5);
      const destinationZip = String(payload.destination_zip || '').replace(/\D/g, '').slice(0, 5);
      const weight = safeNumber(payload.weight);
      const length = safeNumber(payload.length);
      const width = safeNumber(payload.width);
      const height = safeNumber(payload.height);
      if (!/^\d{5}$/.test(originZip)) return respond({ error: 'Enter a valid five-digit fulfillment origin ZIP.' }, 400);
      if (!/^\d{5}$/.test(destinationZip)) return respond({ error: 'Enter a valid five-digit destination ZIP.' }, 400);
      const dimensionsComplete = length > 0 && width > 0 && height > 0;
      const dimensionsPartiallyEntered = [length, width, height].some((value) => value > 0) && !dimensionsComplete;
      if (weight <= 0) return respond({ error: 'Enter a positive package weight.' }, 400);
      if (dimensionsPartiallyEntered) return respond({ error: 'Enter all three dimensions or leave all dimensions blank for a weight-only USPS test.' }, 400);
      if (payload.ground_enabled !== true && payload.priority_enabled !== true) return respond({ error: 'Enable Ground Advantage or Priority Mail for the test.' }, 400);
      const ounces = weight * (payload.weight_unit === 'lb' ? 16 : 1);
      const dimensionFactor = payload.dimension_unit === 'cm' ? 1 / 2.54 : 1;
      const diagnostics: UspsRateDiagnostics = { requests: [] };
      const token = await getUspsToken();
      const rateSettings = { origin_zip: originZip, usps_ground_advantage_enabled: payload.ground_enabled === true, usps_priority_mail_enabled: payload.priority_enabled === true };
      const packageDimensions = dimensionsComplete ? { length: length * dimensionFactor, width: width * dimensionFactor, height: height * dimensionFactor } : null;
      let rates: Item[] = [];
      let shippingOptionsResponse: Response;
      let shippingOptionsData: Item = {};
      let shippingOptionRates: Item[] = [];
      let domesticError = '';
      let optionsError = '';
      try {
        rates = await uspsDomesticRates(rateSettings, destinationZip, ounces, packageDimensions, diagnostics);
      } catch (error) {
        domesticError = String(error instanceof Error ? error.message : 'USPS Domestic Pricing failed').replace(/[\r\n]+/g, ' ').slice(0, 360);
      }
      try {
        const shippingOptionsResult = await fetchUspsShippingOptions(originZip, destinationZip, ounces, packageDimensions);
        shippingOptionsResponse = shippingOptionsResult.response;
        shippingOptionsData = shippingOptionsResult.data;
        shippingOptionRates = shippingOptionsResponse.ok ? await uspsShippingOptionRates(rateSettings, destinationZip, ounces, packageDimensions) : [];
      } catch (error) {
        optionsError = String(error instanceof Error ? error.message : 'USPS Shipping Options failed').replace(/[\r\n]+/g, ' ').slice(0, 360);
        shippingOptionsResponse = new Response(null, { status: 503 });
      }
      if (!rates.length && !shippingOptionRates.length) {
        const safeMessage = [domesticError, optionsError].filter(Boolean).join(' | ').slice(0, 600) || 'USPS returned no valid rate.';
        return respond({
          error: safeMessage,
          code: dimensionsComplete ? 'USPS_RATE_TEST_FAILED' : 'USPS_WEIGHT_ONLY_RATE_FAILED',
          missing_shipping_information: dimensionsComplete ? [] : ['package length', 'package width', 'package height'],
          package_data: { weight_oz: ounces, dimensions_supplied: dimensionsComplete },
          creates_order: false,
          creates_label: false,
          creates_payment: false,
        }, 400);
      }
      const services = diagnostics.requests.map((request) => ({
        mail_class: request.mail_class,
        label: request.mail_class === 'USPS_GROUND_ADVANTAGE' ? 'USPS Ground Advantage' : 'USPS Priority Mail',
        http_status: request.status,
        raw_price: firstPrice(request.total_price, request.total_base_price, request.first_rate_price),
      }));
      const zeroRateWarning = services.length > 0 && services.every((service) => service.raw_price === 0);
      const fallbackAmount = safeNumber(payload.fallback_amount);
      return respond({
        oauth: { ok: Boolean(token), status: uspsTokenMetadata?.status || null, scope: uspsTokenMetadata?.scope || [], api_products: uspsTokenMetadata?.apiProducts || [] },
        http_ok: services.length > 0 && services.every((service) => service.http_status === 200),
        rates,
        shipping_options_rates: shippingOptionRates,
        services,
        diagnostics: {
          oauth: { status: uspsTokenMetadata?.status || null, scope: uspsTokenMetadata?.scope || [], api_products: uspsTokenMetadata?.apiProducts || [] },
          domestic_prices: diagnostics.requests,
          shipping_options: {
            endpoint: 'https://apis.usps.com/shipments/v3/options/search',
            http_status: shippingOptionsResponse.status,
            options: uspsOptionSummaries(shippingOptionsData),
            sanitized_response: sanitizeUspsValue(shippingOptionsData),
          },
        },
        fallback: { enabled: payload.fallback_enabled === true, amount: fallbackAmount, would_use: rates.length === 0 && payload.fallback_enabled === true && fallbackAmount > 0 },
        package_data: { weight_oz: ounces, dimensions_supplied: dimensionsComplete, dimensions_in: packageDimensions },
        zero_rate_warning: zeroRateWarning,
        creates_order: false,
        creates_label: false,
        creates_payment: false,
      });
    }
    if (action === 'usps_health') {
      const { data: isAdmin } = await userClient.rpc('is_admin');
      if (!isAdmin) return respond({ error: 'Administrator access required.' }, 403);
      const token = await getUspsToken();
      const sampleSettings = { origin_zip: '10018', usps_ground_advantage_enabled: true, usps_priority_mail_enabled: true };
      const diagnostics: UspsRateDiagnostics = { requests: [] };
      const rates = await uspsShippingOptionRates(sampleSettings, '95823', 16, { length: 10, width: 8, height: 4 });
      return respond({
        oauth: { ok: Boolean(token), endpoint: 'https://apis.usps.com/oauth2/v3/token' },
        shipping_options: { ok: rates.length > 0, endpoint: 'https://apis.usps.com/shipments/v3/options/search' },
        sample: { origin_zip: '10018', destination_zip: '95823', weight_oz: 16, dimensions_in: { length: 10, width: 8, height: 4 } },
        rates,
        diagnostics,
        creates_order: false,
        creates_label: false,
        creates_payment: false,
      });
    }
    if (String(payload.customer_email || '').toLowerCase() !== String(user.email || '').toLowerCase()) return respond({ error: 'Checkout email must match the signed-in account.' }, 403);
    let { data: settings, error: settingsError } = await admin.from('checkout_financial_settings').select('*').eq('id', 'default').single();
    if (settingsError || !settings) {
      const scopedResult = await admin.rpc('get_checkout_pricing_settings_server');
      if (!scopedResult.error && scopedResult.data) {
        settings = scopedResult.data as Settings;
        settingsError = null;
      }
    }
    // Some projects expose both the current sb_secret credential and the legacy
    // service-role JWT. If the preferred credential cannot read the protected
    // settings row, retry once with the distinct legacy credential. This remains
    // entirely server-side and never exposes either credential to the browser.
    const alternateServiceKeys = [
      Deno.env.get('SUPABASE_SECRET_KEY')?.trim(),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim(),
    ].filter((value, index, values): value is string => Boolean(value) && value !== serviceKey && values.indexOf(value) === index);
    for (const alternateServiceKey of alternateServiceKeys) {
      if (!settingsError && settings) break;
      const alternateAdmin = createClient(supabaseUrl, alternateServiceKey);
      let alternateResult = await alternateAdmin.from('checkout_financial_settings').select('*').eq('id', 'default').single();
      if (alternateResult.error || !alternateResult.data) {
        const scopedAlternate = await alternateAdmin.rpc('get_checkout_pricing_settings_server');
        alternateResult = { data: scopedAlternate.data as Settings | null, error: scopedAlternate.error };
      }
      if (!alternateResult.error && alternateResult.data) {
        admin = alternateAdmin;
        settings = alternateResult.data;
        settingsError = null;
      }
    }
    if (settingsError || !settings) {
      const safeCode = settingsError?.code || 'SETTINGS_MISSING';
      console.error('Checkout settings unavailable', {
        code: safeCode,
        credential_source: serviceCredential.source,
      });
      return respond({ error: customerShippingError, code: 'CHECKOUT_SETTINGS_UNAVAILABLE' }, 503);
    }
    const quote = await calculate(admin, payload, settings);
    if (action === 'quote') return respond({ quote: customerSafeQuote(quote), credentials: { usps_configured: Boolean(Deno.env.get('USPS_CLIENT_ID') && Deno.env.get('USPS_CLIENT_SECRET')) } });
    if (action !== 'create_order') return respond({ error: 'Unsupported checkout action.' }, 400);
    if (quote.needsSelection) return respond({ error: 'Select a shipping service before continuing.' }, 400);
    const rpcPayload = { ...payload, shipping_method: quote.components.map((component: Item) => component.service || component.rule).filter(Boolean).join(' + ') };
    const { data: created, error: createError } = await userClient.rpc('create_or_reuse_small_order_checkout', { payload: rpcPayload });
    if (createError || !created?.order_id) return respond({ error: createError?.message || 'Order could not be created.' }, 400);
    const service = quote.components.find((component: Item) => component.source === 'hc_apparel');
    const { error: updateError } = await admin.from('orders').update({
      product_subtotal: quote.merchandise,
      shipping_amount: quote.shipping,
      shipping_charged_to_customer: quote.shipping,
      sales_tax_amount: quote.tax,
      sales_tax_rate_percent: safeNumber((quote.taxDetail as Item)?.rate_percent),
      sales_tax_jurisdiction_code: (quote.taxDetail as Item)?.jurisdiction_code || null,
      sales_tax_jurisdiction_name: (quote.taxDetail as Item)?.jurisdiction_name || null,
      sales_tax_rate_source: (quote.taxDetail as Item)?.rate_source || null,
      sales_tax_effective_from: (quote.taxDetail as Item)?.effective_from || null,
      sales_tax_effective_to: (quote.taxDetail as Item)?.effective_to || null,
      total_amount: quote.total,
      balance_due: quote.total,
      vendor_garment_cost: quote.vendorCost,
      estimated_vendor_shipping: quote.estimatedVendorShipping,
      estimated_s_and_s_shipping: quote.estimatedVendorShipping,
      usps_quoted_shipping: quote.uspsQuotedShipping,
      payment_processing_estimate: quote.processing,
      estimated_processing_cost: quote.processing,
      processing_rate_used: quote.processingMethod,
      printing_cost_estimate: quote.printCost,
      net_margin_before_shipping: quote.beforeShipping,
      estimated_net_margin: quote.estimatedMargin,
      shipping_components: quote.components,
      pricing_snapshot: { minimum_margin_required: quote.requiredMargin, tax: quote.taxDetail, payment_method_costs: normalizePaymentMethods(settings.payment_method_costs), worst_case_processing: quote.processingMethod },
      shipping_carrier: service?.carrier || (quote.components.length === 1 ? 'S&S fallback' : 'Mixed'),
      shipping_service: service?.service || null,
      shipping_quote_at: new Date().toISOString(),
      shipping_package: service ? { weight_oz: service.package_weight_oz, dimensions: service.dimensions } : null,
    }).eq('id', created.order_id).eq('owner_user_id', user.id);
    if (updateError) {
      await admin.from('orders').update({ status: 'checkout_failed', payment_status: 'checkout_failed', checkout_failure_reason: 'Shipping total could not be attached to checkout' }).eq('id', created.order_id);
      return respond({ error: 'Payment checkout could not be started. Please refresh and try again.' }, 500);
    }
    return respond({ ...created, quote: customerSafeQuote(quote) });
  } catch (error) {
    const configurationError = error instanceof CheckoutConfigurationError ? error : null;
    console.error('Checkout pricing failure', {
      name: error instanceof Error ? error.name : 'Unknown',
      code: configurationError?.code || 'CHECKOUT_CALCULATION_FAILED',
      message: configurationError?.message || 'Checkout calculation failed',
    });
    const safeError = configurationError?.code === 'SS_SHIPPING_REVIEW_REQUIRED'
      ? 'Shipping for this order requires review. Please contact HC Apparel before checkout.'
      : customerShippingError;
    return respond({ error: safeError, code: configurationError?.code || 'CHECKOUT_CALCULATION_FAILED' }, 400);
  }
});
