import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find or create the product
    let product = null;
    const products = await base44.entities.Product.filter({ name: 'Bella + Canvas 0990' });
    
    if (products.length > 0) {
      product = products[0];
      console.log(`Found existing product: ${product.id}`);
    } else {
      // Create new product
      product = await base44.entities.Product.create({
        name: 'Bella + Canvas 0990',
        product_type: 'physical',
        product_subtype: 'apparel_blanks',
        category: 'apparel_blanks',
        categories: ['apparel_blanks'],
        description: 'Premium Bella + Canvas blank apparel option, ready for everyday wear, brand projects, or custom printing.',
        shipping_note: 'Availability, colors, and sizes may depend on current vendor stock. Final fulfillment is confirmed after order review.',
        vendor_source: 'S&S Activewear',
        visibility: 'draft',
        price: 8.99,
        stock: 0,
        is_active: true,
      });
      console.log(`Created new product: ${product.id}`);
    }

    // Gather S&S variants to extract colors and sizes
    const ssCatalog = await base44.entities.SSCatalogItem.filter({
      style_number: '0990',
      brand: 'BELLA + CANVAS',
    });

    if (ssCatalog.length === 0) {
      return Response.json({
        success: false,
        message: 'No S&S catalog items found for BELLA + CANVAS 0990',
        productId: product.id,
      });
    }

    // Extract unique colors and sizes from variants
    const colors = new Map();
    const sizes = new Set();

    ssCatalog.forEach(item => {
      if (item.color) {
        colors.set(item.color.toLowerCase(), {
          name: item.color,
          hex: '#999999', // Default gray; could be enhanced with actual color values
        });
      }
      if (item.size) {
        sizes.add(item.size);
      }
    });

    // Update product with colors and sizes
    await base44.entities.Product.update(product.id, {
      available_colors: Array.from(colors.values()),
      available_sizes: Array.from(sizes).sort(),
    });

    return Response.json({
      success: true,
      productId: product.id,
      name: 'Bella + Canvas 0990',
      colors: Array.from(colors.keys()),
      sizes: Array.from(sizes),
      status: 'draft',
      message: 'S&S product prepared for testing. Status: Draft (not yet public)',
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});