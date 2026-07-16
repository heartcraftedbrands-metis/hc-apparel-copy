import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Map product_type from GarmentCatalog to Product product_subtype enum
function mapSubtype(productType) {
  if (!productType) return 't_shirts';
  const pt = productType.toLowerCase();
  if (pt.includes('hoodie')) return 'hoodies';
  if (pt.includes('sweatshirt')) return 'sweatshirts';
  if (pt.includes('tank')) return 't_shirts';
  if (pt.includes('polo')) return 't_shirts';
  if (pt.includes('youth')) return 'kids_apparel';
  if (pt.includes('sport') || pt.includes('activewear')) return 't_shirts';
  return 't_shirts';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Optional: filter by source_file or import_date to only process newest rows
    const body = await req.json().catch(() => ({}));
    const { source_file } = body; // optional filter

    // Load all GarmentCatalog rows (paginated)
    const allGarments = [];
    let offset = 0;
    while (true) {
      const page = await base44.asServiceRole.entities.GarmentCatalog.filter({}, '-created_date', 500, offset);
      if (!page || page.length === 0) break;
      allGarments.push(...page);
      if (page.length < 500) break;
      offset += page.length;
    }

    // Filter to the specific source_file if provided, otherwise use all
    const garments = source_file
      ? allGarments.filter(g => g.source_file === source_file)
      : allGarments;

    if (garments.length === 0) {
      return Response.json({
        error: 'No garment rows found in GarmentCatalog.',
        hint: 'Import a CSV first using the Import CSV step.',
      }, { status: 400 });
    }

    // Group by brand + style_number + product_name (canonical group key)
    const groups = {};
    for (const g of garments) {
      const brand = (g.brand || '').trim();
      const styleNum = (g.style_number || '').trim();
      const name = (g.product_name || '').trim();
      if (!name) continue;
      // Key: brand|style_number|product_name
      const key = `${brand}|${styleNum}|${name}`;
      if (!groups[key]) {
        groups[key] = {
          product_name: name,
          brand,
          style_number: styleNum,
          material: g.material || '',
          product_type: g.product_type || '',
          variants: [],
          garment_ids: [],
        };
      }
      groups[key].variants.push({
        sku: g.sku || '',
        color: g.color || '',
        size: g.size || '',
        price: g.customer_price || 0,
        blank_cost: g.blank_cost || 0,
        inventory: g.inventory_qty || 0,
        image_url: g.image_url || '',
      });
      groups[key].garment_ids.push(g.id);
    }

    // Load current public products — we will NOT touch these
    const publicProds = await base44.asServiceRole.entities.Product.filter({ visibility: 'public' }, '-created_date', 200);
    const publicCount = publicProds.length;
    const publicNames = new Set(publicProds.map(p => p.name));

    // Load existing draft products by name for upsert
    const existingDrafts = await base44.asServiceRole.entities.Product.filter({ visibility: 'draft' }, '-created_date', 200);
    const existingDraftByKey = {};
    for (const p of existingDrafts) {
      const k = `${(p.vendor_source || '').trim()}|${(p.supplier_sku || '').trim()}|${p.name}`;
      existingDraftByKey[k] = p;
      // Also index by name alone as fallback
      if (!existingDraftByKey[p.name]) existingDraftByKey[p.name] = p;
    }

    const created = [];
    const updated = [];
    const errors = [];
    const missingImages = [];

    for (const [key, group] of Object.entries(groups)) {
      try {
        // Safety: never overwrite a public product
        if (publicNames.has(group.product_name)) {
          errors.push(`Skipped "${group.product_name}": already a public product — will not overwrite.`);
          continue;
        }

        // Derive product-level fields from variants
        const allColors = [...new Set(group.variants.map(v => v.color).filter(Boolean))];
        const allSizes = [...new Set(group.variants.map(v => v.size).filter(Boolean))];
        const sizePrices = group.variants
          .filter((v, i, arr) => arr.findIndex(x => x.size === v.size) === i && v.size)
          .map(v => ({ size: v.size, price: v.price }));

        // Pick best image: prefer a variant with an image
        const imageVariant = group.variants.find(v => v.image_url);
        const image_url = imageVariant?.image_url || '';
        const mockup_images = image_url ? [image_url] : [];

        // Base price: average of variant prices, fallback to first
        const avgPrice = group.variants.length > 0
          ? parseFloat((group.variants.reduce((s, v) => s + v.price, 0) / group.variants.length).toFixed(2))
          : 0;

        const blankCostAvg = group.variants.length > 0
          ? parseFloat((group.variants.reduce((s, v) => s + v.blank_cost, 0) / group.variants.length).toFixed(2))
          : 0;

        const totalStock = group.variants.reduce((s, v) => s + v.inventory, 0);

        const description = [
          group.brand,
          group.style_number,
          group.material ? `– ${group.material}` : '',
          group.product_type ? `| ${group.product_type}` : '',
        ].filter(Boolean).join(' ').trim();

        const skuList = group.variants.map(v => v.sku).filter(Boolean).join(', ');

        const payload = {
          name: group.product_name,
          description,
          price: avgPrice,
          product_type: 'physical',
          product_subtype: mapSubtype(group.product_type),
          visibility: 'draft',
          is_active: false,
          image_url,
          mockup_images,
          vendor_source: group.brand,
          supplier_sku: group.style_number,
          available_colors: allColors.map(c => ({ name: c, hex: '' })),
          available_sizes: allSizes,
          size_prices: sizePrices,
          stock: totalStock,
          blank_garment_cost: blankCostAvg,
          internal_notes: `Built from GarmentCatalog. SKUs: ${skuList}`,
        };

        // Track missing images
        if (!image_url) {
          missingImages.push(group.product_name);
        }

        // Upsert: check by brand|style_number|name key first, then name fallback
        const existing = existingDraftByKey[key] || existingDraftByKey[group.product_name];

        if (existing) {
          await base44.asServiceRole.entities.Product.update(existing.id, payload);
          updated.push(group.product_name);

          // Update garment catalog rows with draft_product_id
          for (const gid of group.garment_ids) {
            await base44.asServiceRole.entities.GarmentCatalog.update(gid, {
              draft_product_id: existing.id,
              draft_built_at: new Date().toISOString(),
            });
          }
        } else {
          const newProd = await base44.asServiceRole.entities.Product.create(payload);
          created.push(group.product_name);

          // Update garment catalog rows with draft_product_id
          if (newProd?.id) {
            for (const gid of group.garment_ids) {
              await base44.asServiceRole.entities.GarmentCatalog.update(gid, {
                draft_product_id: newProd.id,
                draft_built_at: new Date().toISOString(),
              });
            }
          }
        }
      } catch (err) {
        errors.push(`"${group.product_name}": ${err.message}`);
      }
    }

    // Final public product count — must not have changed
    const publicProdsAfter = await base44.asServiceRole.entities.Product.filter({ visibility: 'public' }, '-created_date', 200);
    const publicUnchanged = publicProdsAfter.length === publicCount;

    const totalVariants = Object.values(groups).reduce((s, g) => s + g.variants.length, 0);
    const productsBuilt = created.length + updated.length;

    return Response.json({
      success: true,
      draft_products_created: created.length,
      draft_products_updated: updated.length,
      products_built: productsBuilt,
      products_created_names: created,
      products_updated_names: updated,
      variants_grouped: totalVariants,
      products_missing_images: missingImages.length,
      missing_image_names: missingImages,
      products_ready_for_image_repair: missingImages.length,
      products_published: 0,
      public_products_before: publicCount,
      public_products_after: publicProdsAfter.length,
      public_products_unchanged: publicUnchanged,
      launch_qa_still_ready: publicUnchanged && productsBuilt > 0,
      errors,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});