import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const path of ['.env', '.env.local']) {
  if (!fs.existsSync(path)) continue;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase public runtime settings are unavailable.');

const pins = [
  ['2026-10-09', 'oct09_puffers_insulated', '3d60d812-9fb0-41f6-858c-14ef2e858635', 'https://www.ssactivewear.com/Images/Color/139563_f_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=3d60d812-9fb0-41f6-858c-14ef2e858635'],
  ['2026-10-10', 'oct10_gildan_5000', 'd12b6912-b9fb-4582-9d57-a40e0499b274', 'https://www.ssactivewear.com/Images/Color/33476_f_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=d12b6912-b9fb-4582-9d57-a40e0499b274'],
  ['2026-10-11', 'oct11_blank_hoodies_fall', '824e99db-7758-495b-99f4-0e2d5a4ff0da', 'https://www.ssactivewear.com/Images/Color/33306_f_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=824e99db-7758-495b-99f4-0e2d5a4ff0da'],
  ['2026-10-12', 'oct12_comfort_colors_1717', '150f3861-4f9c-46f3-8b76-54ecf40c2413', 'https://www.ssactivewear.com/Images/Color/47183_f_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=150f3861-4f9c-46f3-8b76-54ecf40c2413'],
  ['2026-10-13', 'oct13_berne_ch416', 'de5d2534-d256-472d-97a1-dc7a77ee1cae', 'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/jackets-without-hoods.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=de5d2534-d256-472d-97a1-dc7a77ee1cae'],
  ['2026-10-14', 'oct14_crewneck_sweatshirts', '055f92f7-3453-4455-9db5-a112239ff91c', 'https://www.ssactivewear.com/Images/Color/142656_f_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=055f92f7-3453-4455-9db5-a112239ff91c'],
  ['2026-10-15', 'oct15_brand_creators', 'a0d2a65a-0c03-4b0d-a97a-3940be0a6391', 'https://www.ssactivewear.com/Images/ModelColor/96037_omf_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=a0d2a65a-0c03-4b0d-a97a-3940be0a6391'],
  ['2026-10-16', 'oct16_rain_jackets', '51a107db-19d6-491e-9e24-c732885e1a75', 'https://www.ssactivewear.com/Images/ModelColor/96135_omf_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=51a107db-19d6-491e-9e24-c732885e1a75'],
  ['2026-10-17', 'oct17_bella_canvas_3001', '41c95206-3b16-4091-9c02-e4d03311ec10', 'https://www.ssactivewear.com/Images/Color/34126_f_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=41c95206-3b16-4091-9c02-e4d03311ec10'],
  ['2026-10-18', 'oct18_shaka_wear_tees', '609c9c51-b9c1-4afa-80b8-bc6c66a25690', 'https://www.ssactivewear.com/Images/Color/127195_f_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=609c9c51-b9c1-4afa-80b8-bc6c66a25690'],
  ['2026-10-19', 'oct19_american_apparel_2001', '87e3cf23-d6c4-4996-9be1-9eacdcf2b932', 'https://www.ssactivewear.com/Images/Color/67565_f_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=87e3cf23-d6c4-4996-9be1-9eacdcf2b932'],
  ['2026-10-20', 'oct20_workwear_outerwear', 'bef05148-962a-4e6b-b00d-906569121f60', 'https://www.ssactivewear.com/Images/ModelColor/41681_omf_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=bef05148-962a-4e6b-b00d-906569121f60'],
  ['2026-10-21', 'oct21_teams_groups', '4162eaf9-061e-4b3c-9a00-4dd7cf2172eb', 'https://www.ssactivewear.com/Images/Color/33310_f_fm.jpg', 'https://www.ilovehcapparel.net/ProductDetail?id=4162eaf9-061e-4b3c-9a00-4dd7cf2172eb'],
  ['2026-10-22', 'oct22_fall_apparel_roundup', '4e9ae0c7-243e-44c6-a90c-47042b949bd2', 'https://www.ssactivewear.com/Images/Color/139646_f_fm.jpg', 'https://www.ilovehcapparel.net/ShopGarments'],
].map(([date, content, productId, image, destination]) => ({ date, content, productId, image, destination }));

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: products, error } = await db.from('storefront_products').select('id,name,visibility,is_active,size_prices').in('id', pins.map(pin => pin.productId));
if (error) throw error;

const results = [];
for (const pin of pins) {
  const product = (products || []).find(item => item.id === pin.productId);
  const stocked = Array.isArray(product?.size_prices) && product.size_prices.some(variant => Number(variant.inventory || 0) > 0);
  const tracking = new URL(pin.destination);
  tracking.searchParams.set('utm_source', 'pinterest');
  tracking.searchParams.set('utm_medium', 'organic_social');
  tracking.searchParams.set('utm_campaign', 'hc_apparel_organic_launch');
  tracking.searchParams.set('utm_content', pin.content);
  const [page, image] = await Promise.all([
    fetch(tracking, { redirect: 'follow' }),
    fetch(pin.image, { redirect: 'follow' }),
  ]);
  const imageType = image.headers.get('content-type')?.split(';')[0] || '';
  await page.body?.cancel();
  await image.body?.cancel();
  results.push({
    date: pin.date,
    content: pin.content,
    product: product?.name || null,
    live_product: Boolean(product?.is_active && product?.visibility === 'public' && stocked),
    destination_ok: page.ok,
    image_ok: image.ok && ['image/jpeg', 'image/png', 'image/webp'].includes(imageType),
    tracking_url: tracking.toString(),
  });
}

const failed = results.filter(item => !item.live_product || !item.destination_ok || !item.image_ok);
if (new Set(results.map(item => item.tracking_url)).size !== pins.length) throw new Error('UTM links are not unique.');
console.log(JSON.stringify({ checked_at: new Date().toISOString(), pins: results.length, passed: results.length - failed.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
