/**
 * Groups SSCatalogItem records by Brand + Style Number + Product Name.
 * Each group becomes a "parent product" with variants (color/size/sku rows).
 */
export function groupSSItems(items) {
  const map = new Map();

  for (const item of items) {
    const key = [
      (item.brand || '').trim().toLowerCase(),
      (item.style_number || '').trim().toLowerCase(),
      (item.product_name || '').trim().toLowerCase(),
    ].join('|||');

    if (!map.has(key)) {
      map.set(key, {
        key,
        brand: item.brand || '',
        style_number: item.style_number || '',
        product_name: item.product_name || '',
        product_category: item.product_category || '',
        vendor: item.vendor || 'S&S Activewear',
        import_batch: item.import_batch || '',
        // representative image — first row that has one
        image_url: item.image_url || '',
        variants: [],
      });
    }

    const group = map.get(key);
    // Use first available image
    if (!group.image_url && item.image_url) group.image_url = item.image_url;
    group.variants.push(item);
  }

  // Compute aggregates
  return Array.from(map.values()).map(g => {
    const costs = g.variants.map(v => v.blank_cost || 0).filter(c => c > 0);
    const inv = g.variants.reduce((sum, v) => sum + (v.inventory_qty || 0), 0);
    const colors = [...new Set(g.variants.map(v => v.color).filter(Boolean))];
    const sizes = [...new Set(g.variants.map(v => v.size).filter(Boolean))];

    // Group status: if any variant is added_to_shop → added_to_shop, else majority status
    const statusCounts = {};
    g.variants.forEach(v => { statusCounts[v.catalog_status] = (statusCounts[v.catalog_status] || 0) + 1; });
    const dominantStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'vendor_catalog_only';

    return {
      ...g,
      colors,
      sizes,
      total_inventory: inv,
      min_blank_cost: costs.length ? Math.min(...costs) : 0,
      max_blank_cost: costs.length ? Math.max(...costs) : 0,
      catalog_status: statusCounts['added_to_shop'] ? 'added_to_shop' : dominantStatus,
      variant_count: g.variants.length,
    };
  }).sort((a, b) => {
    const ba = (a.brand || '').localeCompare(b.brand || '');
    if (ba !== 0) return ba;
    return (a.style_number || '').localeCompare(b.style_number || '');
  });
}