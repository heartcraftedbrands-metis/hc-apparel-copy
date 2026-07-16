import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { parent_group_id } = body;

    if (!parent_group_id) {
      return Response.json({ error: 'parent_group_id required' }, { status: 400 });
    }

    // Get parent and all variants
    const parentItem = await base44.asServiceRole.entities.SSCatalogItem.get(parent_group_id);
    if (!parentItem) {
      return Response.json({ error: 'Parent group not found' }, { status: 404 });
    }

    const groupKey = `${parentItem.brand || ''}${parentItem.style_number || ''}`;
    const allItems = await base44.asServiceRole.entities.SSCatalogItem.list('-created_date', 5000);
    const variants = allItems.filter(item => 
      (item.brand === parentItem.brand && item.style_number === parentItem.style_number) ||
      item.parent_group_id === parent_group_id
    );

    // Collect variant data
    const availableSizes = [...new Set(variants.map(v => v.size).filter(Boolean))];
    const availableColors = [...new Set(variants.map(v => v.color).filter(Boolean))];
    const sizePrices = [];

    variants.forEach(v => {
      if (v.size && !sizePrices.find(sp => sp.size === v.size)) {
        sizePrices.push({
          size: v.size,
          price: v.public_price || 0
        });
      }
    });

    // Create parent product
    const productData = {
      name: parentItem.product_name || `${parentItem.brand} ${parentItem.style_number}`,
      description: parentItem.description || `${parentItem.brand} style ${parentItem.style_number}`,
      price: Math.min(...variants.map(v => v.public_price || 0)),
      product_type: 'physical',
      product_subtype: 'apparel_blanks',
      visibility: 'draft',
      image_url: parentItem.image_url || '',
      available_sizes: availableSizes,
      available_colors: availableColors.map(color => ({ name: color, hex: '' })),
      size_prices: sizePrices,
      vendor_source: 'S&S Activewear',
      vendor_cost: 0,
      blank_garment_cost: Math.min(...variants.map(v => v.blank_cost || 0)),
      supplier_sku: parentItem.sku || '',
      internal_notes: `Product group: ${groupKey}. Created from S&S import. Contains ${variants.length} variants.`
    };

    const createdProduct = await base44.asServiceRole.entities.Product.create(productData);

    // Update all variants to link to product
    for (const variant of variants) {
      await base44.asServiceRole.entities.SSCatalogItem.update(variant.id, {
        linked_product_id: createdProduct.id,
        catalog_status: 'added_to_shop'
      });
    }

    // Update parent to track linked product
    await base44.asServiceRole.entities.SSCatalogItem.update(parent_group_id, {
      linked_product_id: createdProduct.id,
      catalog_status: 'added_to_shop'
    });

    return Response.json({
      success: true,
      product_id: createdProduct.id,
      product_name: productData.name,
      variant_count: variants.length,
      status: 'Draft'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});