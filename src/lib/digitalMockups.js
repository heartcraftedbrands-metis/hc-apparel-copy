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

  const logoWidth = Math.round(width * 0.42);
  const logoHeight = Math.max(1, Math.round(logoWidth * logo.height / logo.width));
  const x = Math.round((width - logoWidth) / 2);
  const positions = [0.36, 0.53, 0.7].map(value => Math.round(height * value - logoHeight / 2));
  positions.forEach((y, index) => {
    context.save();
    context.globalAlpha = index === 1 ? 0.62 : 0.42;
    context.fillStyle = '#f8f4ee';
    context.fillRect(x - 16, y - 10, logoWidth + 32, logoHeight + 20);
    context.globalAlpha = index === 1 ? 0.72 : 0.5;
    context.drawImage(logo, x, y, logoWidth, logoHeight);
    context.restore();
  });
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(-Math.PI / 7);
  context.globalAlpha = 0.25;
  context.fillStyle = '#ffffff';
  context.font = `700 ${Math.max(18, Math.round(width * 0.034))}px Arial, sans-serif`;
  context.textAlign = 'center';
  context.fillText('HC APPAREL PREVIEW', 0, Math.round(height * 0.09));
  context.restore();
  onProgress(80);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The protected preview could not be encoded.')), 'image/png', 0.9));
  image.close?.();
  logo.close?.();
  onProgress(100);
  return new File([blob], `${file.name.replace(/\.png$/i, '')}-watermarked-preview.png`, { type: 'image/png' });
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
    image_url: item.preview_url,
    quantity: 1,
    file_details: { width: item.pixel_width, height: item.pixel_height, format: item.file_extension },
  };
}
