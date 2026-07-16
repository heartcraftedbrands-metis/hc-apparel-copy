import { base44 } from "@/api/base44Client";

let cachedFeeSettings = null;
let settingsCacheTime = 0;
const CACHE_DURATION = 60000; // 1 minute

/**
 * Get current payment fee settings (cached)
 */
export async function getFeeSettings() {
  const now = Date.now();
  
  if (cachedFeeSettings && (now - settingsCacheTime) < CACHE_DURATION) {
    return cachedFeeSettings;
  }

  try {
    const settings = await base44.entities.PaymentFeeSettings.list();
    
    if (settings.length > 0) {
      cachedFeeSettings = settings[0];
    } else {
      // Return defaults if none found
      cachedFeeSettings = {
        stripe_fee_buffer_percent: 3.5,
        stripe_fixed_fee_buffer: 0.5,
        paypal_fee_buffer_percent: 4.0,
        paypal_fixed_fee_buffer: 0.5,
        additional_profit_buffer_percent: 0,
        price_rounding_mode: 'nearest_99'
      };
    }
    
    settingsCacheTime = now;
    return cachedFeeSettings;
  } catch (err) {
    console.warn('Failed to load fee settings:', err);
    // Return defaults on error
    return {
      stripe_fee_buffer_percent: 3.5,
      stripe_fixed_fee_buffer: 0.5,
      paypal_fee_buffer_percent: 4.0,
      paypal_fixed_fee_buffer: 0.5,
      additional_profit_buffer_percent: 0,
      price_rounding_mode: 'nearest_99'
    };
  }
}

/**
 * Calculate final advertised price with embedded payment fee buffer
 */
export function calculatePrice(blankCost, baseMarkup, feeSettings, paymentMethod = 'stripe') {
  if (!blankCost || !baseMarkup || !feeSettings) return 0;

  let basePrice = blankCost + baseMarkup;
  
  // Get fee buffers based on payment method
  let feePercent = 0;
  let feeFixed = 0;

  if (paymentMethod === 'paypal') {
    feePercent = feeSettings.paypal_fee_buffer_percent || 4.0;
    feeFixed = feeSettings.paypal_fixed_fee_buffer || 0.5;
  } else {
    feePercent = feeSettings.stripe_fee_buffer_percent || 3.5;
    feeFixed = feeSettings.stripe_fixed_fee_buffer || 0.5;
  }

  const extraBufferPercent = feeSettings.additional_profit_buffer_percent || 0;
  const totalPercentageBuffer = (feePercent + extraBufferPercent) / 100;

  // Apply buffers
  let finalPrice = basePrice * (1 + totalPercentageBuffer) + feeFixed;

  // Apply rounding rule
  const roundingMode = feeSettings.price_rounding_mode || 'nearest_99';

  if (roundingMode === 'nearest_99') {
    finalPrice = Math.floor(finalPrice * 100) / 100 - 0.01;
    if (finalPrice < basePrice) finalPrice += 1.00;
  } else if (roundingMode === 'nearest_49') {
    finalPrice = Math.floor(finalPrice * 100) / 100 - 0.51;
    if (finalPrice < basePrice) finalPrice += 1.00;
  } else if (roundingMode === 'whole_dollar') {
    finalPrice = Math.ceil(finalPrice);
  }

  return Math.max(finalPrice, basePrice + 0.01);
}

/**
 * Clear the cache (useful after settings are updated)
 */
export function clearFeeSettingsCache() {
  cachedFeeSettings = null;
  settingsCacheTime = 0;
}