import { supabase, supabaseUrl } from '@/api/supabaseClient';

export const HC_LOGO_URL = 'https://bxsdajpldrdesnvjiubt.supabase.co/storage/v1/object/public/storefront-assets/legacy/8498fd234f415ff5_4bf10d633_1.png';
const endpoint = `${supabaseUrl}/functions/v1/digital-mockups`;

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
    ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export async function digitalMockupsRequest(payload) {
  const requestHeaders = await headers();
  const isForm = payload instanceof FormData;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...requestHeaders, ...(isForm ? {} : { 'content-type': 'application/json' }) },
    body: isForm ? payload : JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Digital Mockups request failed.');
    error.code = result.code;
    error.status = response.status;
    throw error;
  }
  return result;
}

const loadBitmap = async source => {
  if (source instanceof Blob) return createImageBitmap(source);
  const response = await fetch(source, { mode: 'cors' });
  if (!response.ok) throw new Error('The HC Apparel logo could not be loaded for the watermark.');
  return createImageBitmap(await response.blob());
};

export async function createWatermarkedPreview(file, onProgress = () => {}) {
  onProgress(10);
  const [image, logo] = await Promise.all([loadBitmap(file), loadBitmap(HC_LOGO_URL)]);
  onProgress(35);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This browser cannot create a protected preview.');
  context.drawImage(image, 0, 0, width, height);
  onProgress(55);

  const logoWidth = Math.round(width * 0.5);
  const logoHeight = Math.max(1, Math.round(logoWidth * logo.height / logo.width));
  const x = Math.round((width - logoWidth) / 2);
  const y = Math.round(height * 0.56 - logoHeight / 2);
  context.save();
  context.globalAlpha = 0.4;
  context.shadowColor = 'rgba(255, 255, 255, 0.62)';
  context.shadowBlur = Math.max(2, Math.round(width * 0.006));
  context.drawImage(logo, x, y, logoWidth, logoHeight);
  context.restore();
  onProgress(80);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The protected preview could not be encoded.')), 'image/png', 0.9));
  image.close?.();
  logo.close?.();
  onProgress(100);
  return new File([blob], `${file.name.replace(/\.png$/i, '')}-protected-preview.png`, { type: 'image/png' });
}

export async function createPublicHero(file, onProgress = () => {}) {
  onProgress(10);
  const image = await loadBitmap(file);
  onProgress(35);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This browser cannot create the storefront hero image.');
  context.drawImage(image, 0, 0, width, height);
  onProgress(75);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The storefront hero image could not be encoded.')), 'image/png'));
  image.close?.();
  onProgress(100);
  return new File([blob], `${file.name.replace(/\.png$/i, '')}-public-hero.png`, { type: 'image/png' });
}

export function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(2)} MB`;
}

export function mockupCartItem(item) {
  return {
    id: item.product_id,
    product_id: item.product_id,
    digital_mockup_asset_id: item.id,
    name: item.title,
    product_name: item.title,
    sku: item.sku,
    price: Number(item.price),
    customer_price: Number(item.price),
    product_type: 'digital',
    view_type: item.view_type || 'single_view',
    presentation_type: item.presentation_type || 'studio',
    image_url: item.preview_url,
    quantity: 1,
    file_details: { width: item.pixel_width, height: item.pixel_height, format: item.file_extension },
  };
}
