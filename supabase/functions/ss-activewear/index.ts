import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'http://127.0.0.1:4174',
  'http://localhost:4174',
  'https://hc-apparel-copy.vercel.app',
  'https://ilovehcapparel.net',
  'https://www.ilovehcapparel.net',
]);

const approvedBrands = [
  'Gildan',
  'Bella + Canvas',
  'Comfort Colors',
  'DRI DUCK',
  'Shaka Wear',
  'Next Level',
  'Jerzees',
  'Hanes',
  'Rabbit Skins',
  'adidas',
  'Oakley',
  'Champion',
  'Lane Seven',
  'American Apparel',
  'Tultex',
  'Columbia',
  'Independent Trading Co',
];

const coldWeatherBrands = new Set([
  'Columbia',
  'Gildan',
  'Champion',
  'Lane Seven',
  'Independent Trading Co',
  'Comfort Colors',
  'DRI DUCK',
  'Tultex',
  'adidas',
  'Oakley',
]);

const normalizeBrand = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const canonicalBrands = new Map(approvedBrands.map((brand) => [normalizeBrand(brand), brand]));
const productFields = [
  'SkuID',
  'Sku',
  'Gtin',
  'YourSku',
  'StyleID',
  'BrandName',
  'StyleName',
  'ColorName',
  'ColorCode',
  'ColorPriceCodeName',
  'ColorGroup',
  'ColorGroupName',
  'ColorFamilyID',
  'ColorFamily',
  'ColorSwatchImage',
  'ColorSwatchTextColor',
  'ColorFrontImage',
  'ColorSideImage',
  'ColorBackImage',
  'ColorDirectSideImage',
  'ColorOnModelFrontImage',
  'ColorOnModelSideImage',
  'ColorOnModelBackImage',
  'Color1',
  'Color2',
  'SizeName',
  'SizeCode',
  'SizeOrder',
  'SizePriceCodeName',
  'CaseQty',
  'UnitWeight',
  'MapPrice',
  'RetailPrice',
  'PiecePrice',
  'DozenPrice',
  'CasePrice',
  'SalePrice',
  'CustomerPrice',
  'SaleExpiration',
  'NoeRetailing',
  'PolyPackQty',
  'Qty',
  'CountryOfOrigin',
  'Warehouses',
].join(',');

const canonicalApprovedBrand = (value: unknown) =>
  canonicalBrands.get(normalizeBrand(String(value || '')));

const textValue = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const numberValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const integerValue = (value: unknown) => {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const imageUrl = (value: unknown) => {
  const path = textValue(value);
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `https://www.ssactivewear.com/${path.replace(/^\/+/, '')}`;
};

function collectApprovedStyles(result: unknown) {
  const counts = Object.fromEntries(approvedBrands.map((brand) => [brand, 0]));
  const samples: Array<Record<string, unknown>> = [];
  const styles: Array<Record<string, unknown> & { canonicalBrand: string }> = [];

  for (const style of Array.isArray(result) ? result : []) {
    const canonicalBrand = canonicalApprovedBrand(style.brandName);
    if (!canonicalBrand) continue;
    counts[canonicalBrand] += 1;
    styles.push({ ...style, canonicalBrand });
    if (samples.length < 12) {
      samples.push({
        brand: canonicalBrand,
        style_id: style.styleID,
        part_number: style.partNumber,
        style_name: style.styleName,
        title: style.title,
        category: style.baseCategory,
        image_url: imageUrl(style.styleImage),
      });
    }
  }

  return { counts, samples, styles };
}

function isColdWeatherStyle(style: Record<string, unknown> & { canonicalBrand: string }) {
  if (!coldWeatherBrands.has(style.canonicalBrand)) return false;
  const text = [
    style.styleName,
    style.title,
    style.baseCategory,
    style.partNumber,
  ].map((value) => String(value || '').toLowerCase()).join(' ');

  return /(hood|hoodie|fleece|jacket|pullover|outerwear|coat|beanie|hat|cap|crewneck|crew neck|sweatshirt|soft shell|shell|vest)/i
    .test(text);
}

function championMerchScore(style: Record<string, unknown> & { canonicalBrand: string }) {
  const text = [style.styleName, style.title, style.baseCategory, style.partNumber]
    .map((value) => String(value || '').toLowerCase()).join(' ');
  let score = 0;
  if (/(performance|moisture|athletic|training|warm.?up|track|sport)/.test(text)) score += 12;
  if (/(polo|quarter.?zip|1\/4.?zip|full.?zip|jacket|vest)/.test(text)) score += 12;
  if (/(jogger|pant|short)/.test(text)) score += 10;
  if (/(hood|hoodie|crewneck|sweatshirt|fleece)/.test(text)) score += 8;
  if (/(women|ladies)/.test(text)) score += 5;
  if (/(tee|t-shirt|t shirt)/.test(text)) score += 3;
  if (/(crop|fashion|tie.?dye|moto)/.test(text)) score -= 8;
  if (!imageUrl(style.styleImage)) score -= 100;
  return score;
}

function championMerchGroup(style: Record<string, unknown> & { canonicalBrand: string }) {
  const text = [style.styleName, style.title, style.baseCategory]
    .map((value) => String(value || '').toLowerCase()).join(' ');
  if (/(polo|quarter.?zip|1\/4.?zip|jacket|vest|full.?zip)/.test(text)) return 'business_apparel';
  if (/(performance|athletic|training|warm.?up|track|jogger|pant|short|sport)/.test(text)) return 'sports_teamwear';
  return 'premium_basics';
}

function americanApparelFallWinterScore(style: Record<string, unknown> & { canonicalBrand: string }) {
  const text = [style.styleName, style.title, style.baseCategory, style.partNumber]
    .map((value) => String(value || '').toLowerCase()).join(' ');
  let score = 0;
  if (/(hood|hoodie|fleece|sweatshirt|crewneck|crew neck)/.test(text)) score += 18;
  if (/(long.?sleeve|thermal|layer)/.test(text)) score += 16;
  if (/(jogger|sweat.?pant|legging|pant)/.test(text)) score += 14;
  if (/(jacket|outerwear|windbreaker|vest|full.?zip|quarter.?zip|1\/4.?zip)/.test(text)) score += 14;
  if (/(heavy|garment.?dye|women|youth|kids)/.test(text)) score += 3;
  if (/(tank|short.?sleeve|crop|swim|shorts?)/.test(text)) score -= 20;
  if (!imageUrl(style.styleImage)) score -= 100;
  return score;
}

function nextLevelMerchScore(style: Record<string, unknown> & { canonicalBrand: string }) {
  const text = [style.styleName, style.title, style.baseCategory, style.partNumber]
    .map((value) => String(value || '').toLowerCase()).join(' ');
  let score = 0;
  if (/(tee|t-shirt|t shirt|long.?sleeve)/.test(text)) score += 12;
  if (/(hood|hoodie|fleece|sweatshirt|crewneck|crew neck)/.test(text)) score += 14;
  if (/(tank|polo|quarter.?zip|jacket|outerwear|jogger|pant|short)/.test(text)) score += 12;
  if (/(women|ladies|youth|kids|performance|moisture|athletic|team)/.test(text)) score += 5;
  if (/(mask|tote|blanket|accessory)/.test(text)) score -= 30;
  if (!imageUrl(style.styleImage)) score -= 100;
  return score;
}

function adidasMerchScore(style: Record<string, unknown> & { canonicalBrand: string }) {
  const text = [style.styleName, style.title, style.baseCategory, style.partNumber]
    .map((value) => String(value || '').toLowerCase()).join(' ');
  let score = 0;
  if (/(polo|quarter.?zip|1\/4.?zip|jacket|outerwear|vest|wind|rain)/.test(text)) score += 18;
  if (/(performance|moisture|athletic|training|sport|team|golf|soccer)/.test(text)) score += 16;
  if (/(hood|hoodie|fleece|sweatshirt|crewneck|tee|t-shirt|t shirt|long.?sleeve)/.test(text)) score += 14;
  if (/(hat|cap|beanie|headwear|bag|backpack|duffel|tote)/.test(text)) score += 12;
  if (/(short|jogger|pant)/.test(text)) score += 10;
  if (/(women|ladies|youth|kids)/.test(text)) score += 4;
  if (/(shoe|footwear|sock|ball|glove)/.test(text)) score -= 40;
  if (!imageUrl(style.styleImage)) score -= 100;
  return score;
}

function adidasPrimary(textValueInput: unknown) {
  const text = String(textValueInput || '').toLowerCase();
  if (/(backpack|duffel|tote|\bbags?\b)/.test(text)) return 'bags';
  if (/(hat|cap|beanie|headwear)/.test(text)) return 'hats';
  return nextLevelPrimary(text);
}

function adidasSecondaryTags(primaryType: string, textValueInput: unknown) {
  const tags = new Set(nextLevelSecondaryTags(primaryType, textValueInput));
  tags.add('sportswear');
  if (['polos', 'quarter_zips', 'outerwear'].includes(primaryType)) tags.add('business_apparel');
  return [...tags];
}

function adidasRuleKey(primaryType: string) {
  if (primaryType === 'bags') return 'premium_specialty';
  return nextLevelRuleKey(primaryType);
}

function nextLevelPrimary(textValueInput: unknown) {
  const text = String(textValueInput || '').toLowerCase();
  if (/(quarter.?zip|1\/4.?zip)/.test(text)) return 'quarter_zips';
  if (/(jacket|outerwear|windbreaker|vest|coat)/.test(text)) return 'outerwear';
  if (/(hood|hoodie|hooded.?sweatshirt)/.test(text)) return 'hoodies';
  if (/(crewneck|crew.?neck|sweatshirt|fleece)/.test(text)) return 'crewnecks';
  if (/(jogger|sweat.?pant|legging|\bpants?\b)/.test(text)) return 'pants';
  if (/\bshorts?\b/.test(text)) return 'shorts';
  if (/\bpolos?\b/.test(text)) return 'polos';
  if (/(tank|sleeveless)/.test(text)) return 'tank_tops';
  if (/(long.?sleeve|longsleeve)/.test(text)) return 'long_sleeve';
  if (/(tee|t-shirt|t shirt)/.test(text)) return 't_shirts';
  if (/(hat|cap|beanie|headwear)/.test(text)) return 'hats';
  return null;
}

function nextLevelSecondaryTags(primaryType: string, textValueInput: unknown) {
  const text = String(textValueInput || '').toLowerCase();
  const tags = new Set<string>();
  if (/(women|ladies)/.test(text)) tags.add('womens');
  else if (/(youth|kids|child)/.test(text)) tags.add('kids');
  else tags.add('mens');
  if (/(performance|moisture|wicking|athletic|sport|team)/.test(text)) tags.add('sportswear');
  if (/(performance|moisture|wicking)/.test(text)) tags.add('performance');
  if (['polos', 'quarter_zips', 'outerwear'].includes(primaryType)) tags.add('business_apparel');
  if (['long_sleeve', 'hoodies', 'crewnecks', 'outerwear', 'pants'].includes(primaryType)) tags.add('winter_cold_weather');
  return [...tags];
}

function nextLevelRuleKey(primaryType: string) {
  if (primaryType === 'hoodies') return 'hoodie';
  if (primaryType === 'crewnecks') return 'crewneck';
  if (primaryType === 'long_sleeve') return 'long_sleeve';
  if (primaryType === 'hats') return 'hat';
  if (['outerwear', 'quarter_zips', 'pants', 'shorts', 'polos'].includes(primaryType)) return 'premium_specialty';
  return 'premium_tshirt';
}

const championWinterGarmentOrder = [
  'long_sleeve', 'quarter_zips', 'hoodies', 'crewnecks', 'outerwear', 'pants', 'hats',
];

function championWinterPrimary(textValueInput: unknown) {
  const text = String(textValueInput || '').toLowerCase();
  if (/(quarter.?zip|1\/4.?zip)/.test(text)) return 'quarter_zips';
  if (/\b(coach.?jacket|bomber|windbreaker|anorak|insulated|fleece.?jacket|full.?zip.?jacket|outerwear|jacket|coat|vest)\b/.test(text)) return 'outerwear';
  if (/\b(hood|hoodie|hooded.?sweatshirt)\b/.test(text)) return 'hoodies';
  if (/\b(crewneck|crew.?neck|sweatshirt|fleece.?crew)\b/.test(text)) return 'crewnecks';
  if (/\b(joggers?|sweat.?pants?|warm.?up.?pants?|track.?pants?|leggings?|pants)\b/.test(text)) return 'pants';
  if (/\b(beanie|knit.?hat|cold.?weather.?cap|headwear|cap|hat)s?\b/.test(text)) return 'hats';
  if (/\b(long.?sleeve|longsleeve)\b/.test(text)) return 'long_sleeve';
  return null;
}

function championWinterSecondaryTags(primaryType: string, textValueInput: unknown) {
  const text = String(textValueInput || '').toLowerCase();
  const tags = new Set(['winter_cold_weather']);
  if (/(women|ladies)/.test(text)) tags.add('womens');
  else if (/(youth|kids|child)/.test(text)) tags.add('kids');
  else tags.add('mens');
  if (['hoodies', 'crewnecks', 'pants', 'outerwear'].includes(primaryType) || /(sport|athletic|team|warm.?up)/.test(text)) tags.add('sportswear');
  if (['quarter_zips', 'outerwear'].includes(primaryType)) tags.add('business_apparel');
  if (primaryType === 'outerwear' || /(weather|wind|water.?resistant|outdoor)/.test(text)) tags.add('outdoor');
  if (/(performance|moisture|wicking)/.test(text)) tags.add('performance');
  return [...tags];
}

function championWinterRuleKey(primaryType: string) {
  if (primaryType === 'hoodies') return 'hoodie';
  if (primaryType === 'crewnecks') return 'crewneck';
  if (primaryType === 'long_sleeve') return 'premium_tshirt';
  return 'premium_specialty';
}

function championCommonSize(value: unknown) {
  const size = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (size === 'XXL' || size === '2X') return '2XL';
  return size;
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://ilovehcapparel.net',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function importedDescriptionLines(value: unknown) {
  const description = String(value || '')
    .replace(/<(br|\/p|\/li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '\n');

  return [...new Set(
    description
      .split(/\n|[•]+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length >= 3),
  )];
}

const supportedShippingMethods = new Set([
  '1', '2', '3', '6', '8', '14', '16', '17', '19', '20', '21', '22', '26', '27', '40', '48', '54',
]);

function ssShippingMethod(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (supportedShippingMethods.has(normalized)) return normalized;
  if (normalized.includes('cheapest') || normalized.includes('economy')) return '54';
  return '1';
}

function safeSsErrorDetails(value: unknown, fallback: string) {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const errors = (Array.isArray(record.errors) ? record.errors : [])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      field: textValue(entry.field) || 'Unknown field',
      message: textValue(entry.message) || 'S&S rejected this field',
    }));
  const fieldMessage = errors.map((entry) => `${entry.field}: ${entry.message}`).join('; ');
  return {
    message: fieldMessage || textValue(record.message) || fallback,
    response_message: textValue(record.message) || fallback,
    field_errors: errors,
    response_code: textValue(record.code),
  };
}

function safeSsError(value: unknown, fallback: string) {
  return safeSsErrorDetails(value, fallback).message;
}

function inventoryQuantity(product: Record<string, unknown>) {
  const warehouses = Array.isArray(product.warehouses ?? product.Warehouses)
    ? (product.warehouses ?? product.Warehouses) as Array<Record<string, unknown>>
    : [];
  if (warehouses.length) {
    return warehouses.reduce((total, warehouse) => total + Math.max(0, Number(warehouse.qty ?? warehouse.Qty) || 0), 0);
  }
  return Math.max(0, Number(product.qty ?? product.Qty) || 0);
}

type SafePaymentProfile = {
  profile_id: number;
  profile_type: string;
  label: string;
};

function flattenSsRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap((entry) => flattenSsRecords(entry));
  return value && typeof value === 'object' ? [value as Record<string, unknown>] : [];
}

function safePaymentProfile(record: Record<string, unknown>): SafePaymentProfile | null {
  const profileId = integerValue(record.profileID ?? record.ProfileID ?? record.profileId);
  if (!profileId || profileId <= 0) return null;
  const rawType = textValue(record.profileType ?? record.ProfileType) || 'Payment method';
  const rawName = textValue(record.name ?? record.Name) || '';
  const lastFour = rawName.match(/(\d{4})(?!.*\d)/)?.[1];
  const profileType = /bank/i.test(rawType) ? 'Bank account' : /card/i.test(rawType) ? 'Credit card' : rawType;
  return {
    profile_id: profileId,
    profile_type: profileType,
    label: lastFour ? `${profileType} ending in ${lastFour}` : `${profileType} · PaymentProfile ${profileId}`,
  };
}

