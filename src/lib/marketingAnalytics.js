import { supabase } from '@/api/supabaseClient';

let publicSettings;
let settingsPromise;
const privatePaths = ['/admin', '/launch', '/publiccatalogaudit', '/missingimagereport'];
const isPrivatePage = () => privatePaths.some(path => window.location.pathname.toLowerCase().startsWith(path));
export async function getMarketingSettings() {
  if (publicSettings) return publicSettings;
  if (!settingsPromise) settingsPromise = supabase.rpc('marketing_public_settings').then(({ data }) => {
    publicSettings = data || {};
    return publicSettings;
  }).catch(() => ({}));
  return settingsPromise;
}

export async function trackMarketingEvent(eventName, product = null, source = null) {
  if (isPrivatePage()) return;
  const settings = await getMarketingSettings();
  const cleanProduct = product && { id: String(product.id || '').slice(0, 100), name: String(product.name || '').slice(0, 180) };
  if (settings.internal_analytics_enabled) {
    supabase.rpc('log_marketing_event', { p_event_name: eventName, p_product_id: cleanProduct?.id || null, p_product_name: cleanProduct?.name || null, p_source: source || null }).catch(() => {});
  }
  if (settings.ga4_measurement_id && typeof window.gtag === 'function') {
    window.gtag('event', eventName, cleanProduct ? { item_id: cleanProduct.id, item_name: cleanProduct.name } : {});
  }
  // Pinterest receives event names only; no customer fields or contact identifiers.
  if (settings.pinterest_tag_id && typeof window.pintrk === 'function') {
    const names = { page_view: 'pagevisit', view_product: 'pagevisit', add_to_cart: 'addtocart', begin_checkout: 'checkout', purchase: 'checkout', newsletter_signup: 'signup' };
    if (names[eventName]) window.pintrk('track', names[eventName]);
  }
}

export async function loadPublicPixels() {
  const settings = await getMarketingSettings();
  if (settings.ga4_measurement_id && /^G-[A-Z0-9]{4,20}$/.test(settings.ga4_measurement_id) && !document.getElementById('hc-ga4')) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', settings.ga4_measurement_id, { send_page_view: false });
    const script = document.createElement('script'); script.id = 'hc-ga4'; script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${settings.ga4_measurement_id}`;
    document.head.appendChild(script);
  }
  if (settings.pinterest_tag_id && /^\d{5,30}$/.test(settings.pinterest_tag_id) && !document.getElementById('hc-pinterest')) {
    window.pintrk = window.pintrk || function () { (window.pintrk.queue = window.pintrk.queue || []).push(Array.from(arguments)); };
    window.pintrk('load', settings.pinterest_tag_id);
    const script = document.createElement('script'); script.id = 'hc-pinterest'; script.async = true;
    script.src = 'https://s.pinimg.com/ct/core.js'; document.head.appendChild(script);
  }
}
