export const DTF_LIVE_PURCHASES = true;
export const DTF_PRICING_APPROVED = true;
export const DTF_PRICING_APPROVED_AT = '2026-10-20T12:00:00-04:00';
export const DTF_PORTAL_URL = 'https://www.ssactivewear.com/ps/ninja_transfers';
export const DTF_FREE_FREIGHT_THRESHOLD = 200;
export const DTF_FULFILLMENT = Object.freeze({
  source: 'ss_ninja_dropship',
  shipsFrom: 'Ninja Transfers East/West production network through S&S',
  destination: 'The shipping address entered on the S&S order',
  combinesWithEligibleSS: true,
});
export const DTF_TIERS = [
  { min: 1, max: 14, factor: 1 }, { min: 15, max: 49, factor: .9 },
  { min: 50, max: 99, factor: .8 }, { min: 100, max: 249, factor: .7 },
  { min: 250, max: Infinity, factor: .62 },
];
export const referenceCosts = [
  { size: '2 × 2', area: 4, costs: [.35,.30,.26,.22,.19] },
  { size: '3 × 3', area: 9, costs: [.54,.49,.44,.40,.36] },
  { size: '4 × 4', area: 16, costs: [.95,.87,.77,.66,.56] },
  { size: '5.12 × 3.41', area: 17.46, costs: [.99,.90,.80,.70,.62] },
  { size: '6 × 6', area: 36, costs: [2.12,1.84,1.62,1.39,1.15] },
  { size: '8 × 8', area: 64, costs: [3.76,3.45,3.03,2.60,2.16] },
  { size: '10 × 10', area: 100, costs: [5.87,5.32,4.66,4.00,3.34] },
  { size: '11 × 14', area: 154, costs: [9.04,8.29,7.25,6.22,5.18] },
  { size: '12 × 8', area: 96, costs: [5.69,5.09,4.49,3.84,3.18] },
  { size: '12 × 17', area: 204, costs: [11.98,9.92,8.68,7.45,6.20] },
];
export const stripeFee = amount => amount * .029 + .30;
export const proposedRetail = cost => Math.ceil(((cost * 1.18 + .30) / .971) * 100) / 100;
export function tierIndex(qty) { return DTF_TIERS.findIndex(t => qty >= t.min && qty <= t.max); }
export function interpolateSupplierCost(width, height, qty, precut=false) {
  const area = width * height; const row = [...referenceCosts].sort((a,b)=>Math.abs(a.area-area)-Math.abs(b.area-area))[0];
  const base = row.costs[Math.max(0,tierIndex(qty))] * area / row.area;
  return Math.round((base + (precut ? .30 : 0)) * 100) / 100;
}
export function validateArtwork(file, width, height) {
  const issues=[]; const ext=(file?.name?.split('.').pop()||'').toLowerCase();
  if (!['png','jpg','jpeg','ai','pdf','eps','tif','tiff'].includes(ext)) issues.push('Use PNG, JPG, JPEG, AI, PDF, EPS, TIF, or TIFF.');
  if (file && file.size > 100*1024*1024) issues.push('Artwork must be 100 MB or smaller.');
  if (width <= 0 || height <= 0) issues.push('Enter valid transfer dimensions.');
  return issues;
}

/**
 * Verified transfer freight policy. Supplier subtotal means S&S wholesale
 * merchandise value, never HC Apparel retail. Garments and transfers placed in
 * the same S&S order are evaluated once so freight is not double-counted.
 */
export function quoteDtfShipping({ transferSupplierSubtotal=0, eligibleSsGarmentSupplierSubtotal=0, allItemsFreightEligible=false } = {}) {
  const transfer = Math.max(0, Number(transferSupplierSubtotal) || 0);
  const garments = Math.max(0, Number(eligibleSsGarmentSupplierSubtotal) || 0);
  const combinedSupplierSubtotal = Math.round((transfer + garments) * 100) / 100;
  if (allItemsFreightEligible === true && combinedSupplierSubtotal >= DTF_FREE_FREIGHT_THRESHOLD) {
    return {
      status: 'verified',
      customerCharge: 0,
      combinedSupplierSubtotal,
      rule: 'Verified S&S free freight',
      fulfillmentLegsCharged: 0,
    };
  }
  return {
    status: 'supplier_quote_required',
    customerCharge: null,
    combinedSupplierSubtotal,
    rule: 'Authenticated S&S transfer-cart freight quote required',
    fulfillmentLegsCharged: 1,
  };
}