async function loadSsPaymentProfiles(authHeader: string, email: string) {
  const url = new URL('https://api.ssactivewear.com/v2/paymentprofiles/');
  url.searchParams.set('email', email);
  url.searchParams.set('mediatype', 'json');
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: authHeader, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(safeSsError(result, `S&S payment profiles could not be loaded (HTTP ${response.status})`));
  }
  return flattenSsRecords(result).map(safePaymentProfile).filter(Boolean) as SafePaymentProfile[];
}

function buildSsOrderRequest(
  vendorPayload: Record<string, unknown>,
  draftId: string,
  paymentProfile: { email: string; profileID: number },
) {
  const shipping = (vendorPayload.shipping_address || {}) as Record<string, unknown>;
  const items = Array.isArray(vendorPayload.items)
    ? vendorPayload.items as Array<Record<string, unknown>>
    : [];
  return {
    shippingAddress: {
      customer: textValue(vendorPayload.customer_name) || textValue(shipping.company) || textValue(shipping.name) || '',
      attn: textValue(shipping.name) || '',
      address: textValue(shipping.street) || textValue(shipping.line1) || textValue(shipping.address1),
      city: textValue(shipping.city),
      state: String(textValue(shipping.state) || '').toUpperCase(),
      zip: String(textValue(shipping.zip) || textValue(shipping.postal_code) || '').replace(/\s+/g, ''),
      residential: true,
    },
    shippingMethod: ssShippingMethod(vendorPayload.shipping_method),
    shipBlind: false,
    poNumber: textValue(vendorPayload.purchase_order_number) || `HC-${draftId}`,
    emailConfirmation: '',
    testOrder: false,
    autoselectWarehouse: true,
    paymentProfile,
    lines: items.map((item) => ({
      identifier: String(item.sku || '').trim(),
      qty: Math.trunc(Number(item.quantity)),
    })),
  };
}

