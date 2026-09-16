import { supabase } from '@/api/supabaseClient';

let publicSettings;
let settingsPromise;
let gaScript;
let pinterestScript;
let pinterestDisabled = false;

const privatePaths = ['/admin', '/launch', '/login', '/publiccatalogaudit', '/missingimagereport'];
export const isPrivateMarketingRoute = (pathname = window.location.pathname) =>
  privatePaths.some(path => pathname.toLowerCase().startsWith(path));

const safePageLocation = () => `${window.location.origin}${window.location.pathname}`;

export async function getMarketingSettings() {
  if (publicSettings) return publicSettings;
  if (!settingsPromise) {
    settingsPromise = Promise.resolve(supabase.rpc('marketing_public_settings'))
      .then(({ data, error }) => {
        if (error) throw error;
        publicSettings = data || {};
        return publicSettings;
      })
      .catch(() => {
        settingsPromise = undefined;
        return {};
      });
  }
  return settingsPromise;
}

export function disablePublicPixels() {
  if (publicSettings?.ga4_measurement_id) {
    window[`ga-disable-${publicSettings.ga4_measurement_id}`] = true;
  }
  if (typeof window.pintrk === 'function' && !pinterestDisabled) {
    window.pintrk('setconsent', false);
    pinterestDisabled = true;
  }
  gaScript?.remove();
  pinterestScript?.remove();
  document.querySelectorAll('script[src^="https://s.pinimg.com/ct/"]').forEach(script => script.remove());
}

export async function loadPublicPixels() {
  if (isPrivateMarketingRoute()) {
    disablePublicPixels();
    return {};
  }
  const settings = await getMarketingSettings();
  if (isPrivateMarketingRoute()) {
    disablePublicPixels();
    return {};
  }
  if (settings.ga4_measurement_id && /^G-[A-Z0-9]{4,20}$/.test(settings.ga4_measurement_id)) {
    window[`ga-disable-${settings.ga4_measurement_id}`] = false;
    if (!gaScript) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', settings.ga4_measurement_id, { send_page_view: false });
      gaScript = document.createElement('script');
      gaScript.id = 'hc-ga4';
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${settings.ga4_measurement_id}`;
    }
    if (!gaScript.isConnected) document.head.appendChild(gaScript);
  }
  if (settings.pinterest_tag_id && /^\d{5,30}$/.test(settings.pinterest_tag_id)) {
    if (!pinterestScript) {
      window.pintrk = window.pintrk || function () { (window.pintrk.queue = window.pintrk.queue || []).push(Array.from(arguments)); };
      window.pintrk('load', settings.pinterest_tag_id);
      window.pintrk('page');
      pinterestScript = document.createElement('script');
      pinterestScript.id = 'hc-pinterest';
      pinterestScript.async = true;
      pinterestScript.src = 'https://s.pinimg.com/ct/core.js';
    }
    if (pinterestDisabled) {
      window.pintrk('setconsent', true);
      pinterestDisabled = false;
    }
    if (!pinterestScript.isConnected) document.head.appendChild(pinterestScript);
  }
  return settings;
}

async function logInternalEvent(eventName, product, source) {
  try {
    const { error } = await supabase.rpc('log_marketing_event', {
      p_event_name: eventName,
      p_product_id: product?.id || null,
      p_product_name: product?.name || null,
      p_source: source || null,
    });
    if (error) console.warn('Internal marketing event failed:', error.code || 'unknown');
  } catch {
    console.warn('Internal marketing event failed.');
  }
}

export async function trackMarketingEvent(eventName, product = null, source = null, { logInternal = true } = {}) {
  if (isPrivateMarketingRoute()) return;
  const settings = await loadPublicPixels();
  if (isPrivateMarketingRoute()) return;
  const cleanProduct = product && {
    id: String(product.id || '').slice(0, 100),
    name: String(product.name || '').slice(0, 180),
  };
  if (logInternal && settings.internal_analytics_enabled) {
    void logInternalEvent(eventName, cleanProduct, source);
  }
  if (settings.ga4_measurement_id && typeof window.gtag === 'function') {
    window.gtag('event', eventName, {
      page_location: safePageLocation(),
      page_path: window.location.pathname,
      ...(cleanProduct ? { item_id: cleanProduct.id, item_name: cleanProduct.name } : {}),
    });
  }
  if (settings.pinterest_tag_id && typeof window.pintrk === 'function') {
    const names = { page_view: 'pagevisit', view_product: 'pagevisit', add_to_cart: 'addtocart', begin_checkout: 'checkout', newsletter_signup: 'signup' };
    if (names[eventName]) window.pintrk('track', names[eventName]);
  }
}
