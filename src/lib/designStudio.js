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

export const ARTWORK_OUTPUT_PPI = 300;

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
  sizeUnit: 'inches',
  aspectRatioLocked: true,
  intendedWidthIn: null,
  intendedHeightIn: null,
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
  if (element.type !== 'image' || !element.pixelWidth) return null;
  const size = artworkSizeInches(element, printArea);
  if (!size.width || !size.height) return null;
  return Math.floor(Math.min(Number(element.pixelWidth) / size.width, Number(element.pixelHeight || element.pixelWidth) / size.height) + 1e-9);
};

export const normalizeArtworkUnit = unit => unit === 'pixels' ? 'pixels' : 'inches';

export function artworkSizeInches(element, printArea = null) {
  const enteredWidth = Number(element?.intendedWidthIn || 0);
  const enteredHeight = Number(element?.intendedHeightIn || 0);
  if (enteredWidth > 0 && enteredHeight > 0) return { width: enteredWidth, height: enteredHeight, source: 'selected' };
  if (Number(printArea?.width_in) > 0 && Number(printArea?.height_in) > 0) {
    return {
      width: (Number(element?.width || 0) / 100) * Number(printArea.width_in),
      height: (Number(element?.height || 0) / 100) * Number(printArea.height_in),
      source: printArea?.verified ? 'calibrated' : 'approximate_preview',
    };
  }
  return { width: null, height: null, source: 'missing' };
}

export function artworkSizeForUnit(element, printArea = null, targetPpi = ARTWORK_OUTPUT_PPI) {
  const size = artworkSizeInches(element, printArea);
  const unit = normalizeArtworkUnit(element?.sizeUnit);
  const multiplier = unit === 'pixels' ? Number(targetPpi || ARTWORK_OUTPUT_PPI) : 1;
  return {
    unit,
    width: size.width ? size.width * multiplier : null,
    height: size.height ? size.height * multiplier : null,
    source: size.source,
  };
}

const sourceAspectRatio = element => {
  const intendedWidth = Number(element?.intendedWidthIn || 0);
  const intendedHeight = Number(element?.intendedHeightIn || 0);
  if (intendedWidth > 0 && intendedHeight > 0) return intendedWidth / intendedHeight;
  const pixelWidth = Number(element?.pixelWidth || 0);
  const pixelHeight = Number(element?.pixelHeight || 0);
  if (pixelWidth > 0 && pixelHeight > 0) return pixelWidth / pixelHeight;
  const previewWidth = Number(element?.width || 0);
  const previewHeight = Number(element?.height || 0);
  return previewWidth > 0 && previewHeight > 0 ? previewWidth / previewHeight : 1;
};

export function updateArtworkDimension(element, axis, rawValue, unit = element?.sizeUnit, printArea = null, targetPpi = ARTWORK_OUTPUT_PPI) {
  const normalizedUnit = normalizeArtworkUnit(unit);
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    return { sizeUnit: normalizedUnit };
  }
  const nextInches = normalizedUnit === 'pixels' ? value / Number(targetPpi || ARTWORK_OUTPUT_PPI) : value;
  const current = artworkSizeInches(element, printArea);
  const ratio = sourceAspectRatio(element);
  const locked = element?.aspectRatioLocked !== false;
  const widthIn = axis === 'width' ? nextInches : locked ? nextInches * ratio : current.width;
  const heightIn = axis === 'height' ? nextInches : locked ? nextInches / ratio : current.height;
  const patch = {
    sizeUnit: normalizedUnit,
    intendedWidthIn: widthIn || null,
    intendedHeightIn: heightIn || null,
    aspectRatioLocked: locked,
  };

  if (Number(printArea?.width_in) > 0 && Number(printArea?.height_in) > 0) {
    if (widthIn) patch.width = Math.max(1, (widthIn / Number(printArea.width_in)) * 100);
    if (heightIn) patch.height = Math.max(1, (heightIn / Number(printArea.height_in)) * 100);
    if (patch.width <= 100) patch.x = Math.max(0, Math.min(Number(element.x || 0), 100 - patch.width));
    if (patch.height <= 100) patch.y = Math.max(0, Math.min(Number(element.y || 0), 100 - patch.height));
  } else if (current.width && current.height) {
    if (widthIn) patch.width = Math.max(1, Math.min(100, Number(element.width || 1) * (widthIn / current.width)));
    if (heightIn) patch.height = Math.max(1, Math.min(100, Number(element.height || 1) * (heightIn / current.height)));
  }
  return patch;
}

