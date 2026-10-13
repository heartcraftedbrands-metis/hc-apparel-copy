export const DESIGN_LOCATION_GROUPS = ['Front', 'Back', 'Chest', 'Sleeves', 'Other'];

const lower = value => String(value || '').trim().toLowerCase();

export function getStudioAudience(product) {
  const identity = lower(`${product?.name || ''} ${product?.market_segment || ''} ${product?.age_group || ''}`);
  if (/\binfant|baby|onesie\b/.test(identity)) return 'infant';
  if (/\btoddler\b/.test(identity)) return 'toddler';
  if (/\byouth|kids?|boys?|girls?\b/.test(identity)) return 'youth';
  return 'adult';
}

export function designLocationIsCompatible(location, { product, method, placementState } = {}) {
  if (!location?.verified || !location?.surface_key || !product || !method) return false;
  const garment = lower(product.design_studio_garment_type);
  const audience = getStudioAudience(product);
  const garmentTypes = Array.isArray(location.applicable_garment_types) ? location.applicable_garment_types : [];
  const audiences = Array.isArray(location.applicable_audiences) ? location.applicable_audiences : [];
  const methods = Array.isArray(location.applicable_methods) ? location.applicable_methods : [];
  const methodSurfaces = Array.isArray(method.compatible_placements) ? method.compatible_placements : [];
  return (!garmentTypes.length || garmentTypes.includes(garment))
    && (!audiences.length || audiences.includes(audience))
    && (!methods.length || methods.includes(method.method_key))
    && (!methodSurfaces.length || methodSurfaces.includes(location.surface_key))
    && placementState?.[location.surface_key]?.enabled === true;
}

export function getActiveDesignLocation(document, locations = []) {
  const selected = document?.placementSelections?.[document?.activePlacement];
  if (!selected?.definitionId) return null;
  return locations.find(item => item.id === selected.definitionId && item.definition_version === selected.definitionVersion) || null;
}

export function selectDesignLocation(document, location) {
  if (!location?.id || !location?.surface_key) return document;
  const placementSelections = {
    ...(document.placementSelections || {}),
    [location.surface_key]: {
      definitionId: location.id,
      definitionVersion: location.definition_version,
      label: location.customer_label,
      group: location.customer_group,
      dimensionMode: location.dimension_mode,
      widthIn: location.width_in,
      heightIn: location.height_in,
      units: location.units || 'inches',
      anchorKey: location.anchor_key || null,
      instructions: location.placement_instructions || '',
      proofRequired: Boolean(location.proof_required),
      customInstructions: document.placementSelections?.[location.surface_key]?.definitionId === location.id
        ? String(document.placementSelections?.[location.surface_key]?.customInstructions || '') : '',
    },
  };
  const reviewRequired = Object.entries(document.placements || {}).some(([surface, items]) => Array.isArray(items) && items.length && !placementSelections[surface]?.definitionId);
  return {
    ...document,
    schemaVersion: Math.max(2, Number(document.schemaVersion || 1)),
    activePlacement: location.surface_key,
    placementDefinitionVersion: location.definition_version,
    legacyPlacementReviewRequired: reviewRequired,
    placementSelections,
    updatedAt: new Date().toISOString(),
  };
}

export function upgradeStudioDocument(document) {
  if (!document || typeof document !== 'object') return document;
  const hasArtwork = Object.values(document.placements || {}).some(items => Array.isArray(items) && items.length);
  const missingSelection = Object.entries(document.placements || {}).some(([surface, items]) => Array.isArray(items) && items.length && !document.placementSelections?.[surface]?.definitionId);
  return {
    ...document,
    schemaVersion: Math.max(2, Number(document.schemaVersion || 1)),
    placementSelections: document.placementSelections || {},
    placementDefinitionVersion: document.placementDefinitionVersion || null,
    legacyPlacementReviewRequired: Boolean(document.legacyPlacementReviewRequired || (hasArtwork && missingSelection)),
  };
}

export function designLocationSizingArea(location, calibratedArea = null) {
  if (Number(calibratedArea?.width_in) > 0 && Number(calibratedArea?.height_in) > 0) return calibratedArea;
  if (!(Number(location?.width_in) > 0 && Number(location?.height_in) > 0)) return null;
  return {
    width_in: Number(location.width_in),
    height_in: Number(location.height_in),
    min_dpi: 300,
    verified: false,
    approximate: true,
    sizing_source: 'official_location_limit',
    source_note: 'Official location dimensions; exact garment/color/size image calibration is still required before production.',
  };
}

export function designLocationPreviewArea(product, location, mappedArea = null) {
  if (mappedArea && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(Number(mappedArea[key])))) {
    return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(mappedArea[key])]));
  }
  const key = location?.anchor_key || '';
  const hoodie = /hoodie/.test(lower(product?.design_studio_garment_type));
  const positions = {
    upper_center: { x: 36, y: hoodie ? 25 : 20, width: 28, height: 24 },
    center_front: { x: 28, y: hoodie ? 27 : 22, width: 44, height: hoodie ? 36 : 56 },
    wearer_left_chest: { x: 29, y: hoodie ? 29 : 25, width: 19, height: 20 },
    wearer_right_chest: { x: 52, y: hoodie ? 29 : 25, width: 19, height: 20 },
    lower_center: { x: 27, y: 68, width: 46, height: 16 },
    lower_left: { x: 29, y: 65, width: 20, height: 20 },
    lower_right: { x: 51, y: 65, width: 20, height: 20 },
    pocket_center: { x: 39, y: 58, width: 22, height: 20 },
    sleeve: { x: 27, y: 25, width: 46, height: 55 },
    cuff: { x: 35, y: 70, width: 30, height: 17 },
    upper_back: { x: 27, y: hoodie ? 30 : 23, width: 46, height: 18 },
    center_back: { x: 28, y: hoodie ? 29 : 24, width: 44, height: hoodie ? 43 : 54 },
    back_left: { x: 28, y: 28, width: 25, height: 45 },
    back_right: { x: 47, y: 28, width: 25, height: 45 },
    hood_name_drop: { x: 30, y: 31, width: 40, height: 12 },
    hood: { x: 39, y: 12, width: 22, height: 18 },
  };
  return positions[key] || (location?.view_side === 'back'
    ? { x: 28, y: hoodie ? 29 : 24, width: 44, height: hoodie ? 43 : 54 }
    : { x: 28, y: hoodie ? 27 : 22, width: 44, height: hoodie ? 36 : 56 });
}

export function rotatedElementBounds(element) {
  const x = Number(element?.x || 0), y = Number(element?.y || 0);
  const width = Number(element?.width || 0), height = Number(element?.height || 0);
  const radians = Math.abs(Number(element?.rotation || 0)) * Math.PI / 180;
  const rotatedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
  const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
  const centerX = x + width / 2, centerY = y + height / 2;
  return { x: centerX - rotatedWidth / 2, y: centerY - rotatedHeight / 2, width: rotatedWidth, height: rotatedHeight };
}
