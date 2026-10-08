import fs from 'node:fs';
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

const db = createClient(url, key, { auth: { persistSession: false } });
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('storefront_products').select('*').range(from, from + 999);
  if (error) throw error;
  rows.push(...(data || []));
  if (!data || data.length < 1000) break;
}

const wantedIds = new Set([
  'd12b6912-b9fb-4582-9d57-a40e0499b274', // Gildan 5000
  '824e99db-7758-495b-99f4-0e2d5a4ff0da', // Gildan 18500
  '150f3861-4f9c-46f3-8b76-54ecf40c2413', // Comfort Colors 1717
  '055f92f7-3453-4455-9db5-a112239ff91c', // Shaka Wear 241C2 crewneck
  'a0d2a65a-0c03-4b0d-a97a-3940be0a6391', // Next Level 3600
  '41c95206-3b16-4091-9c02-e4d03311ec10', // Bella + Canvas 3001
  '609c9c51-b9c1-4afa-80b8-bc6c66a25690', // Shaka Wear 297C2 tee
  '87e3cf23-d6c4-4996-9be1-9eacdcf2b932', // American Apparel 2001
  '4162eaf9-061e-4b3c-9a00-4dd7cf2172eb', // Gildan 64000
  '4e9ae0c7-243e-44c6-a90c-47042b949bd2', // adidas A721
  'de5d2534-d256-472d-97a1-dc7a77ee1cae', // Berne CH416
]);

const selected = rows
  .filter((row) => wantedIds.has(row.id))
  .map((row) => {
    const variants = Array.isArray(row.size_prices) ? row.size_prices : [];
    const stocked = variants.filter((variant) => Number(variant.inventory || 0) > 0);
    const prices = stocked.map((variant) => Number(variant.price ?? row.price)).filter(Number.isFinite);
    const images = [...new Set(stocked.map((variant) => variant.image_url).filter(Boolean))];
    return {
      id: row.id,
      brand: row.brand,
      name: row.name,
      style: row.style_number || row.supplier_sku,
      category: row.category,
      garment_type: row.primary_garment_type,
      visibility: row.visibility,
      is_active: row.is_active,
      price: row.price,
      sale_price: row.sale_price,
      stocked_variants: stocked.length,
      stock: stocked.reduce((sum, variant) => sum + Number(variant.inventory || 0), 0),
      min_variant_price: prices.length ? Math.min(...prices) : null,
      max_variant_price: prices.length ? Math.max(...prices) : null,
      image_url: images.find((image) => /\/Images\/Color\//i.test(image)) || row.image_url || images[0] || null,
    };
  })
  .sort((a, b) => `${a.brand} ${a.style}`.localeCompare(`${b.brand} ${b.style}`));

const referencedArtworkProducts = rows
  .filter((row) => /212481|A572|\b5028\b/i.test(JSON.stringify(row)))
  .map((row) => ({ id: row.id, brand: row.brand, name: row.name, style_number: row.style_number, supplier_sku: row.supplier_sku }));

const outerwearCandidates = rows
  .filter((row) => row.primary_garment_type === 'outerwear' && row.visibility === 'public' && row.is_active !== false)
  .map((row) => {
    const variants = Array.isArray(row.size_prices) ? row.size_prices : [];
    const stocked = variants.filter((variant) => Number(variant.inventory || 0) > 0);
    return {
      id: row.id,
      brand: row.brand,
      name: row.name,
      style: row.style_number || row.supplier_sku,
      category: row.category,
      description: row.description || null,
      features: row.features || null,
      tags: row.tags || null,
      vendor_specs: row.vendor_specs || null,
      stocked_variants: stocked.length,
      stock: stocked.reduce((sum, variant) => sum + Number(variant.inventory || 0), 0),
      image_url: stocked.map((variant) => variant.image_url).find((image) => /\/Images\/Color\//i.test(image || '')) || row.image_url || null,
    };
  })
  .sort((a, b) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`));

console.log(JSON.stringify({
  checked_at: new Date().toISOString(),
  public_rows: rows.length,
  live_outerwear_rows: rows.filter((row) => row.primary_garment_type === 'outerwear' && row.visibility === 'public' && row.is_active !== false).length,
  selected,
  referenced_artwork_products: referencedArtworkProducts,
  outerwear_candidates: outerwearCandidates,
}, null, 2));
