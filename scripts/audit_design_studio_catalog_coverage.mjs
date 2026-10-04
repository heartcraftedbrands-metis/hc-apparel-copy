import fs from 'node:fs';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';

const loadEnv = (path) => {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
};

loadEnv('.env');
loadEnv('.env.local');

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase public runtime settings are unavailable.');

const requestedBrands = new Set([
  'gildan', 'comfort colors', 'shaka wear', 'hanes', 'next level',
  'bella + canvas', 'american apparel', 'tultex',
]);
const candidateTypes = new Set(['t_shirts', 'hoodies', 'crewnecks']);
const db = createClient(url, key, { auth: { persistSession: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('storefront_products').select('*').range(from, from + 999);
  if (error) throw error;
  rows.push(...(data || []));
  if (!data || data.length < 1000) break;
}

const approvedRows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('design_studio_products')
    .select('id,brand,name,primary_garment_type,design_studio_garment_type,design_studio_front_images')
    .range(from, from + 999);
  if (error) throw error;
  approvedRows.push(...(data || []));
  if (!data || data.length < 1000) break;
}

const candidates = rows
  .filter((row) => requestedBrands.has(String(row.brand || '').trim().toLowerCase()))
  .filter((row) => candidateTypes.has(String(row.primary_garment_type || '').trim().toLowerCase()))
  .map((row) => {
    const variants = Array.isArray(row.size_prices) ? row.size_prices : [];
    const colorImages = new Map();
    for (const variant of variants) {
      const raw = String(variant.size || '').trim();
      const separator = raw.indexOf(' / ');
      const color = String(variant.color_name || variant.color || (separator >= 0 ? raw.slice(0, separator) : '')).trim();
      if (!color || !variant.image_url || Number(variant.inventory || 0) <= 0) continue;
      if (!colorImages.has(color)) colorImages.set(color, variant.image_url);
    }
    const allColorImages = [...colorImages].map(([color, image_url]) => ({ color, image_url }));
    const flatCandidates = allColorImages.filter((item) => /\/Images\/Color\//i.test(item.image_url));
    const preferredCandidate = flatCandidates.find((item) => item.color.toLowerCase() === 'black') || flatCandidates[0] || null;
    const currentImageCandidates = allColorImages.filter((item) => item.image_url === row.image_url);
    return {
      id: row.id,
      brand: row.brand,
      name: row.name,
      style: row.style_number || row.supplier_sku || '',
      supplier_sku: row.supplier_sku || '',
      vendor_title: row.vendor_specs?.product_title || row.vendor_specs?.style_name || row.vendor_specs?.product_name || row.vendor_specs?.title || '',
      primary_garment_type: row.primary_garment_type,
      stock: row.stock,
      image_url: row.image_url || '',
      image_color_count: allColorImages.length,
      flat_image_candidate_count: flatCandidates.length,
      preferred_candidate: preferredCandidate,
      current_image_candidates: currentImageCandidates,
      color_images: allColorImages,
    };
  })
  .sort((a, b) => `${a.brand} ${a.style}`.localeCompare(`${b.brand} ${b.style}`));

const coverage = {};
for (const brand of requestedBrands) {
  const products = candidates.filter((item) => item.brand.toLowerCase() === brand);
  coverage[brand] = {
    total: products.length,
    by_type: Object.fromEntries([...candidateTypes].map((type) => [type, products.filter((item) => item.primary_garment_type === type).length])),
    products,
  };
}

if (process.argv.includes('--serve') || process.argv.includes('--serve-alternates')) {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const needsAlternateReview = new Set([
    'f2b732d9-0ee6-4fad-9c96-5ed10d7f1fb0', '0e764aaf-9774-487a-addd-fe3f5ad6059c',
    '01ce9d6d-2e28-4cc1-8c93-223d494f1553', 'fb72fb5d-4772-4266-aced-ef5a2dae27e7',
    '1e8dded4-3607-4018-ba8f-02832c25b15e', 'aac90f00-4985-4cb6-a3e7-8aa9e09101f0',
    'c5a93c19-c10b-460a-9ef5-cd3bd625fe8e', '9fddb455-56f1-4d57-bc70-c9ec6d8a94be',
    '8f9d0fd7-7fc6-4fb3-b90c-1fc6015d2e46', '8daaa1f5-b5ce-48a0-a37b-db1f97400717',
  ]);
  const reviewCandidates = process.argv.includes('--serve-alternates')
    ? candidates.filter((product) => needsAlternateReview.has(product.id)).flatMap((product) => product.color_images.map((image) => ({ ...product, reviewImage: image })))
    : candidates;
  const cards = reviewCandidates.map((product) => `
    <article class="card">
      <h2>${escapeHtml(product.brand)} · ${escapeHtml(product.name)}</h2>
      <p>${escapeHtml(product.primary_garment_type)} · ${escapeHtml(product.id)}</p>
      <div class="images">
        <figure><img src="${escapeHtml(product.reviewImage?.image_url || product.preferred_candidate?.image_url || product.image_url)}" alt="${escapeHtml(product.name)} candidate"><figcaption>${escapeHtml(product.reviewImage ? `${product.reviewImage.color} alternate` : product.preferred_candidate ? `${product.preferred_candidate.color} flat candidate` : 'Current catalog image; no garment-only candidate found')}</figcaption></figure>
        ${!product.reviewImage && product.preferred_candidate && product.image_url !== product.preferred_candidate.image_url ? `<figure><img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)} current"><figcaption>Current catalog primary image</figcaption></figure>` : ''}
      </div>
    </article>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Design Studio image review</title><style>body{font-family:system-ui;margin:0;background:#f7f3ea;color:#2a1722}header{position:sticky;top:0;z-index:2;background:#4b1236;color:white;padding:16px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;padding:16px}.card{background:white;border:1px solid #d8c9b7;border-radius:14px;padding:12px}.card h2{font-size:16px;margin:0 0 4px;color:#4b1236}.card p,figcaption{font-size:12px}.images{display:flex;gap:8px}.images figure{margin:0;flex:1}.images img{width:100%;height:300px;object-fit:contain;background:#fff;border:1px solid #ddd}</style></head><body><header><strong>${reviewCandidates.length} image candidates</strong> · ${process.argv.includes('--serve-alternates') ? 'alternate exact-color supplier images for unresolved styles' : 'preferred exact-color image beside current catalog primary'}</header><main>${cards}</main></body></html>`;
  http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  }).listen(process.argv.includes('--serve-alternates') ? 4191 : 4190, '127.0.0.1', () => console.log(`Design Studio image review: http://127.0.0.1:${process.argv.includes('--serve-alternates') ? 4191 : 4190}`));
} else if (process.argv.includes('--compact')) {
  console.log(JSON.stringify({
    total_public_rows: rows.length,
    qualifying_candidates: candidates.length,
    approved_studio_products: approvedRows.length,
    approved_by_brand: Object.fromEntries([...requestedBrands].map((brand) => [brand, approvedRows.filter((row) => String(row.brand || '').trim().toLowerCase() === brand).length])),
    coverage: Object.fromEntries(Object.entries(coverage).map(([brand, value]) => [brand, {
      total: value.total,
      by_type: value.by_type,
      styles: value.products.map((product) => ({
        id: product.id,
        name: product.name,
        vendor_title: product.vendor_title,
        type: product.primary_garment_type,
        flat_candidate: product.preferred_candidate,
      })),
    }])),
  }, null, 2));
} else if (process.argv.includes('--image-map')) {
  console.log(JSON.stringify(candidates.map((product) => ({
    id: product.id,
    brand: product.brand,
    name: product.name,
    type: product.primary_garment_type,
    preferred_candidate: product.preferred_candidate,
    current_image_candidates: product.current_image_candidates,
  })), null, 2));
} else if (process.argv.includes('--migration-values')) {
  const colorOverrides = new Map([
    ['f2b732d9-0ee6-4fad-9c96-5ed10d7f1fb0', 'Bone'],
    ['0e764aaf-9774-487a-addd-fe3f5ad6059c', 'Grey'],
    ['01ce9d6d-2e28-4cc1-8c93-223d494f1553', 'Black'],
    ['fb72fb5d-4772-4266-aced-ef5a2dae27e7', 'Tangerine'],
    ['1e8dded4-3607-4018-ba8f-02832c25b15e', 'Ash'],
    ['aac90f00-4985-4cb6-a3e7-8aa9e09101f0', 'Yellow'],
    ['c5a93c19-c10b-460a-9ef5-cd3bd625fe8e', 'Army Brown'],
    ['9fddb455-56f1-4d57-bc70-c9ec6d8a94be', 'Turquoise'],
  ]);
  const unavailableImageIds = new Set([
    '8f9d0fd7-7fc6-4fb3-b90c-1fc6015d2e46',
    '8daaa1f5-b5ce-48a0-a37b-db1f97400717',
  ]);
  const zipHoodieIds = new Set([
    'f2b732d9-0ee6-4fad-9c96-5ed10d7f1fb0',
    'd28c029d-efec-483b-9e3e-382f16b95076',
    '0b6ff7f4-2de2-43d9-b6f9-7191fd90cee4',
    '8daaa1f5-b5ce-48a0-a37b-db1f97400717',
  ]);
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const reviewed = candidates.filter((product) => !unavailableImageIds.has(product.id)).map((product) => {
    const requestedColor = colorOverrides.get(product.id);
    const image = requestedColor
      ? product.color_images.find((item) => item.color === requestedColor)
      : product.preferred_candidate || product.current_image_candidates[0];
    if (!image) throw new Error(`No reviewed image is available for ${product.name}.`);
    const garmentType = product.primary_garment_type === 'hoodies'
      ? (zipHoodieIds.has(product.id) ? 'zip_hoodies' : 'pullover_hoodies')
      : product.primary_garment_type;
    return `  (${quote(product.id)}::uuid, ${quote(garmentType)}, ${quote(image.color)}, ${quote(image.image_url)})`;
  });
  console.log(reviewed.join(',\n'));
} else {
  console.log(JSON.stringify({ total_public_rows: rows.length, qualifying_candidates: candidates.length, coverage }, null, 2));
}
