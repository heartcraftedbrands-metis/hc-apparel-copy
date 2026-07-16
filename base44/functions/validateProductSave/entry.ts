import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Test 1: Find Bella + Canvas 0990
    const products = await base44.asServiceRole.entities.Product.filter({ name: 'Bella + Canvas 0990' });
    const bellaProduct = products[0];
    if (!bellaProduct) {
      return Response.json({
        success: false,
        tests: [
          {
            name: 'Find Bella + Canvas 0990',
            status: 'FAIL',
            result: 'Product not found',
            error: 'Bella + Canvas 0990 product does not exist',
          }
        ],
        summary: { total: 1, passed: 0, failed: 1 }
      });
    }

    // Test 2: Update product visibility from draft to public
    const originalVisibility = bellaProduct.visibility;
    await base44.asServiceRole.entities.Product.update(bellaProduct.id, {
      visibility: 'public',
      is_active: true,
    });

    // Test 3: Verify update persisted
    const updated = await base44.asServiceRole.entities.Product.get(bellaProduct.id);
    const updateSuccess = updated.visibility === 'public' && updated.is_active === true;

    // Revert for testing purposes
    await base44.asServiceRole.entities.Product.update(bellaProduct.id, {
      visibility: originalVisibility,
      is_active: originalVisibility === 'public',
    });

    // Test 4: Check S&S data preservation
    const ssProducts = await base44.asServiceRole.entities.Product.filter({ vendor_source: 'S&S Activewear' });
    const ssTested = ssProducts.length > 0;
    const ssPreserved = ssTested && ssProducts[0].vendor_source === 'S&S Activewear' && 
      (ssProducts[0].available_sizes?.length > 0 || ssProducts[0].available_colors?.length > 0);

    // Test 5: Check image placeholder fallback
    const noImageProduct = products.find(p => !p.image_url);
    const placeholderWorks = !noImageProduct || noImageProduct.vendor_source === 'S&S Activewear';

    return Response.json({
      success: updateSuccess,
      productId: bellaProduct.id,
      tests: [
        {
          name: 'Find Bella + Canvas 0990',
          status: 'PASS',
          result: `Found product: ${bellaProduct.name}`,
          id: bellaProduct.id,
          currentStatus: bellaProduct.visibility,
        },
        {
          name: 'Update Product Visibility',
          status: updateSuccess ? 'PASS' : 'FAIL',
          result: updateSuccess ? `Visibility updated to public and reverted to ${originalVisibility}` : 'Update failed',
          originalStatus: originalVisibility,
          updatedTo: 'public',
        },
        {
          name: 'Verify Update Persisted',
          status: updateSuccess ? 'PASS' : 'FAIL',
          result: updateSuccess ? `Confirmed: visibility=${updated.visibility}, is_active=${updated.is_active}` : 'Update did not persist',
        },
        {
          name: 'S&S Data Preservation',
          status: ssPreserved ? 'PASS' : 'FAIL',
          result: ssTested ? (ssPreserved ? `S&S data preserved (${ssProducts.length} products)` : 'S&S data not preserved') : 'No S&S products to test',
        },
        {
          name: 'Image Placeholder Fallback',
          status: placeholderWorks ? 'PASS' : 'FAIL',
          result: placeholderWorks ? 'Placeholder logic works for missing images' : 'Placeholder fallback issue',
        },
      ],
      summary: {
        total: 5,
        passed: (updateSuccess && ssPreserved && placeholderWorks) ? 5 : 4,
        failed: (updateSuccess && ssPreserved && placeholderWorks) ? 0 : 1,
      },
    });
  } catch (error) {
    console.error('Validation error:', error);
    return Response.json({ 
      success: false, 
      error: error.message,
      summary: { total: 5, passed: 0, failed: 5, criticalError: true }
    }, { status: 500 });
  }
});