export function initializeArtworkSizing(element, printArea = null) {
  if (!element) return element;
  const areaWidth = Number(printArea?.width_in || 0);
  const areaHeight = Number(printArea?.height_in || 0);
  if (!(areaWidth > 0 && areaHeight > 0)) return element;

  let widthIn = Number(element.intendedWidthIn || 0);
  let heightIn = Number(element.intendedHeightIn || 0);
  const ratio = sourceAspectRatio(element);
  if (!(widthIn > 0 && heightIn > 0)) {
    widthIn = Math.max(.01, (Number(element.width || 0) / 100) * areaWidth);
    heightIn = element.aspectRatioLocked === false
      ? Math.max(.01, (Number(element.height || 0) / 100) * areaHeight)
      : Math.max(.01, widthIn / Math.max(.0001, ratio));
  }

  const width = Math.max(1, (widthIn / areaWidth) * 100);
  const height = Math.max(1, (heightIn / areaHeight) * 100);
  return {
    ...element,
    sizeUnit: normalizeArtworkUnit(element.sizeUnit),
    aspectRatioLocked: element.aspectRatioLocked !== false,
    intendedWidthIn: widthIn,
    intendedHeightIn: heightIn,
    width,
    height,
    x: width <= 100 ? Math.max(0, Math.min(Number(element.x || 0), 100 - width)) : Number(element.x || 0),
    y: height <= 100 ? Math.max(0, Math.min(Number(element.y || 0), 100 - height)) : Number(element.y || 0),
  };
}

export function synchronizeArtworkResize(element, nextWidthPercent, nextHeightPercent, printArea = null) {
  const current = artworkSizeInches(element, printArea);
  const widthRatio = Number(element?.width) > 0 ? Number(nextWidthPercent) / Number(element.width) : 1;
  const heightRatio = Number(element?.height) > 0 ? Number(nextHeightPercent) / Number(element.height) : 1;
  return {
    width: nextWidthPercent,
    height: nextHeightPercent,
    ...(current.width && current.height ? {
      intendedWidthIn: current.width * widthRatio,
      intendedHeightIn: current.height * heightRatio,
    } : {}),
  };
}

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
  const size = artworkSizeInches(element, printArea);
  const intendedWidth = Number(size.width || 0);
  const intendedHeight = Number(size.height || 0);
  const maxWidth = pixelsWide > 0 ? pixelsWide / Number(targetPpi || 300) : null;
  const maxHeight = pixelsHigh > 0 ? pixelsHigh / Number(targetPpi || 300) : null;
  if (!pixelsWide || !pixelsHigh) return { state: 'unknown', label: 'Resolution unavailable', effectivePpi: null, maxWidth, maxHeight, intendedWidth, intendedHeight };
  if (!intendedWidth || !intendedHeight) {
    return { state: 'needs_size', label: 'Enter print size to check resolution.', effectivePpi: null, effectivePpiX: null, effectivePpiY: null, maxWidth, maxHeight, intendedWidth, intendedHeight };
  }
  const effectivePpiX = Math.floor((pixelsWide / intendedWidth) + 1e-9);
  const effectivePpiY = Math.floor((pixelsHigh / intendedHeight) + 1e-9);
  const effectivePpi = Math.min(effectivePpiX, effectivePpiY);
  return {
    state: effectivePpi >= Number(targetPpi || 300) ? 'good' : 'low',
    label: effectivePpi >= Number(targetPpi || 300)
      ? 'Meets 300-DPI minimum.'
      : 'Below 300-DPI minimum—reduce print size or upload higher-resolution artwork.',
    effectivePpi, effectivePpiX, effectivePpiY, maxWidth, maxHeight, intendedWidth, intendedHeight,
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
    const requiredDpi = Math.max(ARTWORK_OUTPUT_PPI, Number(printArea.min_dpi || ARTWORK_OUTPUT_PPI));
    if (dpi != null && dpi < requiredDpi) {
      warnings.push({ code: 'low_resolution', level: 'blocker', elementId: element.id, message: `${element.name || 'Artwork'} is ${dpi} DPI at the selected print size. Minimum resolution is ${requiredDpi} DPI; reduce print size or upload higher-resolution artwork.` });
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
  return { past: [], present: cloneDocument(initial), future: [], interactionStart: null };
}

export function historyReducer(state, action) {
  if (action.type === 'begin_interaction') {
    return state.interactionStart ? state : { ...state, interactionStart: cloneDocument(state.present) };
  }
  if (action.type === 'transient') {
    return { ...state, present: cloneDocument(action.value), future: [] };
  }
  if (action.type === 'commit_interaction') {
    if (!state.interactionStart) return state;
    if (JSON.stringify(state.interactionStart) === JSON.stringify(state.present)) return { ...state, interactionStart: null };
    return { past: [...state.past.slice(-49), state.interactionStart], present: state.present, future: [], interactionStart: null };
  }
  if (action.type === 'set') {
    const next = cloneDocument(action.value);
    if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
    return { past: [...state.past.slice(-49), state.present], present: next, future: [], interactionStart: null };
  }
  if (action.type === 'replace') return createHistory(action.value);
  if (action.type === 'undo' && state.past.length) {
    return { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future], interactionStart: null };
  }
  if (action.type === 'redo' && state.future.length) {
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1), interactionStart: null };
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
