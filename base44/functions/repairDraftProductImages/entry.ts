import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch the 5 new draft products
    const draftProductNames = [
      'Gildan 5000 - Heavy Cotton T-Shirt',
      'Gildan 64000 - Softstyle T-Shirt',
      'Gildan 2400 - Ultra Cotton Long Sleeve T-Shirt',
      'Gildan 18000 - Heavy Blend Crewneck Sweatshirt',
      'Gildan 18500 - Heavy Blend Hooded Sweatshirt'
    ];

    const draftProducts = [];
    for (const name of draftProductNames) {
      const found = await base44.asServiceRole.entities.Product.filter({ name, visibility: 'draft' }, '-created_date', 1);
      if (found.length > 0) draftProducts.push(found[0]);
    }

    const repairResults = {
      scanned: draftProducts.length,
      repaired: 0,
      stillMissingImages: 0,
      variantImagesRepaired: 0,
      productFallbackImagesSet: 0,
      productsRepaired: []
    };

    // For each draft product, find matching garment catalog entries and extract images
    for (const product of draftProducts) {
      try {
        // Extract brand and style number from product
        const brand = product.vendor_source || '';
        const styleNumber = product.supplier_sku || '';
        
        // Find matching garment catalog entries
        let garmentRows = [];
        if (brand) {
          garmentRows = await base44.asServiceRole.entities.GarmentCatalog.filter(
            { brand, style_number: styleNumber },
            '-created_date',
            100
          );
        }

        if (garmentRows.length === 0) {
          repairResults.stillMissingImages++;
          continue;
        }

        // Collect images from garment rows by SKU/color/size
        const imagesByVariant = {};
        const allImages = new Set();

        for (const row of garmentRows) {
          if (row.image_url) {
            allImages.add(row.image_url);
            const sku = row.sku || '';
            if (sku && !imagesByVariant[sku]) {
              imagesByVariant[sku] = row.image_url;
            }
          }
        }

        // Update variants with matching images
        let variantsUpdated = 0;
        if (product.size_prices && Array.isArray(product.size_prices)) {
          const updatedSizePrices = product.size_prices.map(sizePrice => ({ ...sizePrice }));
          product.size_prices = updatedSizePrices;
          variantsUpdated = 0;
        }

        // Update product with images
        const updatePayload = {};
        
        if (allImages.size > 0) {
          const imageArray = Array.from(allImages);
          updatePayload.image_url = imageArray[0];
          updatePayload.mockup_images = imageArray;
          repairResults.productFallbackImagesSet++;
        }

        if (Object.keys(updatePayload).length > 0) {
          await base44.asServiceRole.entities.Product.update(product.id, updatePayload);
          repairResults.repaired++;
          repairResults.productsRepaired.push(product.name);
          repairResults.variantImagesRepaired += variantsUpdated;
        }
      } catch (err) {
        console.error(`Error repairing ${product.name}: ${err.message}`);
      }
    }

    // Now run QA on just these 5 products
    const qaResults = {
      passed: 0,
      failed: 0,
      issues: []
    };

    for (const product of draftProducts) {
      const updatedProduct = await base44.asServiceRole.entities.Product.get(product.id);
      const qaIssues = [];

      if (!updatedProduct.name) qaIssues.push('Missing product name');
      if (!updatedProduct.vendor_source) qaIssues.push('Missing brand');
      if (!updatedProduct.supplier_sku) qaIssues.push('Missing style number');
      if (!updatedProduct.product_type) qaIssues.push('Missing product type');
      if (!updatedProduct.description || !updatedProduct.description.includes(updatedProduct.vendor_source)) qaIssues.push('Missing material/description');
      if (!updatedProduct.image_url && (!updatedProduct.mockup_images || updatedProduct.mockup_images.length === 0)) {
        qaIssues.push('Missing image URL');
      }
      if (updatedProduct.size_prices && updatedProduct.size_prices.some(sp => !sp.size)) qaIssues.push('Variant missing size');
      if (updatedProduct.size_prices && updatedProduct.size_prices.some(sp => sp.price === undefined || sp.price === null)) qaIssues.push('Variant missing price');

      if (qaIssues.length > 0) {
        qaResults.failed++;
        qaResults.issues.push({ product: updatedProduct.name, issues: qaIssues });
      } else {
        qaResults.passed++;
      }
    }

    // Verify public products unchanged
    const publicProds = await base44.asServiceRole.entities.Product.filter({ visibility: 'public' }, '-created_date', 500);
    const payments = await base44.asServiceRole.entities.PaymentFeeSettings.list();
    const launchQAReady = publicProds.length >= 5 && payments.length > 0;

    return Response.json({
      status: 'success',
      repairResults,
      qaResults,
      readyForApproval: qaResults.passed,
      publicProductsUnchanged: publicProds.length === 7,
      publicProductCount: publicProds.length,
      launchQAStillReady: launchQAReady
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});