function validateSsOrderRequest(requestBody: ReturnType<typeof buildSsOrderRequest>) {
  const errors: Array<{ field: string; message: string }> = [];
  const address = requestBody.shippingAddress;
  if (!address.address) errors.push({ field: 'shippingAddress.address', message: 'Street address is required' });
  if (!address.city) errors.push({ field: 'shippingAddress.city', message: 'City is required' });
  if (!/^[A-Z]{2}$/.test(address.state)) errors.push({ field: 'shippingAddress.state', message: 'Use a two-letter uppercase state abbreviation' });
  if (!/^\d{5}$/.test(address.zip)) errors.push({ field: 'shippingAddress.zip', message: 'S&S requires a five-digit ZIP code' });
  if (!supportedShippingMethods.has(requestBody.shippingMethod)) errors.push({ field: 'shippingMethod', message: 'Unsupported S&S shipping method' });
  if (!requestBody.poNumber) errors.push({ field: 'poNumber', message: 'Purchase order number is required' });
  if (!requestBody.paymentProfile.email || !/^\S+@\S+\.\S+$/.test(requestBody.paymentProfile.email)) {
    errors.push({ field: 'paymentProfile.email', message: 'The S&S payment-profile email is required' });
  }
  if (!Number.isInteger(requestBody.paymentProfile.profileID) || requestBody.paymentProfile.profileID <= 0) {
    errors.push({ field: 'paymentProfile.profileID', message: 'A valid S&S PaymentProfile ID is required' });
  }
  if (!requestBody.lines.length) errors.push({ field: 'lines', message: 'At least one order line is required' });
  requestBody.lines.forEach((line, index) => {
    if (!line.identifier) errors.push({ field: `lines[${index}].identifier`, message: 'S&S SKU identifier is required' });
    if (!Number.isInteger(line.qty) || line.qty <= 0) errors.push({ field: `lines[${index}].qty`, message: 'Quantity must be a positive integer' });
  });
  return { valid: errors.length === 0, errors };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return json(request, { error: 'Method not allowed' }, 405);
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return json(request, { error: 'Authentication required' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  let publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!publishableKey) {
    try {
      const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
      publishableKey = publishableKeys.default;
    } catch {
      publishableKey = undefined;
    }
  }
  if (!supabaseUrl || !publishableKey) {
    console.error('Missing required Supabase function environment variables');
    return json(request, { error: 'Server configuration error' }, 500);
  }

  let payload: {
    action?: string;
    brand?: string;
    draft_id?: string;
    order_id?: string;
    ss_live_submission_enabled?: boolean;
    zerotouch_live_submission_enabled?: boolean;
    payment_profile_email?: string;
    payment_profile_id?: number;
  };
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: 'Invalid request body' }, 400);
  }

  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const serviceMaintenance = Boolean(
    serviceRoleKey
    && jwt === serviceRoleKey
    && payload.action === 'refresh_public_style_content'
  );
  const userClient = createClient(
    supabaseUrl,
    serviceMaintenance ? serviceRoleKey! : publishableKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    },
  );

  let actorUserId: string | null = null;
  let actorEmail = '';
  if (serviceMaintenance) {
    actorEmail = 'service-maintenance';
  } else {
    const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !authData.user) {
      return json(request, { error: 'Invalid or expired session' }, 401);
    }

    const { data: isAdmin, error: roleError } = await userClient.rpc('is_admin');
    if (roleError) {
      console.error('Admin role check failed', roleError.message);
      return json(request, { error: 'Unable to verify administrator access' }, 500);
    }
    if (!isAdmin) {
      return json(request, { error: 'Administrator access required' }, 403);
    }
    actorUserId = authData.user.id;
    actorEmail = authData.user.email || '';
  }

  if (![
    'test_connection',
    'preview_catalog',
    'stage_styles',
    'stage_brand_styles',
    'stage_cold_weather_styles',
    'sync_brand_products',
    'get_brand_draft_report',
    'get_champion_winter_candidate_report',
    'import_champion_winter_drafts',
    'mark_champion_winter_qa_ready',
    'get_american_apparel_fall_winter_candidate_report',
    'import_american_apparel_fall_winter_drafts',
    'mark_american_apparel_fall_winter_qa_ready',
    'get_next_level_candidate_report',
    'import_next_level_live_products',
    'get_adidas_candidate_report',
    'import_adidas_live_products',
    'audit_adidas_pricing',
    'reprice_adidas_without_map',
    'get_map_reference_price_report',
    'refresh_public_style_content',
    'validate_vendor_order_draft',
    'refresh_vendor_order_cost_inventory',
    'refresh_vendor_order_status',
    'preview_vendor_order_submission',
    'get_vendor_order_submission_readiness',
    'check_blank_fulfillment_inventory',
    'create_blank_fulfillment_draft',
    'get_admin_status',
    'list_payment_profiles',
    'set_default_payment_profile',
    'set_live_controls',
    'submit_vendor_order',
  ].includes(payload.action || '')) {
    return json(request, { error: 'Unsupported action' }, 400);
  }

  const accountNumber = Deno.env.get('SS_ACCOUNT_NUMBER');
  const apiKey = Deno.env.get('SS_API_KEY');

  if (payload.action === 'get_map_reference_price_report') {
    const { data, error } = await userClient.rpc('admin_map_reference_price_audit');
    if (error) {
      console.error('MAP reference-only audit failed', error.message);
      return json(request, { error: 'The non-Adidas MAP reference audit could not be loaded.' }, 500);
    }
    return json(request, {
      products: data || [],
      products_flagged: data?.length || 0,
      note: 'Reference report only. No non-Adidas price was changed.',
      storefront_changed: false,
      ss_order_submitted: false,
    });
  }

  if (payload.action === 'audit_adidas_pricing' || payload.action === 'reprice_adidas_without_map') {
    const applyAdidasPrices = payload.action === 'reprice_adidas_without_map';
    const { data: latest, error: latestError } = await userClient
      .from('ss_import_staging')
      .select('import_session_id')
      .eq('brand', 'adidas')
      .eq('row_status', 'pending')
      .like('import_session_id', 'ss-brand-adidas-%')
      .order('created_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError || !latest) {
      return json(request, { error: 'Refresh the authenticated Adidas S&S catalog before running the pricing audit.' }, 409);
    }

    const [productsResult, skuResult, rulesResult, settingsResult] = await Promise.all([
      userClient.from('products')
        .select('id,name,style_number,supplier_sku,price,vendor_cost,stock,size_prices,storefront_pricing_rule_key')
        .eq('brand', 'adidas').eq('visibility', 'public').eq('is_active', true),
      userClient.from('ss_sku_staging')
        .select('part_number,style_name,sku,size_name,color_name,inventory_qty,fetched_at,map_price,retail_price,piece_price,dozen_price,case_price,sale_price,customer_price,noe_retailing')
        .eq('style_session_id', latest.import_session_id).eq('brand', 'adidas'),
      userClient.from('storefront_pricing_rules')
        .select('rule_key,display_name,minimum_price,maximum_price,cost_multiplier,fixed_allowance,minimum_margin_percent,storefront_margin_buffer')
        .eq('is_active', true),
      userClient.from('checkout_financial_settings')
        .select('minimum_margin_per_item,processing_enabled,payment_method_costs,public_visitor_price_markup_enabled,public_visitor_price_difference')
        .eq('id', 'default').maybeSingle(),
    ]);
    const readError = productsResult.error || skuResult.error || rulesResult.error || settingsResult.error;
    if (readError) {
      console.error('Adidas pricing audit read failed', readError.message);
      return json(request, { error: 'The Adidas pricing audit data could not be loaded.' }, 500);
    }

    const products = productsResult.data || [];
    const skuRows = skuResult.data || [];
    const rules = new Map((rulesResult.data || []).map((rule) => [String(rule.rule_key), rule]));
    const settings = settingsResult.data || {};
    const methods = Object.values((settings.payment_method_costs || {}) as Record<string, Record<string, unknown>>)
      .filter((method) => method?.enabled === true);
    const visitorDifference = settings.public_visitor_price_markup_enabled === false
      ? 0 : Number(settings.public_visitor_price_difference ?? 5);
    const money = (value: number) => Number(value.toFixed(2));
    const safeMoney = (value: number) => Math.ceil((value - Number.EPSILON) * 100) / 100;

    const audits = products.map((product) => {
      const style = String(product.style_number || '').trim().toLowerCase();
      const part = String(product.supplier_sku || '').trim().toLowerCase();
      const rows = skuRows.filter((row) => {
        const rowStyle = String(row.style_name || '').trim().toLowerCase();
        const rowPart = String(row.part_number || '').trim().toLowerCase();
        return (style && rowStyle === style) || (part && rowPart === part);
      });
      const stocked = rows.filter((row) => Number(row.inventory_qty) > 0);
      const rule = rules.get(String(product.storefront_pricing_rule_key || ''));
      const variants = stocked.map((row) => {
        const vendorCost = Number(row.customer_price || row.piece_price || 0);
        const explicitMap = Number(row.map_price) > 0.01 ? Number(row.map_price) : 0;
        const msrp = Number(row.retail_price) > 0 ? Number(row.retail_price) : 0;
        const desiredMargin = Math.max(
          Number(settings.minimum_margin_per_item || 3),
          Number(rule?.storefront_margin_buffer || 3),
        );
        const paymentFloors = settings.processing_enabled === false ? [] : methods.map((method) => {
          const percentage = Number(method.percentage || 0) / 100;
          return percentage < 1 ? (vendorCost + desiredMargin + Number(method.fixed_fee || 0)) / (1 - percentage) : 0;
        });
        const paymentFloor = Math.max(0, ...paymentFloors);
        const ruleFloor = rule ? Math.max(
          Number(rule.minimum_price || 0),
          vendorCost + Number(rule.storefront_margin_buffer || 3),
          vendorCost * Number(rule.cost_multiplier || 1) + Number(rule.fixed_allowance || 0) + Number(rule.storefront_margin_buffer || 3),
          vendorCost / (1 - Number(rule.minimum_margin_percent || 0)),
        ) : vendorCost + desiredMargin;
        const safeFloor = Math.max(ruleFloor, paymentFloor);
        // S&S MAP and MSRP are retained for admin reference only. HC Apparel
        // pricing is determined exclusively by cost, its selected pricing rule,
        // desired margin, and the worst-case enabled payment-method fee.
        const recommended = safeMoney(safeFloor);
        const processingCost = settings.processing_enabled === false ? 0 : Math.max(0, ...methods.map((method) => (
          recommended * Number(method.percentage || 0) / 100 + Number(method.fixed_fee || 0)
        )));
        const pricingSource = paymentFloor >= ruleFloor
          ? 'Payment-processing protection' : 'HC Apparel pricing rule';
        return {
          sku: row.sku,
          size: row.size_name,
          color: row.color_name,
          vendor_cost: money(vendorCost),
          map: explicitMap ? money(explicitMap) : null,
          msrp: msrp ? money(msrp) : null,
          sale_price: Number(row.sale_price) > 0 ? money(Number(row.sale_price)) : null,
          piece_price: Number(row.piece_price) > 0 ? money(Number(row.piece_price)) : null,
          payment_floor: money(paymentFloor),
          safe_floor: money(safeFloor),
          recommended: money(recommended),
          processing_cost: money(processingCost),
          pricing_source: pricingSource,
          inventory: Number(row.inventory_qty) || 0,
          noe_retailing: Boolean(row.noe_retailing),
          fetched_at: row.fetched_at,
        };
      }).filter((variant) => variant.vendor_cost > 0);
      const representative = variants.sort((a, b) => a.recommended - b.recommended || a.vendor_cost - b.vendor_cost)[0];
      const currentPrice = money(Number(product.price || 0));
      const recommended = representative?.recommended || 0;
      const difference = money(currentPrice - recommended);
      const status = !representative || !rule ? 'DATA ERROR'
        : currentPrice + 0.01 < recommended ? 'BELOW FLOOR'
          : currentPrice - 0.01 > recommended ? 'TOO HIGH'
            : 'PASS';
      return {
        product_id: product.id,
        style: product.style_number,
        part_number: product.supplier_sku,
        product: product.name,
        inventory: stocked.reduce((sum, row) => sum + Math.max(0, Number(row.inventory_qty) || 0), 0),
        ss_cost: representative?.vendor_cost || null,
        map: representative?.map || null,
        map_status: representative?.map ? 'Reference only — not used for HC Apparel pricing' : 'Unavailable or placeholder — not used for pricing',
        msrp_list: representative?.msrp || null,
        sale_price: representative?.sale_price || null,
        current_customer_price: currentPrice,
        old_customer_price: currentPrice,
        new_customer_price: recommended || null,
        calculated_safe_floor: representative?.safe_floor || null,
        payment_processing_floor: representative?.payment_floor || null,
        recommended_customer_price: recommended || null,
        public_visitor_price: money((recommended || currentPrice) + visitorDifference),
        difference,
        pricing_source: representative?.pricing_source || 'Unavailable',
        pricing_rule: rule?.display_name || null,
        minimum_margin: Math.max(Number(settings.minimum_margin_per_item || 3), Number(rule?.storefront_margin_buffer || 3)),
        estimated_processing_cost: representative ? representative.processing_cost : null,
        estimated_net_margin: representative && recommended
          ? money(recommended - representative.vendor_cost - representative.processing_cost)
          : null,
        status,
        variant_count: variants.length,
        fetched_at: representative?.fetched_at || null,
        variant_prices: variants.map((variant) => ({
          sku: variant.sku,
          price: variant.recommended,
          vendor_cost: variant.vendor_cost,
          inventory: variant.inventory,
        })),
      };
    }).sort((a, b) => String(a.style).localeCompare(String(b.style)));

    if (applyAdidasPrices) {
      const invalid = audits.filter((item) => item.status === 'DATA ERROR' || !(Number(item.new_customer_price) > 0));
      if (invalid.length > 0 || audits.length !== 27) {
        return json(request, {
          error: `Adidas repricing stopped safely: expected 27 complete live products and found ${audits.length - invalid.length} eligible records.`,
          audits,
          storefront_changed: false,
          ss_order_submitted: false,
        }, 409);
      }

      for (const audit of audits) {
        const product = products.find((item) => item.id === audit.product_id);
        const pricesBySku = new Map((audit.variant_prices || []).map((item) => [String(item.sku), item]));
        const existingVariants = Array.isArray(product?.size_prices) ? product.size_prices : [];
        const updatedVariants = existingVariants.map((variant: Record<string, unknown>) => {
          const current = pricesBySku.get(String(variant.sku || ''));
          return current ? {
            ...variant,
            price: current.price,
            vendor_cost: current.vendor_cost,
            inventory: current.inventory,
          } : variant;
        });
        if (updatedVariants.length === 0 || updatedVariants.some((variant: Record<string, unknown>) => !(Number(variant.price) > 0))) {
          return json(request, {
            error: `Adidas repricing stopped safely because ${audit.style} does not have complete SKU price data.`,
            audits,
            storefront_changed: false,
            ss_order_submitted: false,
          }, 409);
        }
        const { error: updateError } = await userClient.from('products').update({
          price: audit.new_customer_price,
          vendor_cost: audit.ss_cost,
          size_prices: updatedVariants,
          profit_estimate: money(Number(audit.new_customer_price) - Number(audit.ss_cost) - Number(audit.estimated_processing_cost || 0)),
          storefront_price_applied_at: new Date().toISOString(),
          price_edit_note: 'Removed HC Apparel MAP pricing policy; repriced from current S&S cost, HC pricing rule, margin, and payment-processing protection.',
        }).eq('id', audit.product_id);
        if (updateError) {
          console.error('Adidas no-MAP repricing update failed', audit.product_id, updateError.message);
          return json(request, {
            error: `Adidas repricing stopped while updating ${audit.style}. Review the price audit before retrying.`,
            audits,
            storefront_changed: true,
            ss_order_submitted: false,
          }, 500);
        }
      }
    }

    return json(request, {
      brand: 'adidas',
      staging_session: latest.import_session_id,
      products_audited: audits.length,
      counts: audits.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {} as Record<string, number>),
      audits,
      visitor_price_difference: visitorDifference,
      ss_map_definition: 'S&S Products API mapPrice — stored for Super Admin reference only; not enforced',
      ss_retail_definition: "S&S Products API retailPrice — stored for Super Admin reference only; not enforced",
      pricing_policy: 'HC Apparel cost, pricing rule, margin, and worst-case enabled payment-method protection; MAP and MSRP excluded',
      storefront_changed: applyAdidasPrices,
      ss_order_submitted: false,
    });
  }

  if (payload.action === 'mark_champion_winter_qa_ready' || payload.action === 'mark_american_apparel_fall_winter_qa_ready') {
    const seasonalBrand = payload.action === 'mark_champion_winter_qa_ready' ? 'Champion' : 'American Apparel';
    const notePrefix = seasonalBrand === 'Champion' ? 'Private Champion winter S&S draft.%' : 'Private American Apparel fall/winter S&S draft.%';
    const { data: drafts, error: draftsError } = await userClient
      .from('products')
      .select('id,name,style_number,visibility,is_active,image_url,price,stock,available_sizes,available_colors,size_prices,primary_garment_type,secondary_tags,internal_notes')
      .eq('brand', seasonalBrand)
      .eq('visibility', 'draft')
      .eq('is_active', false)
      .like('internal_notes', notePrefix);
    if (draftsError) {
      console.error(`Unable to load ${seasonalBrand} seasonal drafts for QA disposition`, draftsError.message);
      return json(request, { error: `${seasonalBrand} seasonal drafts could not be reviewed` }, 500);
    }
    const qaDrafts = drafts || [];
    const invalid = qaDrafts.filter((draft) => (
      !draft.image_url || !(Number(draft.price) > 0) || Number(draft.stock) < 25
      || !Array.isArray(draft.available_sizes) || draft.available_sizes.length === 0
      || !Array.isArray(draft.available_colors) || draft.available_colors.length === 0
      || !Array.isArray(draft.size_prices) || draft.size_prices.length === 0
      || !championWinterGarmentOrder.includes(String(draft.primary_garment_type || ''))
      || !Array.isArray(draft.secondary_tags) || !draft.secondary_tags.includes('winter_cold_weather')
      || /\b(private|internal|qa|test|not approved)\b/i.test(String(draft.name || ''))
    ));
    const countInvalid = seasonalBrand === 'Champion' ? qaDrafts.length !== 6 : qaDrafts.length < 1 || qaDrafts.length > 20;
    if (countInvalid || invalid.length > 0) {
      return json(request, {
        error: `${seasonalBrand} seasonal QA remains blocked: found ${qaDrafts.length} private drafts, with ${invalid.length} failing data checks.`,
      });
    }
    const reviewedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await userClient
      .from('products')
      .update({
        draft_qa_status: 'ready_for_admin_approval',
        draft_qa_reviewed_at: reviewedAt,
        internal_notes: `Ready for Admin Approval only. ${seasonalBrand} seasonal draft passed current S&S inventory, image, name, primary/secondary classification, SKU, size/color, guardrail price, private product-detail, isolated QA cart, and mobile-layout checks. Not published.`,
      })
      .in('id', qaDrafts.map((draft) => draft.id))
      .select('id,name,style_number,primary_garment_type,secondary_tags,draft_qa_status');
    if (updateError) {
      console.error(`Unable to save ${seasonalBrand} seasonal QA disposition`, updateError.message);
      return json(request, { error: `${seasonalBrand} seasonal QA disposition could not be saved` }, 500);
    }
    return json(request, {
      seasonal_drafts_reviewed: updated?.length || 0,
      ready_for_admin_approval: updated?.length || 0,
      products: updated || [],
      storefront_changed: false,
      ss_order_submitted: false,
      zerotouch_submitted: false,
    });
  }

  if ([
    'get_champion_winter_candidate_report',
    'import_champion_winter_drafts',
    'get_american_apparel_fall_winter_candidate_report',
    'import_american_apparel_fall_winter_drafts',
    'get_next_level_candidate_report',
    'import_next_level_live_products',
    'get_adidas_candidate_report',
    'import_adidas_live_products',
  ].includes(payload.action || '')) {
    const seasonalBrand = payload.action?.includes('adidas') ? 'adidas' : payload.action?.includes('next_level') ? 'Next Level' : payload.action?.includes('american_apparel') ? 'American Apparel' : 'Champion';
    const normalizedSeasonalBrand = normalizeBrand(seasonalBrand);
    const reportAction = seasonalBrand === 'Champion' ? 'get_champion_winter_candidate_report'
      : seasonalBrand === 'American Apparel' ? 'get_american_apparel_fall_winter_candidate_report'
        : seasonalBrand === 'adidas' ? 'get_adidas_candidate_report' : 'get_next_level_candidate_report';
    const { data: latest, error: latestError } = await userClient
      .from('ss_import_staging')
      .select('import_session_id')
      .eq('brand', seasonalBrand)
      .eq('row_status', 'pending')
      .like('import_session_id', `ss-brand-${normalizedSeasonalBrand}-%`)
      .order('created_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError || !latest) {
      console.error(`Unable to locate ${seasonalBrand} seasonal staging`, latestError?.message);
      return json(request, { error: `Stage and refresh ${seasonalBrand} styles before reviewing seasonal candidates` }, 409);
    }

    const [stylesResult, skuResult, existingResult, rulesResult, settingsResult] = await Promise.all([
      userClient.from('ss_import_staging')
        .select('raw_row_data,style_number,image_url')
        .eq('import_session_id', latest.import_session_id)
        .eq('brand', seasonalBrand)
        .eq('row_status', 'pending'),
      userClient.from('ss_sku_staging')
        .select('part_number,style_name,sku,size_name,size_order,color_name,color_code,color_swatch_image,color_front_image,color_on_model_front_image,unit_weight,inventory_qty,fetched_at,map_price,piece_price,customer_price')
        .eq('style_session_id', latest.import_session_id)
        .eq('brand', seasonalBrand),
      userClient.from('products').select('style_number,supplier_sku').eq('brand', seasonalBrand),
      userClient.from('storefront_pricing_rules')
        .select('rule_key,cost_multiplier,fixed_allowance,minimum_margin_percent,storefront_margin_buffer')
        .eq('is_active', true),
      userClient.from('checkout_financial_settings')
        .select('minimum_margin_per_item,payment_method_costs')
        .eq('id', 'default').maybeSingle(),
    ]);
    const readError = stylesResult.error || skuResult.error || existingResult.error || rulesResult.error || settingsResult.error;
    if (readError) {
      console.error(`Unable to build ${seasonalBrand} seasonal candidate report`, readError.message);
      return json(request, { error: `${seasonalBrand} seasonal candidates could not be reviewed` }, 500);
    }

    const existing = new Set((existingResult.data || []).flatMap((product) => [product.style_number, product.supplier_sku])
      .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
    const rules = new Map((rulesResult.data || []).map((rule) => [rule.rule_key, rule]));
    const financialSettings = settingsResult.data || {};
    const skuRows = skuResult.data || [];
    const candidates = (stylesResult.data || []).map((styleRow) => {
      let raw: Record<string, unknown> = {};
      try {
        raw = typeof styleRow.raw_row_data === 'string' ? JSON.parse(styleRow.raw_row_data) : (styleRow.raw_row_data || {});
      } catch {
        raw = {};
      }
      const partNumber = String(raw.partNumber || styleRow.style_number || '').trim();
      const styleName = String(raw.styleName || '').trim();
      const title = String(raw.title || '').trim();
      const baseCategory = String(raw.baseCategory || '').trim();
      const description = importedDescriptionLines(raw.description).join(' ');
      const catalogIdentityText = [styleName, title, baseCategory, partNumber].join(' ');
      const identityText = [catalogIdentityText, description].join(' ');
      const primaryType = seasonalBrand === 'adidas' ? adidasPrimary(catalogIdentityText)
        : seasonalBrand === 'Next Level' ? nextLevelPrimary(catalogIdentityText) : championWinterPrimary(catalogIdentityText);
      const variants = skuRows.filter((row) => String(row.part_number || '').trim().toLowerCase() === partNumber.toLowerCase());
      const stocked = variants.filter((row) => Number(row.inventory_qty) > 0);
      const priced = stocked.filter((row) => Number(row.customer_price || row.piece_price) > 0);
      const totalInventory = stocked.reduce((sum, row) => sum + Math.max(0, Number(row.inventory_qty) || 0), 0);
      const colors = [...new Set(stocked.map((row) => String(row.color_name || '').trim()).filter(Boolean))];
      const sizes = [...new Set(stocked.map((row) => String(row.size_name || '').trim()).filter(Boolean))];
      const commonSizes = new Set(sizes.map(championCommonSize).filter((size) => ['S', 'M', 'L', 'XL', '2XL'].includes(size)));
      const ruleKey = primaryType ? (seasonalBrand === 'adidas' ? adidasRuleKey(primaryType)
        : seasonalBrand === 'Next Level' ? nextLevelRuleKey(primaryType) : championWinterRuleKey(primaryType)) : 'premium_specialty';
      const rule = rules.get(ruleKey);
      const calculatedVariants = priced.map((row) => {
        const vendorCost = Number(row.customer_price || row.piece_price);
        const methodFloors = Object.values((financialSettings.payment_method_costs || {}) as Record<string, Record<string, unknown>>)
          .filter((method) => method?.enabled === true)
          .map((method) => (vendorCost + Math.max(Number(financialSettings.minimum_margin_per_item || 3), Number(rule?.storefront_margin_buffer || 3)) + Number(method.fixed_fee || 0)) / (1 - Number(method.percentage || 0) / 100));
        const publicPrice = rule ? Number(Math.max(
          vendorCost + Number(rule.storefront_margin_buffer || 3),
          vendorCost * Number(rule.cost_multiplier || 1) + Number(rule.fixed_allowance || 0) + Number(rule.storefront_margin_buffer || 3),
          vendorCost / (1 - Number(rule.minimum_margin_percent || 0)),
          ...methodFloors,
        ).toFixed(2)) : 0;
        return { row, vendorCost, publicPrice };
      });
      const primaryImage = stocked.find((row) => row.color_on_model_front_image)?.color_on_model_front_image
        || stocked.find((row) => row.color_front_image)?.color_front_image
        || styleRow.image_url
        || imageUrl(raw.styleImage);
      const latestRefresh = stocked.map((row) => new Date(String(row.fetched_at || 0)).getTime())
        .filter(Number.isFinite).sort((a, b) => b - a)[0] || 0;
      const blockers = [
        !primaryType ? 'Unsupported or unclear garment type' : null,
        existing.has(styleName.toLowerCase()) || existing.has(partNumber.toLowerCase()) ? `Already exists in the ${seasonalBrand} catalog` : null,
        !primaryImage ? 'Missing product image' : null,
        stocked.length === 0 ? 'No stocked SKU variants' : null,
        calculatedVariants.length === 0 ? 'No current vendor price' : null,
        !rule ? `No active ${ruleKey} pricing rule` : null,
        totalInventory < 25 ? `Low inventory (${totalInventory} units)` : null,
        colors.length === 0 ? 'No stocked colors' : null,
        primaryType && !['hats', 'bags'].includes(primaryType) && commonSizes.size < 3
          ? `Insufficient common-size coverage (${[...commonSizes].join(', ') || 'none'})`
          : null,
        latestRefresh < Date.now() - 24 * 60 * 60 * 1000 ? 'Pricing or inventory is stale' : null,
        calculatedVariants.some((variant) => !(variant.publicPrice > variant.vendorCost)) ? 'Pricing guardrail failed' : null,
      ].filter(Boolean) as string[];
      const displayTitle = title || styleName || partNumber || 'Apparel';
      const brandPattern = new RegExp(`^${seasonalBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const customerName = brandPattern.test(displayTitle) ? displayTitle : `${seasonalBrand} ${displayTitle}`;
      return {
        part_number: partNumber,
        style_name: styleName,
        customer_name: customerName,
        base_category: baseCategory,
        description,
        primary_type: primaryType,
        secondary_tags: primaryType ? (seasonalBrand === 'adidas' ? adidasSecondaryTags(primaryType, identityText)
          : seasonalBrand === 'Next Level' ? nextLevelSecondaryTags(primaryType, identityText) : championWinterSecondaryTags(primaryType, identityText)) : [],
        pricing_rule_key: ruleKey,
        total_inventory: totalInventory,
        stocked_variants: stocked.length,
        stocked_colors: colors.length,
        stocked_sizes: sizes.length,
        common_sizes: [...commonSizes],
        image_url: primaryImage,
        public_price: calculatedVariants.length ? Math.min(...calculatedVariants.map((variant) => variant.publicPrice)) : null,
        refreshed_at: latestRefresh ? new Date(latestRefresh).toISOString() : null,
        blockers,
        ready_for_private_import: blockers.length === 0,
        sizes,
        colors: colors.map((colorName) => {
          const row = stocked.find((variant) => variant.color_name === colorName);
          return { name: colorName, color_code: row?.color_code || null, swatch_image: row?.color_swatch_image || null };
        }),
        variants: calculatedVariants.map(({ row, vendorCost, publicPrice }) => ({
          sku: row.sku,
          size: row.size_name,
          color: row.color_name,
          price: publicPrice,
          vendor_cost: vendorCost,
          inventory: Number(row.inventory_qty) || 0,
          color_name: row.color_name,
          color_code: row.color_code,
          image_url: row.color_on_model_front_image || row.color_front_image || null,
          color_swatch_image: row.color_swatch_image || null,
          unit_weight: row.unit_weight || null,
        })),
        minimum_vendor_cost: calculatedVariants.length ? Math.min(...calculatedVariants.map((variant) => variant.vendorCost)) : null,
        unit_weight: Math.max(0, ...stocked.map((row) => Number(row.unit_weight) || 0)),
      };
    });

    const winterCandidates = candidates.filter((candidate) => Boolean(candidate.primary_type));
    const readyCandidates = winterCandidates.filter((candidate) => candidate.ready_for_private_import).slice(0, seasonalBrand === 'adidas' ? 30 : 20);
    const safeReport = (candidate: typeof candidates[number]) => ({
      part_number: candidate.part_number,
      style_name: candidate.style_name,
      customer_name: candidate.customer_name,
      primary_type: candidate.primary_type,
      secondary_tags: candidate.secondary_tags,
      total_inventory: candidate.total_inventory,
      stocked_variants: candidate.stocked_variants,
      stocked_colors: candidate.stocked_colors,
      stocked_sizes: candidate.stocked_sizes,
      common_sizes: candidate.common_sizes,
      public_price: candidate.public_price,
      image_available: Boolean(candidate.image_url),
      refreshed_at: candidate.refreshed_at,
      ready_for_private_import: candidate.ready_for_private_import,
      blockers: candidate.blockers,
    });

    if (payload.action === reportAction) {
      return json(request, {
        brand: seasonalBrand,
        staging_session: latest.import_session_id,
        staged_styles: candidates.length,
        winter_candidates: winterCandidates.length,
        ready_for_private_import: readyCandidates.length,
        blocked: winterCandidates.length - readyCandidates.length,
        products: winterCandidates.map(safeReport),
        storefront_changed: false,
        ss_order_submitted: false,
        zerotouch_submitted: false,
      });
    }

    if (readyCandidates.length === 0) {
      return json(request, { error: `No new ${seasonalBrand} seasonal products passed the private-import checks` }, 409);
    }
    if (seasonalBrand === 'adidas' && readyCandidates.length < 27) {
      return json(request, {
        error: `Only ${readyCandidates.length} Adidas products passed current image, inventory, SKU, size/color, margin, and pricing checks; at least 27 are required before publication.`,
        products: winterCandidates.map(safeReport),
      }, 409);
    }
    const productRows = readyCandidates.map((candidate) => ({
      id: crypto.randomUUID(),
      name: candidate.customer_name,
      description: candidate.description || `${candidate.customer_name} blank apparel for teams, businesses, organizations, and everyday wear. Custom printing is optional.`,
      price: candidate.public_price,
      product_type: 'physical',
      visibility: 'draft',
      is_active: false,
      image_url: candidate.image_url,
      stock: candidate.total_inventory,
      category: candidate.primary_type === 'long_sleeve'
        ? candidate.secondary_tags.includes('kids') ? 'youth_long_sleeve_shirts'
          : candidate.secondary_tags.includes('womens') ? 'womens_long_sleeve_shirts' : 'mens_long_sleeve_shirts'
        : candidate.primary_type === 'hoodies' ? 'hoodies'
          : candidate.primary_type === 'crewnecks' || candidate.primary_type === 'quarter_zips'
            ? candidate.secondary_tags.includes('kids') ? 'youth_crewnecks'
              : candidate.secondary_tags.includes('womens') ? 'womens_crewnecks' : 'mens_crewnecks'
            : candidate.primary_type === 'outerwear'
              ? candidate.secondary_tags.includes('kids') ? 'youth_jackets'
                : candidate.secondary_tags.includes('womens') ? 'womens_jackets' : 'mens_jackets'
              : candidate.primary_type === 'hats' ? 'hats'
                : candidate.primary_type === 'bags' ? 'bags'
                : candidate.primary_type === 't_shirts'
                  ? candidate.secondary_tags.includes('kids') ? 'youth_short_sleeve_shirts'
                    : candidate.secondary_tags.includes('womens') ? 'womens_short_sleeve_shirts' : 'mens_short_sleeve_shirts'
                  : candidate.primary_type === 'polos'
                    ? candidate.secondary_tags.includes('kids') ? 'youth_polo_shirts'
                      : candidate.secondary_tags.includes('womens') ? 'womens_polo_shirts' : 'mens_polo_shirts'
                    : ['tank_tops', 'shorts', 'pants'].includes(candidate.primary_type)
                      ? candidate.secondary_tags.includes('kids') ? 'youth_sportswear'
                        : candidate.secondary_tags.includes('womens') ? 'womens_sportswear' : 'mens_sportswear'
                      : 'sportswear',
      categories: [candidate.base_category, candidate.primary_type].filter(Boolean),
      tags: candidate.secondary_tags.map((tag) => `storefront:${tag}`),
      primary_garment_type: candidate.primary_type,
      secondary_tags: candidate.secondary_tags,
      available_sizes: candidate.sizes,
      available_colors: candidate.colors,
      size_prices: candidate.variants,
      vendor_source: 'S&S Activewear',
      vendor_cost: candidate.minimum_vendor_cost,
      supplier_sku: candidate.part_number,
      brand: seasonalBrand,
      style_number: candidate.style_name || candidate.part_number,
      vendor_data_refreshed_at: candidate.refreshed_at,
      storefront_pricing_rule_key: candidate.pricing_rule_key,
      storefront_price_applied_at: new Date().toISOString(),
      garment_weight: candidate.unit_weight ? `${candidate.unit_weight} lb` : null,
      features: [candidate.base_category, 'Authenticated S&S catalog data', seasonalBrand === 'adidas' ? 'Performance apparel and accessories' : 'Fall / Winter'].filter(Boolean),
      draft_qa_status: ['Next Level', 'adidas'].includes(seasonalBrand) ? 'ready_for_admin_approval' : 'ready_for_private_qa',
      internal_notes: ['Next Level', 'adidas'].includes(seasonalBrand)
        ? `${seasonalBrand} authenticated S&S draft passed image, inventory, SKU, size/color, HC Apparel margin, and payment-method fee checks. S&S MAP and MSRP are reference-only fields and were not used for pricing. Approved in this task for publication. ${candidate.total_inventory} current units across ${candidate.stocked_colors} colors, ${candidate.stocked_sizes} sizes, and ${candidate.stocked_variants} stocked SKU variants.`
        : `Private ${seasonalBrand} ${seasonalBrand === 'Champion' ? 'winter' : 'fall/winter'} S&S draft. Ready for Private QA only. ${candidate.total_inventory} current units across ${candidate.stocked_colors} colors, ${candidate.stocked_sizes} sizes, and ${candidate.stocked_variants} stocked SKU variants. Not published.`,
    }));
    const { data: inserted, error: insertError } = await userClient
      .from('products')
      .insert(productRows)
      .select('id,name,style_number,supplier_sku,primary_garment_type,secondary_tags,price,stock');
    if (insertError) {
      console.error(`Unable to import ${seasonalBrand} seasonal drafts`, insertError.message);
      return json(request, {
        error: `${seasonalBrand} seasonal products could not be imported as private drafts: ${insertError.message.slice(0, 240)}`,
      });
    }
    if (['Next Level', 'adidas'].includes(seasonalBrand)) {
      const insertedIds = (inserted || []).map((product) => product.id);
      const { data: published, error: publishError } = await userClient.from('products').update({
        visibility: 'public', is_active: true, draft_qa_status: 'approved', draft_qa_reviewed_at: new Date().toISOString(),
      }).in('id', insertedIds).select('id,name,style_number,supplier_sku,primary_garment_type,secondary_tags,price,stock');
      if (publishError) {
        console.error(`${seasonalBrand} publication failed after private import`, publishError.message);
        return json(request, { error: `${seasonalBrand} products passed import QA but could not be published; they remain private.` }, 500);
      }
      return json(request, {
        brand: seasonalBrand, reviewed: winterCandidates.length, published: published?.length || 0,
        products: published || [], blocked_products: winterCandidates.filter((candidate) => !candidate.ready_for_private_import).map(safeReport),
        storefront_changed: true, ss_order_submitted: false, zerotouch_submitted: false,
      });
    }
    return json(request, {
      brand: seasonalBrand,
      imported_private_drafts: inserted?.length || 0,
      ready_for_private_qa: inserted?.length || 0,
      products: inserted || [],
      candidate_report: winterCandidates.map(safeReport),
      storefront_changed: false,
      ss_order_submitted: false,
      zerotouch_submitted: false,
    });
  }

  if (payload.action === 'get_brand_draft_report') {
    const brand = canonicalApprovedBrand(payload.brand);
    if (!brand) return json(request, { error: 'Select an approved S&S brand' }, 400);
    const { data: drafts, error: draftsError } = await userClient
      .from('products')
      .select('id,name,brand,style_number,supplier_sku,category,price,stock,image_url,available_sizes,available_colors,size_prices,vendor_data_refreshed_at,storefront_pricing_rule_key,internal_notes')
      .eq('brand', brand).eq('visibility', 'draft').eq('is_active', false)
      .order('name');
    if (draftsError) {
      console.error('Unable to load private brand drafts', draftsError.message);
      return json(request, { error: 'Unable to load the private brand draft report' }, 500);
    }
    const { count: publicCount, error: countError } = await userClient
      .from('products').select('id', { count: 'exact', head: true })
      .eq('visibility', 'public').eq('is_active', true);
    if (countError) {
      console.error('Unable to count public products', countError.message);
      return json(request, { error: 'Unable to verify the public catalog count' }, 500);
    }
    const report = (drafts || []).map((draft) => {
      const variants = Array.isArray(draft.size_prices) ? draft.size_prices : [];
      const sizes = Array.isArray(draft.available_sizes) ? draft.available_sizes : [];
      const colors = Array.isArray(draft.available_colors) ? draft.available_colors : [];
      const blockers = [
        !draft.image_url ? 'Missing image' : null,
        !(Number(draft.price) > 0) ? 'Missing public price' : null,
        !(Number(draft.stock) > 0) ? 'No current inventory' : null,
        brand === 'Champion' && Number(draft.stock) <= 1 ? 'Insufficient launch inventory (1 unit)' : null,
        variants.length === 0 ? 'Missing SKU variants' : null,
        sizes.length === 0 ? 'Missing sizes' : null,
        colors.length === 0 ? 'Missing colors' : null,
        !draft.vendor_data_refreshed_at ? 'Missing freshness timestamp' : null,
      ].filter(Boolean);
      return {
        id: draft.id,
        name: draft.name,
        style_number: draft.style_number,
        supplier_sku: draft.supplier_sku,
        category: draft.category,
        public_price: draft.price,
        inventory: draft.stock,
        sku_variants: variants.length,
        sizes: sizes.length,
        colors: colors.length,
        image_available: Boolean(draft.image_url),
        pricing_rule: draft.storefront_pricing_rule_key,
        refreshed_at: draft.vendor_data_refreshed_at,
        ready_for_private_qa: blockers.length === 0,
        blockers,
        internal_status: draft.internal_notes,
      };
    });
    return json(request, {
      brand,
      private_drafts: report.length,
      ready_for_private_qa: report.filter((draft) => draft.ready_for_private_qa).length,
      blocked: report.filter((draft) => !draft.ready_for_private_qa).length,
      public_catalog_count: publicCount || 0,
      products: report,
      storefront_changed: false,
      ss_order_submitted: false,
      zerotouch_submitted: false,
    });
  }

  if (payload.action === 'list_payment_profiles' || payload.action === 'set_default_payment_profile') {
    if (!accountNumber || !apiKey) return json(request, { error: 'S&S credentials are not configured' }, 503);
    const email = String(payload.payment_profile_email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return json(request, { error: 'Enter the email used for the saved payment method in your S&S account' }, 400);
    }
    try {
      const profiles = await loadSsPaymentProfiles(`Basic ${btoa(`${accountNumber}:${apiKey}`)}`, email);
      if (payload.action === 'set_default_payment_profile') {
        const profileId = integerValue(payload.payment_profile_id);
        const selected = profiles.find((profile) => profile.profile_id === profileId);
        if (!selected) {
          return json(request, {
            error: profiles.length
              ? 'The selected S&S PaymentProfile is no longer available'
              : 'Add or activate a payment method in your S&S Activewear account before submitting orders.',
          }, 409);
        }
        const { error: updateError } = await userClient.from('integration_settings').update({
          ss_default_payment_profile_id: selected.profile_id,
          ss_payment_profile_email: email,
          ss_payment_profile_verified_at: new Date().toISOString(),
          updated_by: actorUserId,
        }).eq('id', true);
        if (updateError) {
          console.error('Unable to save S&S PaymentProfile selection', updateError.message);
          return json(request, { error: 'Unable to save the default S&S PaymentProfile' }, 500);
        }
        return json(request, { profiles, selected_profile_id: selected.profile_id, selected_profile: selected, configured: true });
      }
      const { data: settings } = await userClient.from('integration_settings')
        .select('ss_default_payment_profile_id,ss_payment_profile_email').eq('id', true).maybeSingle();
      return json(request, {
        profiles,
        selected_profile_id: settings?.ss_payment_profile_email === email
          ? settings?.ss_default_payment_profile_id
          : null,
        configured: Boolean(settings?.ss_default_payment_profile_id && settings?.ss_payment_profile_email === email),
        message: profiles.length
          ? `${profiles.length} S&S payment profile${profiles.length === 1 ? '' : 's'} found.`
          : 'Add or activate a payment method in your S&S Activewear account before submitting orders.',
      });
    } catch (error) {
      console.error('Read-only S&S PaymentProfile lookup failed', error instanceof Error ? error.message : 'unknown');
      return json(request, { error: error instanceof Error ? error.message : 'S&S payment profiles could not be loaded' }, 502);
    }
  }

  if (payload.action === 'get_vendor_order_submission_readiness') {
    if (!payload.draft_id) return json(request, { error: 'Vendor order draft ID is required' }, 400);
    const [{ data: draft, error: draftError }, { data: settings, error: settingsError }] = await Promise.all([
      userClient.from('vendor_order_drafts')
        .select('id,payment_status,workflow_status,vendor_status,validation_passed,ss_api_connected,items,shipping_address,cost_refreshed_at,cost_override_reason,vendor_order_number,ss_submission_state,ss_order_number,external_vendor_order_number,ss_guid,is_sample')
        .eq('id', payload.draft_id).maybeSingle(),
      userClient.from('integration_settings').select('ss_live_submission_enabled,ss_default_payment_profile_id,ss_payment_profile_email').eq('id', true).maybeSingle(),
    ]);
    if (draftError || !draft) return json(request, { error: 'S&S vendor order draft not found' }, 404);
    if (settingsError) return json(request, { error: 'Unable to load S&S live controls' }, 500);

    const items = Array.isArray(draft.items) ? draft.items as Array<Record<string, unknown>> : [];
    const address = draft.shipping_address as Record<string, unknown> || {};
    const paymentReady = draft.payment_status === 'paid';
    const reviewReady = ['vendor_order_reviewed', 'ready_to_submit_to_ss'].includes(draft.workflow_status)
      || draft.vendor_status === 'ready_to_order';
    const statusReady = draft.workflow_status === 'ready_to_submit_to_ss' && draft.vendor_status === 'ready_to_order';
    const payloadReady = draft.validation_passed === true && draft.ss_api_connected === true;
    const skuReady = items.length > 0 && items.every((item) => Boolean(textValue(item.sku)) && Number(item.quantity) > 0);
    const shippingReady = Boolean(textValue(address.street ?? address.line1 ?? address.address1)
      && textValue(address.city) && textValue(address.state) && textValue(address.zip ?? address.postal_code));
    const costReady = items.length > 0 && (items.every((item) => Number(item.garment_cost) > 0)
      || Boolean(textValue(draft.cost_override_reason)));
    const liveReady = settings?.ss_live_submission_enabled === true;
    const localDuplicate = draft.ss_submission_state === 'submitted'
      || Boolean(textValue(draft.ss_order_number) || textValue(draft.external_vendor_order_number) || textValue(draft.ss_guid));

    let inventoryReady = false;
    let inventoryReason = 'Current S&S inventory has not been verified.';
    let duplicateReady = !localDuplicate;
    let duplicateReason = localDuplicate ? 'An S&S order number or GUID is already stored for this draft.' : 'No local S&S order confirmation exists.';
    let paymentProfileReady = false;
    let paymentProfileReason = 'No S&S PaymentProfile is selected.';
    if (!accountNumber || !apiKey) {
      inventoryReason = 'S&S credentials are not configured.';
      duplicateReady = false;
      duplicateReason = 'S&S duplicate-order lookup could not run because credentials are missing.';
    } else if (skuReady) {
      const authHeader = `Basic ${btoa(`${accountNumber}:${apiKey}`)}`;
      try {
        const profileId = integerValue(settings?.ss_default_payment_profile_id);
        const profileEmail = textValue(settings?.ss_payment_profile_email);
        if (profileId && profileEmail) {
          const profiles = await loadSsPaymentProfiles(authHeader, profileEmail);
          paymentProfileReady = profiles.some((profile) => profile.profile_id === profileId);
          paymentProfileReason = paymentProfileReady
            ? `S&S PaymentProfile ${profileId} is available.`
            : profiles.length
              ? 'The selected S&S PaymentProfile is no longer available.'
              : 'Add or activate a payment method in your S&S Activewear account before submitting orders.';
        }
        const skuList = [...new Set(items.map((item) => String(item.sku).trim()))];
        const inventoryUrl = new URL(`https://api.ssactivewear.com/v2/products/${skuList.map(encodeURIComponent).join(',')}`);
        inventoryUrl.searchParams.set('fields', 'Sku,ColorName,SizeName,Qty,Warehouses');
        inventoryUrl.searchParams.set('mediatype', 'json');
        const inventoryResponse = await fetch(inventoryUrl, {
          method: 'GET', headers: { Authorization: authHeader, Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
        });
        if (inventoryResponse.ok) {
          const result = await inventoryResponse.json();
          const rows = Array.isArray(result) ? result as Array<Record<string, unknown>> : [];
          const failed = items.find((item) => {
            const row = rows.find((candidate) => String(candidate.sku ?? candidate.Sku ?? '').trim().toLowerCase()
              === String(item.sku).trim().toLowerCase());
            if (!row) return true;
            return String(row.colorName ?? row.ColorName ?? '').trim().toLowerCase() !== String(item.color || '').trim().toLowerCase()
              || String(row.sizeName ?? row.SizeName ?? '').trim().toLowerCase() !== String(item.size || '').trim().toLowerCase()
              || inventoryQuantity(row) < Number(item.quantity);
          });
          inventoryReady = !failed;
          inventoryReason = failed
            ? `SKU ${String(failed.sku || '').trim()} is unavailable, mismatched, or lacks requested inventory.`
            : `All ${items.length} S&S SKU line(s) have current inventory.`;
        } else inventoryReason = 'Current S&S inventory could not be loaded.';

        if (!localDuplicate && textValue(draft.vendor_order_number)) {
          const orderUrl = new URL(`https://api.ssactivewear.com/v2/orders/PO,${encodeURIComponent(String(draft.vendor_order_number))}`);
          orderUrl.searchParams.set('mediatype', 'json');
          const orderResponse = await fetch(orderUrl, {
            method: 'GET', headers: { Authorization: authHeader, Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
          });
          if (orderResponse.ok) {
            const result = await orderResponse.json().catch(() => []);
            const rows = Array.isArray(result) ? result : [result];
            const existing = rows.find((entry) => entry && typeof entry === 'object'
              && textValue((entry as Record<string, unknown>).orderNumber)
              && String((entry as Record<string, unknown>).poNumber || '').trim().toLowerCase()
                === String(draft.vendor_order_number).trim().toLowerCase());
            duplicateReady = !existing;
            duplicateReason = existing ? 'S&S already has an order for this draft PO.' : 'No existing S&S order was found for this PO.';
          } else if (orderResponse.status === 404) {
            duplicateReady = true;
            duplicateReason = 'No existing S&S order was found for this PO.';
          } else {
            duplicateReady = false;
            duplicateReason = 'S&S duplicate-order lookup could not be completed.';
          }
        }
      } catch {
        inventoryReason = 'Current S&S inventory check could not connect.';
        duplicateReady = false;
        duplicateReason = 'S&S duplicate-order lookup could not connect.';
        paymentProfileReason = 'S&S PaymentProfile availability could not be verified.';
      }
    } else inventoryReason = 'A valid S&S SKU and quantity are required before inventory can be checked.';

    const gates = [
      { key: 'payment', label: 'Payment confirmed', ready: paymentReady, value: draft.payment_status, reason: paymentReady ? 'Payment status is paid.' : `Payment status is ${draft.payment_status || 'missing'}.` },
      { key: 'review', label: 'Vendor draft reviewed', ready: reviewReady, value: draft.workflow_status, reason: reviewReady ? 'Vendor review is complete.' : 'Mark the vendor draft reviewed.' },
      { key: 'status', label: 'Draft status', ready: statusReady, value: `${draft.workflow_status} / ${draft.vendor_status}`, reason: statusReady ? 'Draft is ready to submit to S&S.' : 'Draft must be reviewed and marked ready to submit.' },
      { key: 'payload', label: 'S&S payload validation', ready: payloadReady, value: String(draft.validation_passed), reason: payloadReady ? 'S&S payload validation passed.' : 'Payload validation has not passed. Run Test S&S Payload.' },
      { key: 'inventory', label: 'Inventory check', ready: inventoryReady, value: draft.cost_refreshed_at, reason: inventoryReason },
      { key: 'sku', label: 'SKU validation', ready: skuReady, value: items.map((item) => item.sku).filter(Boolean).join(', '), reason: skuReady ? `Validated SKU fields: ${items.map((item) => item.sku).join(', ')}.` : 'Every line requires a valid S&S SKU and quantity.' },
      { key: 'shipping', label: 'Shipping address', ready: shippingReady, value: shippingReady ? 'complete' : 'incomplete', reason: shippingReady ? 'Shipping street, city, state, and ZIP are present.' : 'Shipping address validation failed.' },
      { key: 'cost', label: 'Vendor cost', ready: costReady, value: items.map((item) => item.garment_cost).join(', '), reason: costReady ? 'S&S garment cost is loaded.' : 'Vendor cost is missing. Refresh S&S Cost & Inventory.' },
      { key: 'duplicate', label: 'Duplicate order check', ready: duplicateReady, value: draft.vendor_order_number, reason: duplicateReason },
      { key: 'payment_profile', label: 'S&S Payment Profile', ready: paymentProfileReady, value: settings?.ss_default_payment_profile_id ? `Profile ${settings.ss_default_payment_profile_id}` : null, reason: paymentProfileReason },
      { key: 'live', label: 'S&S live control', ready: liveReady, value: String(settings?.ss_live_submission_enabled), reason: liveReady ? 'S&S live submission control is enabled.' : 'Enable the S&S live submission control.' },
    ];
    return json(request, { ready: gates.every((gate) => gate.ready) && !draft.is_sample, gates, checked_at: new Date().toISOString(), submitted: false });
  }

  if (payload.action === 'refresh_vendor_order_status') {
    if (!payload.draft_id) return json(request, { error: 'Vendor order draft ID is required' }, 400);
    if (!accountNumber || !apiKey) return json(request, { error: 'S&S credentials are not configured' }, 503);
    const { data: draft, error: draftError } = await userClient.from('vendor_order_drafts')
      .select('id,vendor_order_number,ss_order_number,external_vendor_order_number')
      .eq('id', payload.draft_id).maybeSingle();
    if (draftError || !draft) return json(request, { error: 'S&S vendor order draft not found' }, 404);

    const knownIdentifier = textValue(draft.ss_order_number)
      || textValue(draft.external_vendor_order_number);
    const poNumber = textValue(draft.vendor_order_number);
    const identifier = knownIdentifier || (poNumber ? `PO,${poNumber}` : null);
    if (!identifier) return json(request, { error: 'This draft has no S&S order identifier or PO number' }, 409);

    try {
      const url = new URL(`https://api.ssactivewear.com/v2/orders/${encodeURIComponent(identifier)}`);
      url.searchParams.set('mediatype', 'json');
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Basic ${btoa(`${accountNumber}:${apiKey}`)}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const safeMessage = response.status === 404
          ? 'No S&S order was found for this draft PO. No retry was attempted.'
          : safeSsError(result, 'S&S order status could not be retrieved');
        return json(request, { error: safeMessage, found: false, submitted: false, upstream_status: response.status }, response.status === 404 ? 404 : 502);
      }
      const rows = (Array.isArray(result) ? result : [result])
        .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'));
      const match = rows.find((entry) => {
        if (knownIdentifier) {
          return [entry.orderNumber, entry.guid].some((value) => String(value || '').trim().toLowerCase() === knownIdentifier.toLowerCase());
        }
        return String(entry.poNumber || '').trim().toLowerCase() === String(poNumber).toLowerCase();
      });
      const orderNumber = textValue(match?.orderNumber);
      if (!match || !orderNumber) {
        return json(request, {
          error: 'No S&S order was found for this draft PO. No retry was attempted.',
          found: false,
          submitted: false,
        }, 404);
      }
      const confirmation = {
        order_number: orderNumber,
        guid: textValue(match.guid),
        po_number: textValue(match.poNumber),
        warehouse: textValue(match.warehouseAbbr),
        status: textValue(match.orderStatus),
        order_date: textValue(match.orderDate),
        expected_delivery_date: textValue(match.expectedDeliveryDate),
        tracking_number: textValue(match.trackingNumber),
      };
      const { data: saved, error: saveError } = await userClient.rpc('record_ss_order_confirmation', {
        p_draft_id: payload.draft_id,
        p_confirmation: confirmation,
      });
      if (saveError || !saved) {
        console.error('Unable to store S&S order confirmation', saveError?.message);
        return json(request, { error: 'S&S returned an order, but its confirmation could not be stored', found: true, submitted: true }, 500);
      }
      return json(request, { found: true, submitted: true, confirmation, draft: saved });
    } catch (error) {
      console.error('Read-only S&S order status lookup failed', error instanceof Error ? error.message : 'unknown error');
      return json(request, { error: 'S&S order status could not be retrieved. No retry was attempted.', found: false, submitted: false }, 502);
    }
  }

  if (payload.action === 'check_blank_fulfillment_inventory'
    || payload.action === 'create_blank_fulfillment_draft') {
    if (!payload.order_id) return json(request, { error: 'Customer order ID is required' }, 400);
    const { data: order, error: orderError } = await userClient.from('orders')
      .select('id,payment_status,total_amount,amount_paid,balance_due,shipping_address,order_items,artwork_file_url,artwork_link,print_method,print_placement,what_to_print')
      .eq('id', payload.order_id).maybeSingle();
    if (orderError || !order) return json(request, { error: 'Customer order not found' }, 404);
    if (order.payment_status !== 'paid'
      || Number(order.balance_due ?? (Number(order.total_amount) - Number(order.amount_paid))) > 0
      || Number(order.amount_paid) < Number(order.total_amount)) {
      return json(request, { error: 'Payment must be confirmed with no balance due' }, 400);
    }
    const address = order.shipping_address || {};
    if (!(address.street || address.line1 || address.address1)
      || !address.city || !address.state || !(address.zip || address.postal_code)) {
      return json(request, { error: 'A complete shipping address is required' }, 400);
    }
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    if (!items.length || order.artwork_file_url || order.artwork_link || order.print_method
      || (Array.isArray(order.print_placement) ? order.print_placement.length > 0 : Boolean(order.print_placement))
      || order.what_to_print || items.some((item) =>
      !item.sku || !item.product_name || !item.color || !item.size
      || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1
      || item.purchase_mode === 'customized' || item.is_customized === true
      || item.artwork_file_url || item.decoration_method || item.print_method
      || (Array.isArray(item.print_placement) ? item.print_placement.length > 0 : Boolean(item.print_placement))
    )) return json(request, { error: 'Blank garment SKU, variant, quantity, and no-print validation failed' }, 400);
    if (!accountNumber || !apiKey) return json(request, { error: 'S&S inventory connection is not configured' }, 503);

    try {
      const skuList = [...new Set(items.map((item) => String(item.sku).trim()))];
      const url = new URL(`https://api.ssactivewear.com/v2/products/${skuList.map(encodeURIComponent).join(',')}`);
      url.searchParams.set('fields', 'Sku,ColorName,SizeName,Qty,Warehouses');
      url.searchParams.set('mediatype', 'json');
      const response = await fetch(url, {
        headers: { Authorization: `Basic ${btoa(`${accountNumber}:${apiKey}`)}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return json(request, { error: 'Current S&S inventory could not be confirmed' }, 502);
      const body = await response.json();
      const rows = Array.isArray(body) ? body as Array<Record<string, unknown>> : [];
      const checks = items.map((item) => {
        const row = rows.find((candidate) =>
          String(candidate.sku ?? candidate.Sku ?? '').trim().toLowerCase() === String(item.sku).trim().toLowerCase());
        const available = row ? inventoryQuantity(row) : 0;
        const colorMatches = Boolean(row) && String(row?.colorName ?? row?.ColorName ?? '').trim().toLowerCase()
          === String(item.color).trim().toLowerCase();
        const sizeMatches = Boolean(row) && String(row?.sizeName ?? row?.SizeName ?? '').trim().toLowerCase()
          === String(item.size).trim().toLowerCase();
        const valid = Boolean(row) && colorMatches && sizeMatches && available >= Number(item.quantity);
        return { sku: item.sku, requested_quantity: Number(item.quantity), available_quantity: available,
          valid, reason: !row ? 'SKU not found' : !colorMatches || !sizeMatches ? 'Variant mismatch' : 'Insufficient inventory' };
      });
      if (payload.action === 'check_blank_fulfillment_inventory') {
        return json(request, { valid: checks.every((check) => check.valid), items: checks,
          checked_at: new Date().toISOString(), submitted: false });
      }
      if (checks.some((check) => !check.valid)) {
        return json(request, { error: 'Current S&S inventory or variant could not be confirmed', items: checks }, 409);
      }
      const { data: draft, error: draftError } = await userClient.rpc('create_blank_ss_fulfillment_draft',
        { p_order_id: payload.order_id });
      if (draftError) return json(request, { error: draftError.message || 'Could not create the private draft' }, 400);
      return json(request, { ...draft, submitted: false });
    } catch (error) {
      console.error('Read-only blank fulfillment inventory check failed', error instanceof Error ? error.name : 'unknown');
      return json(request, { error: 'S&S inventory check could not connect. Try again before creating a draft.' }, 502);
    }
  }

  if (payload.action === 'get_admin_status') {
    const { data: settings, error: settingsError } = await userClient
      .from('integration_settings')
      .select('ss_live_submission_enabled,zerotouch_live_submission_enabled,ss_api_connected,last_ss_connection_at,last_ss_connection_message,last_ss_submission_at,last_ss_submission_status,last_ss_submission_draft_id,last_ss_submission_order_number,last_ss_submission_error,ss_default_payment_profile_id,ss_payment_profile_email,ss_payment_profile_verified_at')
      .eq('id', true)
      .maybeSingle();
    if (settingsError) {
      console.error('Unable to load integration controls', settingsError.message);
      return json(request, { error: 'Unable to load integration controls' }, 500);
    }
    return json(request, {
      ...settings,
      ss_credentials_configured: Boolean(accountNumber && apiKey),
    });
  }

  if (payload.action === 'set_live_controls') {
    const ssLiveEnabled = payload.ss_live_submission_enabled === true;
    const zeroTouchLiveEnabled = payload.zerotouch_live_submission_enabled === true;
    if (ssLiveEnabled && (!accountNumber || !apiKey)) {
      return json(request, { error: 'S&S credentials must be configured before live submission can be enabled' }, 409);
    }
    const { data: settings, error: settingsError } = await userClient.rpc(
      'set_live_integration_controls',
      {
        p_ss_live_enabled: ssLiveEnabled,
        p_zerotouch_live_enabled: zeroTouchLiveEnabled,
      },
    );
    if (settingsError || !settings) {
      console.error('Unable to update live integration controls', settingsError?.message);
      return json(request, { error: 'Unable to update live integration controls' }, 500);
    }
    return json(request, {
      ss_live_submission_enabled: settings.ss_live_submission_enabled,
      zerotouch_live_submission_enabled: settings.zerotouch_live_submission_enabled,
      ss_api_connected: settings.ss_api_connected,
      ss_credentials_configured: Boolean(accountNumber && apiKey),
      updated_at: settings.updated_at,
    });
  }

  if (payload.action === 'submit_vendor_order' || payload.action === 'preview_vendor_order_submission') {
    if (!payload.draft_id) {
      return json(request, { error: 'Vendor order draft ID is required' }, 400);
    }
    if (!accountNumber || !apiKey) {
      return json(request, { error: 'S&S credentials are not configured' }, 503);
    }

    const dryRun = payload.action === 'preview_vendor_order_submission';
    const { data: previewResult, error: previewError } = await userClient.rpc(
      'preview_live_ss_submission',
      { p_draft_id: payload.draft_id },
    );
    if (previewError || !previewResult) {
      console.warn('Live S&S submission preflight rejected the request', previewError?.message);
      return json(request, { error: previewError?.message || 'Live S&S submission is not allowed' }, 409);
    }

    const failSubmission = async (message: string, responseSummary: unknown = null) => {
      const safeMessage = message.slice(0, 1000);
      const { error } = await userClient.rpc('fail_live_ss_submission_v2', {
        p_draft_id: payload.draft_id,
        p_error: safeMessage,
        p_response_summary: responseSummary,
      });
      if (error) console.error('Unable to record failed S&S submission state', error.message);
      return safeMessage;
    };

    try {
      const vendorPayload = previewResult.payload as Record<string, unknown>;
      const items = Array.isArray(vendorPayload.items)
        ? vendorPayload.items as Array<Record<string, unknown>>
        : [];
      const skuIdentifiers = [...new Set(items.map((item) => textValue(item.sku)).filter(Boolean))] as string[];
      if (!skuIdentifiers.length) {
        const message = await failSubmission('No valid S&S SKU identifiers were available');
        return json(request, { error: message }, 409);
      }

      const inventoryUrl = new URL(`https://api.ssactivewear.com/v2/products/${skuIdentifiers.map(encodeURIComponent).join(',')}`);
      inventoryUrl.searchParams.set('fields', 'Sku,ColorName,SizeName,Qty,Warehouses');
      inventoryUrl.searchParams.set('mediatype', 'json');
      const authHeader = `Basic ${btoa(`${accountNumber}:${apiKey}`)}`;
      const { data: settings, error: settingsError } = await userClient.from('integration_settings')
        .select('ss_default_payment_profile_id,ss_payment_profile_email').eq('id', true).maybeSingle();
      if (settingsError) return json(request, { error: 'Unable to load the default S&S PaymentProfile' }, 500);
      const paymentProfileId = integerValue(settings?.ss_default_payment_profile_id);
      const paymentProfileEmail = textValue(settings?.ss_payment_profile_email);
      if (!paymentProfileId || !paymentProfileEmail) {
        return json(request, { error: 'Select a default S&S PaymentProfile in S&S Vendor Settings before submitting.' }, 409);
      }
      const paymentProfiles = await loadSsPaymentProfiles(authHeader, paymentProfileEmail);
      if (!paymentProfiles.some((profile) => profile.profile_id === paymentProfileId)) {
        return json(request, {
          error: paymentProfiles.length
            ? 'The selected S&S PaymentProfile is no longer available.'
            : 'Add or activate a payment method in your S&S Activewear account before submitting orders.',
        }, 409);
      }
      const poNumber = textValue(vendorPayload.poNumber) || textValue(previewResult.vendor_order_number);
      if (poNumber) {
        const existingUrl = new URL(`https://api.ssactivewear.com/v2/orders/PO,${encodeURIComponent(poNumber)}`);
        existingUrl.searchParams.set('mediatype', 'json');
        const existingResponse = await fetch(existingUrl, {
          method: 'GET', headers: { Authorization: authHeader, Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        if (existingResponse.ok) {
          const existingResult = await existingResponse.json().catch(() => []);
          const existingOrders = (Array.isArray(existingResult) ? existingResult : [existingResult])
            .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'));
          const existing = existingOrders.find((entry) => textValue(entry.orderNumber)
            && String(entry.poNumber || '').trim().toLowerCase() === poNumber.toLowerCase());
          if (existing) {
            const confirmation = {
              order_number: textValue(existing.orderNumber), guid: textValue(existing.guid),
              po_number: textValue(existing.poNumber), warehouse: textValue(existing.warehouseAbbr),
              status: textValue(existing.orderStatus), order_date: textValue(existing.orderDate),
              expected_delivery_date: textValue(existing.expectedDeliveryDate),
              tracking_number: textValue(existing.trackingNumber), source: 'pre_submit_reconciliation',
            };
            if (!dryRun) {
              const { error: reconcileError } = await userClient.rpc('record_ss_order_confirmation', {
                p_draft_id: payload.draft_id, p_confirmation: confirmation,
              });
              if (reconcileError) return json(request, { error: 'An existing S&S order was found but could not be reconciled', submitted: false }, 500);
            }
            return json(request, { submitted: false, duplicate_blocked: true, existing_order: confirmation, dry_run: dryRun });
          }
        } else if (existingResponse.status !== 404) {
          return json(request, { error: 'S&S duplicate-order preflight could not be completed. No order was submitted.' }, 502);
        }
      }
      const inventoryResponse = await fetch(inventoryUrl, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!inventoryResponse.ok) {
        const message = await failSubmission('Unable to confirm current S&S inventory');
        return json(request, { error: message }, 502);
      }
      const inventoryResult = await inventoryResponse.json();
      const inventoryRows = Array.isArray(inventoryResult)
        ? inventoryResult as Array<Record<string, unknown>>
        : [];

      for (const item of items) {
        const sku = String(item.sku || '').trim().toLowerCase();
        const color = String(item.color || '').trim().toLowerCase();
        const size = String(item.size || '').trim().toLowerCase();
        const quantity = Math.trunc(Number(item.quantity) || 0);
        const product = inventoryRows.find((row) => String(row.sku ?? row.Sku ?? '').trim().toLowerCase() === sku);
        if (!product) {
          const message = await failSubmission(`S&S SKU ${String(item.sku || '').trim()} is invalid or unavailable`);
          return json(request, { error: message }, 409);
        }
        const currentColor = String(product.colorName ?? product.ColorName ?? '').trim().toLowerCase();
        const currentSize = String(product.sizeName ?? product.SizeName ?? '').trim().toLowerCase();
        if (currentColor !== color || currentSize !== size) {
          const message = await failSubmission(`S&S SKU ${String(item.sku || '').trim()} does not match the selected color and size`);
          return json(request, { error: message }, 409);
        }
        if (quantity <= 0 || inventoryQuantity(product) < quantity) {
          const message = await failSubmission(`S&S SKU ${String(item.sku || '').trim()} does not have enough current stock`);
          return json(request, { error: message }, 409);
        }
      }

      const requestBody = buildSsOrderRequest(vendorPayload, payload.draft_id, {
        email: paymentProfileEmail,
        profileID: paymentProfileId,
      });
      const schemaValidation = validateSsOrderRequest(requestBody);
      if (!schemaValidation.valid) {
        return json(request, {
          error: schemaValidation.errors.map((entry) => `${entry.field}: ${entry.message}`).join('; '),
          dry_run: dryRun,
          submitted: false,
          schema_validation: schemaValidation,
        }, 409);
      }

      if (dryRun) {
        const { data: transitionCheck, error: transitionError } = await userClient.rpc(
          'verify_ss_live_transition_guard', { p_draft_id: payload.draft_id },
        );
        if (transitionError || transitionCheck?.ready !== true) {
          return json(request, {
            error: transitionCheck?.reason || transitionError?.message || 'Backend live-submission transition is blocked',
            dry_run: true, submitted: false, would_post: false,
          }, 409);
        }
        return json(request, {
          dry_run: true, submitted: false, would_post: true,
          endpoint: 'https://api.ssactivewear.com/v2/orders/', method: 'POST',
          checks: { admin: true, payment: true, reviewed: true, ready: true, cost_loaded: true,
            duplicate_order: false, inventory: true, shipping_address: true, payment_profile: true, backend_transition: true },
          schema_validation: schemaValidation,
          submission_payload: requestBody,
        });
      }

      const { data: authorizationResult, error: authorizationError } = await userClient.rpc(
        'begin_live_ss_submission', { p_draft_id: payload.draft_id },
      );
      if (authorizationError || !authorizationResult) {
        return json(request, { error: authorizationError?.message || 'Live S&S submission authorization failed' }, 409);
      }

      const orderResponse = await fetch('https://api.ssactivewear.com/v2/orders/', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      });
      const orderResult = await orderResponse.json().catch(() => null);
      if (!orderResponse.ok) {
        const errorDetails = safeSsErrorDetails(orderResult, 'S&S rejected the vendor order');
        const requestId = textValue(orderResponse.headers.get('x-request-id'))
          || textValue(orderResponse.headers.get('request-id'))
          || textValue(orderResponse.headers.get('x-correlation-id'));
        const safeFailure = {
          upstream_status: orderResponse.status,
          error: errorDetails.message,
          response_message: errorDetails.response_message,
          response_code: errorDetails.response_code,
          field_errors: errorDetails.field_errors,
          request_id: requestId,
          submission_timestamp: new Date().toISOString(),
          draft_id: payload.draft_id,
        };
        const message = await failSubmission(safeFailure.error, safeFailure);
        return json(request, {
          error: message,
          upstream_status: orderResponse.status,
          field_errors: errorDetails.field_errors,
          request_id: requestId,
        }, 502);
      }

      const orders = (Array.isArray(orderResult) ? orderResult : [orderResult])
        .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'));
      const orderNumbers = orders.map((entry) => textValue(entry.orderNumber)).filter(Boolean) as string[];
      if (!orderNumbers.length) {
        const message = await failSubmission('S&S accepted the request but did not return an order number; manual review is required');
        return json(request, { error: message }, 502);
      }
      const first = orders[0];
      const confirmation = {
        order_number: orderNumbers.join(', '), guid: textValue(first.guid),
        po_number: textValue(first.poNumber) || poNumber, warehouse: textValue(first.warehouseAbbr),
        status: textValue(first.orderStatus), order_date: textValue(first.orderDate),
        expected_delivery_date: textValue(first.expectedDeliveryDate),
        tracking_number: textValue(first.trackingNumber),
        orders: orders.map((entry) => ({ order_number: textValue(entry.orderNumber), guid: textValue(entry.guid),
          warehouse: textValue(entry.warehouseAbbr), status: textValue(entry.orderStatus) })),
      };
      const { data: completedDraft, error: completionError } = await userClient.rpc(
        'record_ss_order_confirmation',
        { p_draft_id: payload.draft_id, p_confirmation: confirmation },
      );
      if (completionError || !completedDraft) {
        console.error('S&S returned an order but the local confirmation audit failed', completionError?.message);
        return json(request, {
          error: 'S&S returned an order number, but local confirmation requires immediate manual review',
          submitted: true,
          order_numbers: orderNumbers,
        }, 500);
      }
      return json(request, {
        submitted: true,
        order_numbers: orderNumbers,
        submitted_at: completedDraft.ss_submitted_at,
        submission_state: completedDraft.ss_submission_state,
      });
    } catch (error) {
      console.error('Live S&S order request failed without logging request data', error instanceof Error ? error.message : 'unknown error');
      const message = await failSubmission('Unable to complete the S&S order request');
      return json(request, { error: message }, 502);
    }
  }

  if (payload.action === 'refresh_vendor_order_cost_inventory') {
    if (!payload.draft_id) return json(request, { error: 'Vendor order draft ID is required' }, 400);
    if (!accountNumber || !apiKey) return json(request, { error: 'S&S cost connection is not configured' }, 503);
    const { data: draft, error: draftError } = await userClient.from('vendor_order_drafts')
      .select('id,items,vendor_shipping_estimate,vendor_other_fees')
      .eq('id', payload.draft_id).maybeSingle();
    if (draftError || !draft) return json(request, { error: 'S&S vendor order draft not found' }, 404);
    const items = Array.isArray(draft.items) ? draft.items as Array<Record<string, unknown>> : [];
    if (!items.length || items.some((item) => !textValue(item.sku) || Number(item.quantity) <= 0)) {
      return json(request, { error: 'Every draft line requires an S&S SKU and quantity' }, 400);
    }
    try {
      const skuList = [...new Set(items.map((item) => String(item.sku).trim()))];
      const url = new URL(`https://api.ssactivewear.com/v2/products/${skuList.map(encodeURIComponent).join(',')}`);
      url.searchParams.set('fields', 'Sku,StyleID,ColorName,SizeName,Qty,Warehouses,CustomerPrice,SalePrice,SaleExpiration,PiecePrice');
      url.searchParams.set('mediatype', 'json');
      const response = await fetch(url, {
        headers: { Authorization: `Basic ${btoa(`${accountNumber}:${apiKey}`)}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return json(request, { error: 'Current S&S cost and inventory could not be loaded' }, 502);
      const result = await response.json();
      const rows = Array.isArray(result) ? result as Array<Record<string, unknown>> : [];
      const checkedAt = new Date().toISOString();
      const refreshedItems = items.map((item) => {
        const sku = String(item.sku).trim();
        const row = rows.find((candidate) => String(candidate.sku ?? candidate.Sku ?? '').trim().toLowerCase() === sku.toLowerCase());
        const available = row ? inventoryQuantity(row) : 0;
        const requested = Math.trunc(Number(item.quantity) || 0);
        const colorMatches = Boolean(row) && String(row?.colorName ?? row?.ColorName ?? '').trim().toLowerCase()
          === String(item.color || '').trim().toLowerCase();
        const sizeMatches = Boolean(row) && String(row?.sizeName ?? row?.SizeName ?? '').trim().toLowerCase()
          === String(item.size || '').trim().toLowerCase();
        const customerPrice = numberValue(row?.customerPrice ?? row?.CustomerPrice);
        const salePrice = numberValue(row?.salePrice ?? row?.SalePrice);
        const saleExpiration = textValue(row?.saleExpiration ?? row?.SaleExpiration);
        const saleIsCurrent = Boolean(salePrice && salePrice > 0)
          && (!saleExpiration || new Date(saleExpiration).getTime() >= Date.now());
        const piecePrice = numberValue(row?.piecePrice ?? row?.PiecePrice);
        const cost = customerPrice && customerPrice > 0
          ? customerPrice
          : saleIsCurrent ? salePrice : piecePrice && piecePrice > 0 ? piecePrice : null;
        const inventoryValid = Boolean(row) && colorMatches && sizeMatches && requested > 0 && available >= requested;
        return {
          ...item,
          garment_cost: cost,
          estimated_profit: cost === null ? null : (Number(item.sale_price) - cost) * requested,
          vendor_cost_status: cost === null ? 'not_loaded' : 'loaded',
          vendor_cost_source: customerPrice && customerPrice > 0 ? 'S&S customer price' : saleIsCurrent ? 'S&S current sale price' : 'S&S piece price',
          cost_refreshed_at: checkedAt,
          inventory_available: available,
          inventory_valid: inventoryValid,
          inventory_refreshed_at: checkedAt,
        };
      });
      const failures = refreshedItems.filter((item) => Number(item.garment_cost) <= 0 || !item.inventory_valid);
      if (failures.length) {
        return json(request, {
          error: 'One or more S&S costs or inventory records could not be verified', submitted: false,
          items: refreshedItems.map((item) => ({ sku: item.sku, cost_loaded: Number(item.garment_cost) > 0,
            inventory_valid: item.inventory_valid, available_quantity: item.inventory_available })),
        }, 409);
      }
      const inventory = { valid: true, checked_at: checkedAt, items: refreshedItems.map((item) => ({
        sku: item.sku, requested_quantity: Number(item.quantity), available_quantity: item.inventory_available,
        in_stock: item.inventory_valid,
      })) };
      const { data: updated, error: updateError } = await userClient.rpc('apply_ss_draft_cost_refresh', {
        p_draft_id: payload.draft_id, p_items: refreshedItems, p_inventory: inventory, p_checked_at: checkedAt,
      });
      if (updateError || !updated) {
        console.error('Unable to save S&S cost refresh', updateError?.message);
        return json(request, { error: 'S&S cost loaded but could not be saved to the draft' }, 500);
      }
      return json(request, { submitted: false, checked_at: checkedAt, inventory_check: inventory,
        cost_loaded: true, items: refreshedItems, draft: updated });
    } catch (error) {
      console.error('Read-only S&S cost refresh failed', error instanceof Error ? error.name : 'unknown');
      return json(request, { error: 'S&S cost and inventory refresh could not connect. Try again.' }, 502);
    }
  }

  if (payload.action === 'validate_vendor_order_draft') {
    if (!payload.draft_id) {
      return json(request, { error: 'Vendor order draft ID is required' }, 400);
    }

    const { data: validation, error: validationError } = await userClient.rpc(
      'get_ss_vendor_order_draft_validation',
      { p_draft_id: payload.draft_id },
    );
    if (validationError || !validation) {
      console.error('Vendor order payload validation failed', validationError?.message);
      return json(request, { error: 'Unable to validate the vendor order draft' }, 500);
    }

    const { data: validationDraft, error: validationDraftError } = await userClient
      .from('vendor_order_drafts')
      .select('customer_name')
      .eq('id', payload.draft_id)
      .maybeSingle();
    if (validationDraftError || !validationDraft) {
      console.error('Unable to load vendor draft for dry-run preview', validationDraftError?.message);
      return json(request, { error: 'Unable to prepare the S&S dry-run preview' }, 500);
    }
    const authorizedPayload = {
      ...(validation.payload as Record<string, unknown>),
      customer_name: validationDraft.customer_name,
    };
    const submissionPayload = buildSsOrderRequest(authorizedPayload, payload.draft_id);

    let apiConnected = false;
    let connectionMessage = 'S&S API not connected';
    let rateLimitRemaining: string | null = null;
    let inventoryValid = false;
    let inventoryChecks: Array<Record<string, unknown>> = [];

    if (accountNumber && apiKey) {
      try {
        const response = await fetch('https://api.ssactivewear.com/v2/brands/?mediatype=json', {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        });
        apiConnected = response.ok;
        rateLimitRemaining = response.headers.get('x-rate-limit-remaining');
        connectionMessage = response.ok
          ? 'S&S API connected (read-only test)'
          : 'S&S API not connected';

        if (response.ok && submissionPayload.lines.length) {
          const inventoryUrl = new URL(
            `https://api.ssactivewear.com/v2/products/${submissionPayload.lines.map((line) => encodeURIComponent(line.identifier)).join(',')}`,
          );
          inventoryUrl.searchParams.set('fields', 'Sku,ColorName,SizeName,Qty,Warehouses');
          inventoryUrl.searchParams.set('mediatype', 'json');
          const inventoryResponse = await fetch(inventoryUrl, {
            headers: {
              'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(15000),
          });
          if (inventoryResponse.ok) {
            const inventoryResult = await inventoryResponse.json();
            const inventoryRows = Array.isArray(inventoryResult)
              ? inventoryResult as Array<Record<string, unknown>>
              : [];
            const items = authorizedPayload.items as Array<Record<string, unknown>>;
            inventoryChecks = items.map((item) => {
              const sku = String(item.sku || '').trim();
              const product = inventoryRows.find((row) =>
                String(row.sku ?? row.Sku ?? '').trim().toLowerCase() === sku.toLowerCase()
              );
              const available = product ? inventoryQuantity(product) : 0;
              const requested = Math.trunc(Number(item.quantity) || 0);
              const colorMatches = Boolean(product)
                && String(product?.colorName ?? product?.ColorName ?? '').trim().toLowerCase()
                  === String(item.color || '').trim().toLowerCase();
              const sizeMatches = Boolean(product)
                && String(product?.sizeName ?? product?.SizeName ?? '').trim().toLowerCase()
                  === String(item.size || '').trim().toLowerCase();
              return {
                sku,
                requested_quantity: requested,
                available_quantity: available,
                sku_found: Boolean(product),
                color_matches: colorMatches,
                size_matches: sizeMatches,
                in_stock: requested > 0 && available >= requested,
              };
            });
            inventoryValid = inventoryChecks.length === items.length
              && inventoryChecks.every((check) =>
                check.sku_found && check.color_matches && check.size_matches && check.in_stock
              );
          } else {
            connectionMessage = 'S&S API connected; current SKU inventory preview was unavailable';
          }
        }
      } catch (error) {
        console.error('Read-only S&S vendor order connection test failed', error);
      }
    }

    const result = {
      ...validation,
      api_connected: apiConnected,
      connection_message: connectionMessage,
      test_mode: true,
      submitted: false,
      live_submission_enabled: false,
      safety_message: 'Do Not Submit Live Order Yet',
      rate_limit_remaining: rateLimitRemaining,
      checked_at: new Date().toISOString(),
      dry_run: true,
      submission_payload: submissionPayload,
      credentials: {
        account_number: accountNumber ? 'configured (masked)' : 'not configured',
        api_key: apiKey ? 'configured (masked)' : 'not configured',
      },
      inventory_check: {
        valid: inventoryValid,
        items: inventoryChecks,
        checked_at: new Date().toISOString(),
      },
    };
    const { error: recordError } = await userClient.rpc(
      'record_ss_vendor_order_test_result',
      { p_draft_id: payload.draft_id, p_result: result },
    );
    if (recordError) {
      console.error('Unable to record vendor order test result', recordError.message);
      return json(request, { error: 'Validation ran, but its audit result could not be saved' }, 500);
    }
    await userClient.rpc('record_ss_connection_result', {
      p_connected: apiConnected,
      p_message: connectionMessage,
    });

    return json(request, result);
  }

  if (!accountNumber || !apiKey) {
    return json(request, { error: 'S&S credentials are not configured' }, 503);
  }

  if (payload.action === 'refresh_public_style_content') {
    const { data: products, error: productsError } = await userClient
      .from('products')
      .select('id,name,supplier_sku,brand')
      .eq('product_type', 'physical')
      .ilike('vendor_source', 'S&S Activewear%')
      .not('supplier_sku', 'is', null)
      .limit(1000);
    if (productsError) {
      console.error('Unable to read S&S public product styles', productsError.message);
      return json(request, { error: 'Unable to read S&S product styles' }, 500);
    }

    const normalizedIdentifier = (value: unknown) => String(value || '').trim().toUpperCase();
    const productsByIdentifier = new Map<string, Array<Record<string, unknown>>>();
    for (const product of products || []) {
      const identifier = normalizedIdentifier(product.supplier_sku);
      if (!identifier) continue;
      const brand = normalizedIdentifier(product.brand);
      const keys = brand ? [`${brand}::${identifier}`] : [`*::${identifier}`];
      for (const key of keys) {
        const matches = productsByIdentifier.get(key) || [];
        matches.push(product);
        productsByIdentifier.set(key, matches);
      }
    }

    let allStyles: Array<Record<string, unknown>> = [];
    let apiRequests = 0;
    try {
      const styleUrl = new URL('https://api.ssactivewear.com/v2/styles/');
      styleUrl.searchParams.set(
        'fields',
        'StyleID,PartNumber,BrandName,StyleName,Title,Description,BaseCategory,Categories,StyleImage',
      );
      styleUrl.searchParams.set('mediatype', 'json');
      const styleResponse = await fetch(styleUrl, {
        headers: {
          'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });
      apiRequests += 1;
      if (!styleResponse.ok) {
        console.error('S&S style content lookup failed', styleResponse.status);
        return json(request, { error: 'S&S style content lookup failed' }, 502);
      }
      const fetchedStyles = await styleResponse.json();
      allStyles = Array.isArray(fetchedStyles) ? fetchedStyles : [];
    } catch (error) {
      console.error('S&S public style content lookup failed', error);
      return json(request, { error: 'Unable to retrieve S&S public style content' }, 502);
    }

    const styleRows: Array<Record<string, unknown>> = [];
    const productsByResolvedPartNumber = new Map<string, Array<Record<string, unknown>>>();
    const resolvedStyleIds = new Set<string>();
    for (const style of allStyles) {
      const brand = normalizedIdentifier(style.brandName ?? style.BrandName);
      const styleName = normalizedIdentifier(style.styleName ?? style.StyleName);
      const partNumber = normalizedIdentifier(style.partNumber ?? style.PartNumber);
      const styleId = normalizedIdentifier(style.styleID ?? style.StyleID);
      const matchedProducts = new Map<string, Record<string, unknown>>();

      for (const identifier of [styleName, partNumber]) {
        if (!identifier) continue;
        for (const key of [`${brand}::${identifier}`, `*::${identifier}`]) {
          for (const product of productsByIdentifier.get(key) || []) {
            matchedProducts.set(String(product.id), product);
          }
        }
      }
      if (!matchedProducts.size || !partNumber) continue;

      styleRows.push(style);
      productsByResolvedPartNumber.set(partNumber, [...matchedProducts.values()]);
      if (styleId) resolvedStyleIds.add(styleId);
    }

    const specRows: Array<Record<string, unknown>> = [];
    try {
      const styleIds = [...resolvedStyleIds];
      for (let index = 0; index < styleIds.length; index += 20) {
        const styleIdChunk = styleIds.slice(index, index + 20);
        const specUrl = new URL('https://api.ssactivewear.com/v2/specs/');
        specUrl.searchParams.set('style', styleIdChunk.join(','));
        specUrl.searchParams.set(
          'fields',
          'SpecID,StyleID,PartNumber,BrandName,StyleName,SizeName,SizeOrder,SpecName,Value',
        );
        specUrl.searchParams.set('mediatype', 'json');
        const specResponse = await fetch(specUrl, {
          headers: {
            'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(30000),
        });
        apiRequests += 1;
        if (!specResponse.ok) {
          console.error('S&S style specs lookup failed', specResponse.status);
          return json(request, { error: 'S&S style specs lookup failed' }, 502);
        }
        const fetchedSpecs = await specResponse.json();
        specRows.push(...(Array.isArray(fetchedSpecs) ? fetchedSpecs : []));
      }
    } catch (error) {
      console.error('S&S public style content refresh failed', error);
      return json(request, { error: 'Unable to refresh S&S public style content' }, 502);
    }

    const specsByPartNumber = new Map<string, Array<Record<string, unknown>>>();
    for (const spec of specRows) {
      const partNumber = String(spec.partNumber ?? spec.PartNumber ?? '').trim().toUpperCase();
      if (!partNumber) continue;
      const matches = specsByPartNumber.get(partNumber) || [];
      matches.push({
        size: textValue(spec.sizeName ?? spec.SizeName),
        size_order: textValue(spec.sizeOrder ?? spec.SizeOrder),
        spec_name: textValue(spec.specName ?? spec.SpecName),
        value: textValue(spec.value ?? spec.Value),
      });
      specsByPartNumber.set(partNumber, matches);
    }

    let updatedProducts = 0;
    let productsWithDescription = 0;
    let productsWithSpecs = 0;
    for (const style of styleRows) {
      const partNumber = normalizedIdentifier(style.partNumber ?? style.PartNumber);
      const matchedProducts = productsByResolvedPartNumber.get(partNumber) || [];
      if (!matchedProducts.length) continue;

      const brand = textValue(style.brandName ?? style.BrandName);
      const styleName = textValue(style.styleName ?? style.StyleName);
      const title = textValue(style.title ?? style.Title);
      const lines = importedDescriptionLines(style.description ?? style.Description);
      const description = lines.join('\n');
      const specs = specsByPartNumber.get(partNumber) || [];
      const fabricLine = lines.find((line) =>
        /(cotton|polyester|rayon|spandex|nylon|wool|fleece|fabric)/i.test(line)
      ) || null;
      const weightLine = lines.find((line) =>
        /(\d+(?:\.\d+)?\s*oz\.?(?:\/yd²|\/yd2|\.?)?|\d+\s*gsm)/i.test(line)
      ) || null;
      const fitLine = lines.find((line) =>
        /(fit|unisex|women'?s|men'?s|youth|oversized|relaxed)/i.test(line)
      ) || null;

      for (const product of matchedProducts) {
        const updates = {
          brand,
          style_number: styleName || partNumber,
          name: [brand, styleName, title].filter(Boolean).join(' - '),
          description: description || null,
          fabric_material: fabricLine,
          garment_weight: weightLine,
          fit: fitLine,
          features: lines,
          vendor_specs: specs,
          vendor_data_refreshed_at: new Date().toISOString(),
        };
        const { error: updateError } = await userClient
          .from('products')
          .update(updates)
          .eq('id', product.id);
        if (updateError) {
          console.error('Unable to save imported S&S style content', updateError.message);
          return json(request, { error: 'Unable to save imported S&S style content' }, 500);
        }
        updatedProducts += 1;
        if (description) productsWithDescription += 1;
        if (specs.length) productsWithSpecs += 1;
      }
    }

    return json(request, {
      refreshed: true,
      products_reviewed: products?.length || 0,
      products_updated: updatedProducts,
      products_with_description: productsWithDescription,
      products_with_specs: productsWithSpecs,
      api_requests: apiRequests,
      live_submission_enabled: false,
      ss_order_submitted: false,
      zerotouch_submitted: false,
    });
  }

  if (payload.action === 'sync_brand_products') {
    const brand = canonicalApprovedBrand(payload.brand);
    if (!brand) {
      return json(request, { error: 'Select an approved S&S brand' }, 400);
    }

    const { data: latest, error: latestError } = await userClient
      .from('ss_import_staging')
      .select('import_session_id')
      .eq('row_status', 'pending')
      .eq('brand', brand)
      .like('import_session_id', payload.style_session_id && /^ss-brand-(driduck|comfortcolors|champion|americanapparel|nextlevel|adidas)-[a-zA-Z0-9T-]+$/.test(String(payload.style_session_id)) ? String(payload.style_session_id) : '%')
      .order('created_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) {
      console.error('Unable to locate the current style staging session', latestError.message);
      return json(request, { error: 'Unable to locate the current style staging session' }, 500);
    }
    if (!latest) {
      return json(request, { error: 'Stage the approved styles before syncing SKU details' }, 409);
    }

    const { data: stagedStyles, error: stylesError } = await userClient
      .from('ss_import_staging')
      .select('raw_row_data,style_number')
      .eq('import_session_id', latest.import_session_id)
      .eq('brand', brand)
      .eq('row_status', 'pending');
    if (stylesError) {
      console.error('Unable to read staged S&S styles', stylesError.message);
      return json(request, { error: 'Unable to read the staged styles for this brand' }, 500);
    }

    const stylesById = new Map<number, { partNumber: string | null; styleName: string | null }>();
    for (const stagedStyle of stagedStyles || []) {
      try {
        const raw = JSON.parse(stagedStyle.raw_row_data || '{}');
        const styleId = integerValue(raw.styleID);
        if (styleId === null) continue;
        stylesById.set(styleId, {
          partNumber: textValue(raw.partNumber) || textValue(stagedStyle.style_number),
          styleName: textValue(raw.styleName),
        });
      } catch {
        // Invalid legacy staging data is skipped and reported in the run totals.
      }
    }
    const styleIds = [...stylesById.keys()];
    if (styleIds.length === 0) {
      return json(request, { error: `No valid staged style IDs were found for ${brand}` }, 409);
    }

    const runStartedAt = new Date().toISOString();
    const { data: syncRun, error: runError } = await userClient
      .from('ss_sku_sync_runs')
      .upsert({
        style_session_id: latest.import_session_id,
        brand,
        status: 'running',
        started_at: runStartedAt,
        completed_at: null,
        owner_user_id: actorUserId,
        created_by_email: actorEmail,
        total_styles: styleIds.length,
        total_skus: 0,
        skipped_rows: 0,
        api_requests: 0,
        rate_limit_remaining: null,
        error_message: null,
      }, { onConflict: 'style_session_id,brand' })
      .select('id')
      .single();
    if (runError || !syncRun) {
      console.error('Unable to start the SKU sync run', runError?.message);
      return json(request, { error: 'Unable to start the private SKU sync' }, 500);
    }

    const failRun = async (message: string, apiRequests: number, rateLimitRemaining: number | null) => {
      await userClient
        .from('ss_sku_sync_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          api_requests: apiRequests,
          rate_limit_remaining: rateLimitRemaining,
          error_message: message,
        })
        .eq('id', syncRun.id);
    };

    let apiRequests = 0;
    let rateLimitRemaining: number | null = null;
    let skippedRows = Math.max(0, (stagedStyles || []).length - styleIds.length);
    let upstreamProducts = 0;
    const productsBySku = new Map<string, Record<string, unknown>>();

    try {
      for (let index = 0; index < styleIds.length; index += 20) {
        const url = new URL('https://api.ssactivewear.com/v2/products/');
        url.searchParams.set('styleid', styleIds.slice(index, index + 20).join(','));
        url.searchParams.set('fields', productFields);
        url.searchParams.set('mediatype', 'json');

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(30000),
        });
        apiRequests += 1;
        rateLimitRemaining = integerValue(response.headers.get('x-rate-limit-remaining'));

        if (!response.ok) {
          const message = response.status === 429
            ? 'S&S rate limit reached. Wait one minute and retry this brand.'
            : `S&S product lookup failed for ${brand}`;
          console.error(`${message} (status ${response.status})`);
          await failRun(message, apiRequests, rateLimitRemaining);
          return json(request, { error: message, upstream_status: response.status }, 502);
        }

        const products = await response.json();
        upstreamProducts += Array.isArray(products) ? products.length : 0;
        for (const product of Array.isArray(products) ? products : []) {
          const sku = textValue(product.sku ?? product.Sku);
          const styleId = integerValue(product.styleID ?? product.StyleID);
          const responseBrand = canonicalApprovedBrand(product.brandName ?? product.BrandName);
          if (
            !sku ||
            styleId === null ||
            !stylesById.has(styleId) ||
            (responseBrand && responseBrand !== brand)
          ) {
            skippedRows += 1;
            continue;
          }
          productsBySku.set(sku, product);
        }
      }

      if (productsBySku.size === 0) {
        const message = upstreamProducts === 0
          ? `S&S returned no SKU rows for the staged ${brand} styles`
          : `S&S returned ${upstreamProducts} product rows, but none contained usable staged SKU identifiers`;
        console.error(message);
        await failRun(message, apiRequests, rateLimitRemaining);
        return json(request, { error: message }, 502);
      }

      const fetchedAt = new Date().toISOString();
      const rows = [...productsBySku.entries()].map(([sku, product]) => {
        const styleId = integerValue(product.styleID)!;
        const stagedStyle = stylesById.get(styleId);
        return {
          style_session_id: latest.import_session_id,
          sync_run_id: syncRun.id,
          owner_user_id: actorUserId,
          created_by_email: actorEmail,
          fetched_at: fetchedAt,
          brand,
          style_id: styleId,
          part_number: stagedStyle?.partNumber || null,
          style_name: textValue(product.styleName) || stagedStyle?.styleName || null,
          sku_id: integerValue(product.skuID ?? product.skuID_Master),
          sku,
          gtin: textValue(product.gtin),
          your_sku: textValue(product.yourSku),
          color_name: textValue(product.colorName),
          color_code: textValue(product.colorCode),
          color_price_code_name: textValue(product.colorPriceCodeName),
          color_group: textValue(product.colorGroup),
          color_group_name: textValue(product.colorGroupName),
          color_family_id: integerValue(product.colorFamilyID),
          color_family: textValue(product.colorFamily),
          color_swatch_image: imageUrl(product.colorSwatchImage),
          color_swatch_text_color: textValue(product.colorSwatchTextColor),
          color_front_image: imageUrl(product.colorFrontImage),
          color_side_image: imageUrl(product.colorSideImage),
          color_back_image: imageUrl(product.colorBackImage),
          color_direct_side_image: imageUrl(product.colorDirectSideImage),
          color_on_model_front_image: imageUrl(product.colorOnModelFrontImage),
          color_on_model_side_image: imageUrl(product.colorOnModelSideImage),
          color_on_model_back_image: imageUrl(product.colorOnModelBackImage),
          color_1: textValue(product.color1),
          color_2: textValue(product.color2),
          size_name: textValue(product.sizeName),
          size_code: textValue(product.sizeCode),
          size_order: textValue(product.sizeOrder),
          size_price_code_name: textValue(product.sizePriceCodeName),
          case_qty: integerValue(product.caseQty),
          unit_weight: numberValue(product.unitWeight),
          map_price: numberValue(product.mapPrice),
          retail_price: numberValue(product.retailPrice),
          piece_price: numberValue(product.piecePrice),
          dozen_price: numberValue(product.dozenPrice),
          case_price: numberValue(product.casePrice),
          sale_price: numberValue(product.salePrice),
          customer_price: numberValue(product.customerPrice),
          sale_expiration: textValue(product.saleExpiration),
          noe_retailing: Boolean(product.noeRetailing),
          poly_pack_qty: integerValue(product.PolyPackQty ?? product.polyPackQty),
          inventory_qty: integerValue(product.qty) || 0,
          country_of_origin: textValue(product.countryOfOrigin),
          warehouses: Array.isArray(product.warehouses) ? product.warehouses : [],
          raw_product: product,
        };
      });

      const styleSummaries = [...new Set(rows.map((row) => row.style_id))].map((styleId) => {
        const variants = rows.filter((row) => row.style_id === styleId);
        const costs = variants.map((row) => Number(row.customer_price || row.piece_price))
          .filter((value) => Number.isFinite(value) && value > 0);
        const realMaps = variants.map((row) => Number(row.map_price))
          .filter((value) => Number.isFinite(value) && value > 0.01);
        return {
          style_id: styleId,
          part_number: variants[0]?.part_number,
          style_name: variants[0]?.style_name,
          sku_variants: variants.length,
          stocked_variants: variants.filter((row) => Number(row.inventory_qty) > 0).length,
          inventory: variants.reduce((total, row) => total + Math.max(0, Number(row.inventory_qty) || 0), 0),
          minimum_vendor_cost: costs.length ? Math.min(...costs) : null,
          maximum_map: realMaps.length ? Math.max(...realMaps) : null,
          colors: new Set(variants.map((row) => row.color_name).filter(Boolean)).size,
          sizes: new Set(variants.map((row) => row.size_name).filter(Boolean)).size,
          image_available: variants.some((row) => Boolean(row.color_on_model_front_image || row.color_front_image)),
        };
      });

      for (let index = 0; index < rows.length; index += 200) {
        const { error: insertError } = await userClient
          .from('ss_sku_staging')
          .upsert(rows.slice(index, index + 200), { onConflict: 'style_session_id,sku' });
        if (insertError) {
          console.error('Private S&S SKU staging failed', insertError.message);
          const message = 'Unable to save the private SKU staging rows';
          await failRun(message, apiRequests, rateLimitRemaining);
          return json(request, { error: message }, 500);
        }
      }

      const completedAt = new Date().toISOString();
      const { error: completeError } = await userClient
        .from('ss_sku_sync_runs')
        .update({
          status: 'completed',
          completed_at: completedAt,
          total_skus: rows.length,
          skipped_rows: skippedRows,
          api_requests: apiRequests,
          rate_limit_remaining: rateLimitRemaining,
          error_message: null,
        })
        .eq('id', syncRun.id);
      if (completeError) {
        console.error('Unable to finalize the SKU sync run', completeError.message);
        return json(request, { error: 'SKU rows were staged, but the sync log could not be finalized' }, 500);
      }

      return json(request, {
        synced: true,
        brand,
        style_session_id: latest.import_session_id,
        styles: styleIds.length,
        skus: rows.length,
        skipped_rows: skippedRows,
        api_requests: apiRequests,
        rate_limit_remaining: rateLimitRemaining,
        completed_at: completedAt,
        storefront_changed: false,
        style_summaries: styleSummaries,
      });
    } catch (error) {
      console.error('S&S brand SKU sync failed', error);
      const message = 'Unable to complete the S&S SKU sync for this brand';
      await failRun(message, apiRequests, rateLimitRemaining);
      return json(request, { error: message }, 502);
    }
  }

  if (payload.action === 'stage_styles') {
    const { data: existing, error: existingError } = await userClient
      .from('ss_import_staging')
      .select('import_session_id,total_staged_rows')
      .eq('row_status', 'pending')
      .order('created_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) {
      console.error('Unable to check existing S&S staging session', existingError.message);
      return json(request, { error: 'Unable to check the staging area' }, 500);
    }
    if (existing) {
      const { count } = await userClient
        .from('ss_import_staging')
        .select('id', { count: 'exact', head: true })
        .eq('import_session_id', existing.import_session_id);
      return json(request, {
        staged: true,
        reused: true,
        import_session_id: existing.import_session_id,
        staged_styles: count || Number(existing.total_staged_rows) || 0,
      });
    }
  }

  try {
    const endpoint = payload.action === 'test_connection'
      ? 'https://api.ssactivewear.com/v2/brands/?mediatype=json'
      : 'https://api.ssactivewear.com/v2/styles/?fields=StyleID%2CPartNumber%2CBrandName%2CStyleName%2CTitle%2CDescription%2CBaseCategory%2CCategories%2CStyleImage&mediatype=json';
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`S&S connection test failed with status ${response.status}`);
      const message = response.status === 401
        ? 'S&S rejected the account number or API key'
        : 'S&S API connection failed';
      if (payload.action === 'test_connection') {
        await userClient.rpc('record_ss_connection_result', {
          p_connected: false,
          p_message: message,
        });
      }
      return json(request, { error: message, upstream_status: response.status }, 502);
    }

    const result = await response.json();
    if (
      payload.action === 'preview_catalog'
      || payload.action === 'stage_styles'
      || payload.action === 'stage_brand_styles'
      || payload.action === 'stage_cold_weather_styles'
    ) {
      const { counts, samples, styles } = collectApprovedStyles(result);

      if (payload.action === 'stage_styles' || payload.action === 'stage_cold_weather_styles' || payload.action === 'stage_brand_styles') {
        const coldWeatherOnly = payload.action === 'stage_cold_weather_styles';
        const selectedBrand = payload.action === 'stage_brand_styles' ? canonicalApprovedBrand(payload.brand) : null;
        if (payload.action === 'stage_brand_styles' && !['Comfort Colors', 'DRI DUCK', 'Champion', 'American Apparel', 'Next Level', 'adidas'].includes(selectedBrand || '')) {
          return json(request, { error: 'Only approved private-import brands can be staged with this action' }, 400);
        }
        const brandStyles = selectedBrand ? styles.filter(style => style.canonicalBrand === selectedBrand) : [];
        // These are the five existing private draft style names. S&S partNumber
        // is a different internal identifier for DRI DUCK and must not be used
        // as the draft style-number match.
        const driDuckDraftStyles = new Set(['3458', '5020', '7035', '9340', '9416']);
        const focusedDriDuck = selectedBrand === 'DRI DUCK'
          ? brandStyles.filter(style => driDuckDraftStyles.has(String(style.styleName || '').trim()))
          : [];
        let championStyles: typeof brandStyles = [];
        if (selectedBrand === 'Champion') {
          const { data: existingChampion, error: existingChampionError } = await userClient
            .from('products').select('style_number,supplier_sku').eq('brand', 'Champion');
          if (existingChampionError) {
            console.error('Unable to read existing Champion styles', existingChampionError.message);
            return json(request, { error: 'Unable to compare Champion styles with the existing catalog' }, 500);
          }
          const existingIdentifiers = new Set((existingChampion || [])
            .flatMap((product) => [product.style_number, product.supplier_sku])
            .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
          const eligible = brandStyles
            .filter((style) => ![style.styleName, style.partNumber]
              .some((value) => existingIdentifiers.has(String(value || '').trim().toLowerCase())))
            .filter((style) => championMerchScore(style) > 0)
            .sort((a, b) => championMerchScore(b) - championMerchScore(a));
          const groups = ['sports_teamwear', 'business_apparel', 'premium_basics'];
          // Stage a slightly wider private pool so inventory/image/price QA can
          // select 20 complete drafts without lowering any publication guard.
          while (championStyles.length < 32) {
            let added = false;
            for (const group of groups) {
              const next = eligible.find((style) => championMerchGroup(style) === group && !championStyles.includes(style));
              if (next) {
                championStyles.push(next);
                added = true;
                if (championStyles.length === 32) break;
              }
            }
            if (!added) break;
          }
        }
        let americanApparelStyles: typeof brandStyles = [];
        if (selectedBrand === 'American Apparel') {
          const { data: existingAmericanApparel, error: existingAmericanApparelError } = await userClient
            .from('products').select('style_number,supplier_sku').eq('brand', 'American Apparel');
          if (existingAmericanApparelError) {
            console.error('Unable to read existing American Apparel styles', existingAmericanApparelError.message);
            return json(request, { error: 'Unable to compare American Apparel styles with the existing catalog' }, 500);
          }
          const existingIdentifiers = new Set((existingAmericanApparel || [])
            .flatMap((product) => [product.style_number, product.supplier_sku])
            .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
          americanApparelStyles = brandStyles
            .filter((style) => ![style.styleName, style.partNumber]
              .some((value) => existingIdentifiers.has(String(value || '').trim().toLowerCase())))
            .filter((style) => americanApparelFallWinterScore(style) > 0)
            .sort((a, b) => americanApparelFallWinterScore(b) - americanApparelFallWinterScore(a))
            .slice(0, 40);
        }
        let nextLevelStyles: typeof brandStyles = [];
        if (selectedBrand === 'Next Level') {
          const { data: existingNextLevel, error: existingNextLevelError } = await userClient
            .from('products').select('style_number,supplier_sku').eq('brand', 'Next Level');
          if (existingNextLevelError) {
            console.error('Unable to read existing Next Level styles', existingNextLevelError.message);
            return json(request, { error: 'Unable to compare Next Level styles with the existing catalog' }, 500);
          }
          const existingIdentifiers = new Set((existingNextLevel || [])
            .flatMap((product) => [product.style_number, product.supplier_sku])
            .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
          nextLevelStyles = brandStyles
            .filter((style) => ![style.styleName, style.partNumber]
              .some((value) => existingIdentifiers.has(String(value || '').trim().toLowerCase())))
            .filter((style) => nextLevelMerchScore(style) > 0)
            .sort((a, b) => nextLevelMerchScore(b) - nextLevelMerchScore(a))
            .slice(0, 40);
        }
        let adidasStyles: typeof brandStyles = [];
        if (selectedBrand === 'adidas') {
          const { data: existingAdidas, error: existingAdidasError } = await userClient
            .from('products').select('style_number,supplier_sku').eq('brand', 'adidas');
          if (existingAdidasError) {
            console.error('Unable to read existing Adidas styles', existingAdidasError.message);
            return json(request, { error: 'Unable to compare Adidas styles with the existing catalog' }, 500);
          }
          const existingIdentifiers = new Set((existingAdidas || [])
            .flatMap((product) => [product.style_number, product.supplier_sku])
            .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
          adidasStyles = brandStyles
            .filter((style) => ![style.styleName, style.partNumber]
              .some((value) => existingIdentifiers.has(String(value || '').trim().toLowerCase())))
            .filter((style) => adidasMerchScore(style) > 0)
            .sort((a, b) => adidasMerchScore(b) - adidasMerchScore(a))
            .slice(0, 60);
        }
        const selectedStyles = selectedBrand === 'DRI DUCK'
          ? focusedDriDuck
          : selectedBrand === 'Comfort Colors'
            ? brandStyles.filter(style => ['00108', '00208', '00808', '00908', '10008', '70108'].includes(String(style.partNumber)))
            : selectedBrand === 'Champion'
              ? championStyles
            : selectedBrand === 'American Apparel'
              ? americanApparelStyles
            : selectedBrand === 'Next Level'
              ? nextLevelStyles
            : selectedBrand === 'adidas'
              ? adidasStyles
            : coldWeatherOnly ? styles.filter(isColdWeatherStyle) : styles;
        if (selectedStyles.length === 0) {
          return json(request, { error: selectedBrand ? `No S&S styles were available for ${selectedBrand}` : 'No eligible S&S styles were available' }, 409);
        }

        const sessionPrefix = selectedBrand ? `ss-brand-${normalizeBrand(selectedBrand)}` : coldWeatherOnly ? 'ss-cold-weather' : 'ss-api';
        const sessionId = `${sessionPrefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
        const rows = selectedStyles.map((style, index) => ({
          import_session_id: sessionId,
          file_name: coldWeatherOnly
            ? 'ss-activewear-api-v2-cold-weather-styles'
            : selectedBrand ? `ss-activewear-api-v2-${normalizeBrand(selectedBrand)}-styles` : 'ss-activewear-api-v2-styles',
          total_staged_rows: selectedStyles.length,
          row_number: index + 1,
          raw_row_data: JSON.stringify(style),
          brand: style.canonicalBrand,
          style_number: String(style.partNumber || ''),
          product_name: [style.canonicalBrand, style.styleName, style.title].filter(Boolean).join(' - '),
          product_category: style.baseCategory || null,
          image_url: imageUrl(style.styleImage),
          row_status: 'pending',
          owner_user_id: actorUserId,
          created_by_email: actorEmail,
        }));

        for (let index = 0; index < rows.length; index += 200) {
          const { error: insertError } = await userClient
            .from('ss_import_staging')
            .insert(rows.slice(index, index + 200));
          if (insertError) {
            console.error('S&S staging insert failed', insertError.message);
            await userClient.from('ss_import_staging').delete().eq('import_session_id', sessionId);
            return json(request, { error: 'Unable to complete the staged import' }, 500);
          }
        }

        return json(request, {
          staged: true,
          reused: false,
          import_session_id: sessionId,
          staged_styles: rows.length,
          approved_brands: approvedBrands.length,
          cold_weather_only: coldWeatherOnly,
          brand_counts: approvedBrands
            .map((brand) => ({
              brand,
              styles: selectedStyles.filter((style) => style.canonicalBrand === brand).length,
            }))
            .filter(({ styles: count }) => count > 0),
          rate_limit_remaining: response.headers.get('x-rate-limit-remaining'),
          staged_at: new Date().toISOString(),
          selected_styles: selectedStyles.map((style) => ({
            style_id: style.styleID,
            part_number: style.partNumber,
            style_name: style.styleName,
            title: style.title,
            category: style.baseCategory,
            merchandising_group: selectedBrand === 'Champion' ? championMerchGroup(style) : selectedBrand === 'American Apparel' ? 'fall_winter' : ['Next Level', 'adidas'].includes(selectedBrand || '') ? 'assortment' : null,
            image_url: imageUrl(style.styleImage),
          })),
        });
      }

      return json(request, {
        preview: true,
        approved_brands: approvedBrands.length,
        matching_styles: Object.values(counts).reduce((total, count) => total + Number(count), 0),
        brand_counts: approvedBrands.map((brand) => ({ brand, styles: counts[brand] })),
        unresolved_brands: approvedBrands.filter((brand) => counts[brand] === 0),
        sample_styles: samples,
        rate_limit_remaining: response.headers.get('x-rate-limit-remaining'),
        checked_at: new Date().toISOString(),
      });
    }

    const connectionResult = {
      connected: true,
      endpoint: 'S&S Activewear API v2',
      brands_available: Array.isArray(result) ? result.length : null,
      rate_limit_remaining: response.headers.get('x-rate-limit-remaining'),
      checked_at: new Date().toISOString(),
    };
    await userClient.rpc('record_ss_connection_result', {
      p_connected: true,
      p_message: 'S&S API connected (read-only test)',
    });
    return json(request, connectionResult);
  } catch (error) {
    console.error('S&S connection test request failed', error);
    if (payload.action === 'test_connection') {
      await userClient.rpc('record_ss_connection_result', {
        p_connected: false,
        p_message: 'Unable to reach the S&S API',
      });
    }
    return json(request, { error: 'Unable to reach the S&S API' }, 502);
  }
});
