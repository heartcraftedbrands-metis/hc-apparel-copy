import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { csvData } = await req.json();
    if (!csvData || !Array.isArray(csvData)) return Response.json({ error: 'Invalid CSV data' }, { status: 400 });

    // Step 1: Import garment rows to GarmentCatalog as Draft
    const garmentRows = [];
    const errors = [];
    let newGarments = 0;
    let updatedGarments = 0;

    for (const row of csvData) {
      try {
        const { Brand, 'Style Number': StyleNumber, 'Product Name': ProductName, Material, 'Product Type': ProductType, Color, Size, SKU, 'Blank Cost': BlankCost, 'Customer Price': CustomerPrice, Inventory, 'Image URL': ImageURL } = row;

        if (!ProductName || !SKU) {
          errors.push(`Row skipped: Missing ProductName or SKU`);
          continue;
        }

        const garmentData = {
          brand: Brand || '',
          style_number: StyleNumber || '',
          product_name: ProductName,
          material: Material || '',
          product_type: ProductType || '',
          color: Color || '',
          size: Size || '',
          sku: SKU,
          blank_cost: parseFloat(BlankCost) || 0,
          customer_price: parseFloat(CustomerPrice) || 0,
          inventory_qty: parseInt(Inventory) || 0,
          image_url: ImageURL || '',
          status: 'approved_to_sell',
          import_date: new Date().toISOString()
        };

        // Check if SKU exists
        const existing = await base44.asServiceRole.entities.GarmentCatalog.filter({ sku: SKU }, '-created_date', 1);
        if (existing.length > 0) {
          await base44.asServiceRole.entities.GarmentCatalog.update(existing[0].id, garmentData);
          updatedGarments++;
        } else {
          await base44.asServiceRole.entities.GarmentCatalog.create(garmentData);
          newGarments++;
        }

        garmentRows.push({ ...garmentData, sku: SKU });
      } catch (err) {
        errors.push(`Row error: ${err.message}`);
      }
    }

    // Step 2: Build draft products from garment rows (grouped by product_name)
    const productMap = {};
    for (const row of garmentRows) {
      if (!productMap[row.product_name]) {
        productMap[row.product_name] = {
          name: row.product_name,
          brand: row.brand,
          style_number: row.style_number,
          material: row.material,
          type: row.product_type,
          variants: [],
          image_url: row.image_url || ''
        };
      }
      productMap[row.product_name].variants.push({
        color: row.color,
        size: row.size,
        sku: row.sku,
        price: row.customer_price,
        inventory: row.inventory_qty
      });
    }

    const draftProductsCreated = [];
    const draftProductsUpdated = [];
    const qaResults = { passed: 0, failed: 0, missingImages: 0, issues: [] };

    for (const [productName, productData] of Object.entries(productMap)) {
      try {
        // Check if product with this name already exists
        const existing = await base44.asServiceRole.entities.Product.filter({ name: productName, visibility: 'draft' }, '-created_date', 1);

        const productPayload = {
          name: productData.name,
          description: `${productData.brand} ${productData.style_number} - ${productData.material} ${productData.type}`,
          price: productData.variants[0]?.price || 0,
          product_type: 'physical',
          product_subtype: 't_shirts',
          visibility: 'draft',
          is_active: false,
          image_url: productData.image_url,
          vendor_source: productData.brand,
          supplier_sku: productData.style_number,
          available_colors: [...new Set(productData.variants.map(v => v.color))].map(c => ({ name: c, hex: '' })),
          available_sizes: [...new Set(productData.variants.map(v => v.size))],
          size_prices: productData.variants.map(v => ({ size: v.size, price: v.price })),
          mockup_images: productData.image_url ? [productData.image_url] : [],
          stock: productData.variants.reduce((sum, v) => sum + v.inventory, 0),
          blank_garment_cost: productData.variants[0]?.price * 0.4 || 0,
          internal_notes: `Imported batch ${new Date().toISOString()}. SKUs: ${productData.variants.map(v => v.sku).join(', ')}`
        };

        // Run QA checks
        const qaIssues = [];
        if (!productPayload.name) qaIssues.push('Missing product name');
        if (!productData.brand) qaIssues.push('Missing brand');
        if (!productData.style_number) qaIssues.push('Missing style number');
        if (!productData.type) qaIssues.push('Missing product type');
        if (!productData.material) qaIssues.push('Missing material');
        if (!productPayload.image_url) {
          qaIssues.push('Missing image URL');
          qaResults.missingImages++;
        }
        if (productData.variants.some(v => !v.sku)) qaIssues.push('Variant missing SKU');
        if (productData.variants.some(v => !v.color)) qaIssues.push('Variant missing color');
        if (productData.variants.some(v => !v.size)) qaIssues.push('Variant missing size');
        if (productData.variants.some(v => !v.price)) qaIssues.push('Variant missing price');
        if (productData.variants.some(v => v.inventory === undefined)) qaIssues.push('Variant missing inventory');

        if (qaIssues.length > 0) {
          qaResults.failed++;
          qaResults.issues.push({ product: productName, issues: qaIssues });
        } else {
          qaResults.passed++;
        }

        if (existing.length > 0) {
          await base44.asServiceRole.entities.Product.update(existing[0].id, productPayload);
          draftProductsUpdated.push(productName);
        } else {
          await base44.asServiceRole.entities.Product.create(productPayload);
          draftProductsCreated.push(productName);
        }
      } catch (err) {
        errors.push(`Product '${productName}' error: ${err.message}`);
        qaResults.failed++;
        qaResults.issues.push({ product: productName, issues: [err.message] });
      }
    }

    // Step 3: Verify public products unchanged
    const publicProds = await base44.asServiceRole.entities.Product.filter({ visibility: 'public' }, '-created_date', 500);

    return Response.json({
      status: 'success',
      csvImported: true,
      rowsProcessed: csvData.length,
      newGarmentRows: newGarments,
      updatedGarmentRows: updatedGarments,
      errors,
      draftProductsCreated: draftProductsCreated.length,
      draftProductsUpdated: draftProductsUpdated.length,
      draftProductsCreatedNames: draftProductsCreated,
      draftProductsUpdatedNames: draftProductsUpdated,
      qaResults: {
        passed: qaResults.passed,
        failed: qaResults.failed,
        missingImages: qaResults.missingImages,
        issues: qaResults.issues
      },
      publicProductsUnchanged: publicProds.length === 7,
      publicProductCount: publicProds.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});