export const DESIGN_PLACEMENTS = [
  ['front', 'Front'],
  ['back', 'Back'],
  ['left_chest', "Wearer's left chest"],
  ['right_chest', "Wearer's right chest"],
  ['left_sleeve', "Wearer's left sleeve"],
  ['right_sleeve', "Wearer's right sleeve"],
];

export const ACTIVE_PRODUCTION_ROUTES = [
  ['hc_transfer_press', 'HC blank + transfer / pressing'],
  ['outside_print_vendor', 'Approved outside printing vendor'],
  ['printify', 'Printify backup fulfillment'],
  ['hc_in_house', 'Future HC in-house production'],
];

export const DECORATION_METHODS = [
  ['dtf', 'DTF'],
  ['soft_vinyl', 'Soft Vinyl'],
  ['puff_vinyl', 'Puff Vinyl'],
  ['glitter_vinyl', 'Glitter Vinyl'],
  ['flock_vinyl', 'Flock Vinyl'],
  ['embroidery', 'Embroidery'],
  ['dtg', 'DTG'],
];

export const STUDIO_FONTS = [
  'Arial', 'Georgia', 'Trebuchet MS', 'Verdana', 'Courier New', 'Times New Roman',
];

export const createStudioDocument = (overrides = {}) => ({
  schemaVersion: 1,
  name: 'Untitled design',
  productId: '',
  productName: '',
  productBrand: '',
  productStyle: '',
  garmentType: '',
  productSku: '',
  variantId: '',
  productImage: '',
  mockupViews: {},
  color: '',
  size: '',
  quantity: 1,
  productionRoute: 'hc_transfer_press',
  printMethod: 'dtf',
  decorationMethod: 'dtf',
  activePlacement: 'front',
  placements: Object.fromEntries(DESIGN_PLACEMENTS.map(([key]) => [key, []])),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const makeElement = (type, overrides = {}) => ({
  id: crypto.randomUUID(),
  type,
  name: type === 'text' ? 'Text' : type === 'image' ? 'Artwork' : 'Shape',
  x: 25,
  y: 25,
  width: 50,
  height: type === 'text' ? 16 : 50,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  groupId: null,
  fill: '#4b1236',
  text: type === 'text' ? 'Your text' : '',
  fontFamily: 'Arial',
  fontWeight: 700,
  curve: 0,
  shape: type === 'shape' ? 'rectangle' : null,
  ...overrides,
});

export const cloneDocument = value => JSON.parse(JSON.stringify(value));

export const updatePlacement = (document, placement, updater) => ({
  ...document,
  placements: {
    ...document.placements,
    [placement]: updater(document.placements?.[placement] || []),
  },
  updatedAt: new Date().toISOString(),
});

export const effectiveDpi = (element, printArea) => {
  if (element.type !== 'image' || !element.pixelWidth || !printArea?.width_in) return null;
  const physicalWidth = Math.max(0.01, (Number(element.width) / 100) * Number(printArea.width_in));
  return Math.round(Number(element.pixelWidth) / physicalWidth);
};

export function artworkQualityReport(element, printArea = null, targetPpi = 300) {
  if (element?.type !== 'image') return null;
  const isVector = element.fileKind === 'svg' || element.mimeType === 'image/svg+xml';
  if (isVector && !element.containsEmbeddedRaster) {
    return {
      state: 'vector', label: 'Vector artwork', effectivePpi: null,
      message: 'Vector paths scale without raster-resolution loss. Vinyl cutting and embroidery readiness still require separate production review.',
    };
  }
  const pixelsWide = Number(element.pixelWidth || 0);
  const pixelsHigh = Number(element.pixelHeight || 0);
  const calibratedWidth = printArea?.verified && Number(printArea.width_in) > 0
    ? (Number(element.width || 0) / 100) * Number(printArea.width_in) : 0;
  const calibratedHeight = printArea?.verified && Number(printArea.height_in) > 0
    ? (Number(element.height || 0) / 100) * Number(printArea.height_in) : 0;
  const intendedWidth = calibratedWidth || Number(element.intendedWidthIn || 0);
  const intendedHeight = calibratedHeight || Number(element.intendedHeightIn || 0);
  const maxWidth = pixelsWide > 0 ? pixelsWide / Number(targetPpi || 300) : null;
  const maxHeight = pixelsHigh > 0 ? pixelsHigh / Number(targetPpi || 300) : null;
  if (!pixelsWide || !pixelsHigh) return { state: 'unknown', label: 'Resolution unavailable', effectivePpi: null, maxWidth, maxHeight, intendedWidth, intendedHeight };
  if (!intendedWidth || !intendedHeight) {
    return { state: 'needs_size', label: 'Enter print size to check quality', effectivePpi: null, maxWidth, maxHeight, intendedWidth, intendedHeight };
  }
  const effectivePpi = Math.floor(Math.min(pixelsWide / intendedWidth, pixelsHigh / intendedHeight));
  return {
    state: effectivePpi >= Number(targetPpi || 300) ? 'good' : 'low',
    label: effectivePpi >= Number(targetPpi || 300) ? 'Good resolution' : 'Low resolution',
    effectivePpi, maxWidth, maxHeight, intendedWidth, intendedHeight,
    message: effectivePpi >= Number(targetPpi || 300)
      ? `About ${effectivePpi} PPI at the intended print size.`
      : `About ${effectivePpi} PPI at the intended print size. Upscaling does not restore missing detail.`,
  };
}

export function validatePlacement(elements, printArea) {
  const warnings = [];
  if (!printArea?.verified || !printArea?.width_in || !printArea?.height_in) {
    return [{ code: 'print_area_unverified', level: 'blocker', message: 'Verified physical print dimensions are required for this product, size, method, provider, and location.' }];
  }
  for (const element of elements || []) {
    if (!element.visible) continue;
    if (element.x < 0 || element.y < 0 || element.x + element.width > 100 || element.y + element.height > 100) {
      warnings.push({ code: 'outside_print_area', level: 'blocker', elementId: element.id, message: `${element.name || 'Artwork'} extends outside the printable area.` });
    }
    const dpi = effectiveDpi(element, printArea);
    if (dpi != null && dpi < Number(printArea.min_dpi || 150)) {
      warnings.push({ code: 'low_resolution', level: 'warning', elementId: element.id, message: `${element.name || 'Artwork'} is about ${dpi} DPI at this size; ${printArea.min_dpi || 150} DPI is required.` });
    }
  }
  return warnings;
}

export function validateDesign(document, printAreas = []) {
  const warnings = [];
  if (!document.productId) warnings.push({ code: 'product_missing', level: 'blocker', message: 'Choose an eligible garment.' });
  if (!document.color || !document.size) warnings.push({ code: 'variant_missing', level: 'blocker', message: 'Choose a color and size.' });
  if (Number(document.quantity) < 1) warnings.push({ code: 'quantity_invalid', level: 'blocker', message: 'Quantity must be at least one.' });
  Object.entries(document.placements || {}).forEach(([placement, elements]) => {
    if (!(elements || []).length) return;
    const area = printAreas.find(item => item.placement === placement);
    warnings.push(...validatePlacement(elements, area).map(item => ({ ...item, placement })));
  });
  if (!Object.values(document.placements || {}).some(elements => elements?.length)) {
    warnings.push({ code: 'artwork_missing', level: 'blocker', message: 'Add artwork, text, or a shape to at least one placement.' });
  }
  return warnings;
}

export const isRestrictedCustomizationProduct = product => {
  const brand = String(product?.brand || product?.name || '').toLowerCase();
  const restrictedBrand = brand.includes('columbia') || brand.includes('champion');
  return restrictedBrand
    || product?.customization_restricted === true
    || product?.customization_eligible === false;
};

export function calculateStudioPricing({ route, garmentRetail = 0, printingCharge = 0, quantity = 1, supplierProductionCost = null, supplierShipping = null, supplierTax = null, fees = null, packaging = null }) {
  const count = Math.max(1, Number(quantity) || 1);
  const retailMerchandise = Number(garmentRetail || 0) * count;
  const printCharge = Number(printingCharge || 0) * count;
  const customerMerchandise = route === 'printify' ? retailMerchandise : retailMerchandise + printCharge;
  const knownCosts = route === 'printify'
    ? [supplierProductionCost, supplierShipping, supplierTax, fees]
    : [supplierProductionCost, packaging, fees];
  const costsComplete = knownCosts.every(value => value !== null && value !== undefined && value !== '');
  const estimatedCost = knownCosts.reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    garmentRetail: retailMerchandise,
    printingCharge: route === 'printify' ? 0 : printCharge,
    customerMerchandise,
    estimatedKnownCost: estimatedCost,
    estimatedContribution: costsComplete ? customerMerchandise - estimatedCost : null,
    costsComplete,
  };
}

export function calculatePrintingCharge(document, configs = [], packages = []) {
  if (document?.productionRoute === 'printify') return { unit: 0, configured: true, placements: [] };
  const usedPlacements = Object.entries(document?.placements || {})
    .filter(([, elements]) => (elements || []).some(element => element.visible !== false))
    .map(([placement]) => placement);
  const method = document?.decorationMethod || document?.printMethod;
  const remaining = new Set(usedPlacements);
  const packageMatches = (packages || []).filter(item => item.active !== false && item.method_key === method)
    .map(item => ({ ...item, placementList: Array.isArray(item.placements) ? item.placements : [] }))
    .filter(item => item.placementList.length > 1 && item.placementList.every(placement => remaining.has(placement)))
    .sort((a, b) => b.placementList.length - a.placementList.length);
  const appliedPackages = [];
  for (const item of packageMatches) {
    if (!item.placementList.every(placement => remaining.has(placement))) continue;
    item.placementList.forEach(placement => remaining.delete(placement));
    appliedPackages.push(item);
  }
  const remainingPlacements = usedPlacements.filter(placement => remaining.has(placement));
  const matches = remainingPlacements.map(placement => {
    const candidates = (configs || []).filter(item => item.active
      && item.production_route === document?.productionRoute
      && (!item.product_id || item.product_id === document?.productId)
      && (!item.print_method || item.print_method === method)
      && item.placement === placement);
    return candidates.sort((a, b) => Number(Boolean(b.product_id)) - Number(Boolean(a.product_id)))[0] || null;
  });
  return {
    unit: appliedPackages.reduce((sum, item) => sum + Number(item.service_price || 0), 0)
      + matches.reduce((sum, item) => sum + Number(item?.service_price || 0), 0),
    configured: usedPlacements.length > 0 && matches.every(item => item && item.service_price !== null && item.service_price !== undefined),
    placements: remainingPlacements.map((placement, index) => ({ placement, config: matches[index] })),
    packages: appliedPackages,
  };
}

const GUEST_KEY = 'hc_design_studio_guest_draft_v1';
export const saveGuestDraft = document => localStorage.setItem(GUEST_KEY, JSON.stringify({ document, savedAt: new Date().toISOString() }));
export const loadGuestDraft = () => {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || 'null'); } catch { return null; }
};
export const clearGuestDraft = () => localStorage.removeItem(GUEST_KEY);

export function createHistory(initial) {
  return { past: [], present: cloneDocument(initial), future: [] };
}

export function historyReducer(state, action) {
  if (action.type === 'set') {
    const next = cloneDocument(action.value);
    if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
    return { past: [...state.past.slice(-49), state.present], present: next, future: [] };
  }
  if (action.type === 'replace') return createHistory(action.value);
  if (action.type === 'undo' && state.past.length) {
    return { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] };
  }
  if (action.type === 'redo' && state.future.length) {
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  }
  return state;
}

export function normalizedFileKind(bytes, mime = '') {
  const isPng = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const isJpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const prefix = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 512))).trim().toLowerCase();
  const isSvg = prefix.startsWith('<svg') || prefix.startsWith('<?xml') && prefix.includes('<svg');
  if (isPng && (!mime || mime === 'image/png')) return 'png';
  if (isJpeg && (!mime || ['image/jpeg', 'image/jpg'].includes(mime))) return 'jpg';
  if (isSvg && (!mime || ['image/svg+xml', 'text/xml'].includes(mime))) return 'svg';
  return null;
}

export function containsUnsafeSvg(svg) {
  return /<\s*(script|foreignObject|iframe|object|embed|audio|video)|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i.test(svg);
}
