/**
 * Calculate final advertised price with embedded payment fee buffer
 * @param {number} blankCost - Base product cost
 * @param {number} baseMarkup - Markup amount in dollars
 * @param {object} feeSettings - Payment fee settings from database
 * @param {string} paymentMethod - 'stripe' or 'paypal' to determine fee buffer
 * @returns {number} Final advertised price
 */
export function calculateFinalPrice(blankCost, baseMarkup, feeSettings, paymentMethod = 'stripe') {
  if (!blankCost || !baseMarkup || !feeSettings) return 0;

  // Start with base cost + markup
  let basePrice = blankCost + baseMarkup;

  // Determine which fee buffer to use
  let feePercent = 0;
  let feeFixed = 0;

  if (paymentMethod === 'paypal') {
    feePercent = feeSettings.paypal_fee_buffer_percent || 4.0;
    feeFixed = feeSettings.paypal_fixed_fee_buffer || 0.5;
  } else {
    feePercent = feeSettings.stripe_fee_buffer_percent || 3.5;
    feeFixed = feeSettings.stripe_fixed_fee_buffer || 0.5;
  }

  // Add extra profit buffer if set
  const extraBufferPercent = feeSettings.additional_profit_buffer_percent || 0;

  // Calculate total percentage markup (payment fee + extra profit)
  const totalPercentageBuffer = (feePercent + extraBufferPercent) / 100;

  // Apply percentage and fixed fee buffers
  let finalPrice = basePrice * (1 + totalPercentageBuffer) + feeFixed;

  // Apply rounding rule
  const roundingMode = feeSettings.price_rounding_mode || 'nearest_99';

  if (roundingMode === 'nearest_99') {
    // Round to nearest .99 (e.g., 19.99, 29.99)
    finalPrice = Math.floor(finalPrice * 100) / 100 - 0.01;
    if (finalPrice < basePrice) finalPrice += 1.00;
  } else if (roundingMode === 'nearest_49') {
    // Round to nearest .49 (e.g., 19.49, 29.49)
    finalPrice = Math.floor(finalPrice * 100) / 100 - 0.51;
    if (finalPrice < basePrice) finalPrice += 1.00;
  } else if (roundingMode === 'whole_dollar') {
    // Round to nearest whole dollar
    finalPrice = Math.ceil(finalPrice);
  }
  // 'none' means no rounding

  return Math.max(finalPrice, basePrice + 0.01); // Always at least base + penny
}

/**
 * Get price breakdown for admin display
 */
export function getPriceBreakdown(blankCost, baseMarkup, finalPrice, feeSettings, paymentMethod = 'stripe') {
  const feePercent = paymentMethod === 'paypal' 
    ? (feeSettings.paypal_fee_buffer_percent || 4.0)
    : (feeSettings.stripe_fee_buffer_percent || 3.5);
  
  const feeFixed = paymentMethod === 'paypal'
    ? (feeSettings.paypal_fixed_fee_buffer || 0.5)
    : (feeSettings.stripe_fixed_fee_buffer || 0.5);

  const basePrice = blankCost + baseMarkup;
  const estimatedProcessingCost = (basePrice * (feePercent / 100)) + feeFixed;
  const estimatedProfit = finalPrice - blankCost - estimatedProcessingCost;

  return {
    blank_cost: blankCost,
    base_markup: baseMarkup,
    payment_fee_buffer: estimatedProcessingCost,
    final_advertised_price: finalPrice,
    estimated_processing_cost: estimatedProcessingCost,
    estimated_profit: estimatedProfit
  };
}