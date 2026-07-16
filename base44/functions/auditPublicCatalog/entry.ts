import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    // Get all products
    const allProducts = await base44.asServiceRole.entities.Product.list('-created_date', 200);
    
    // Filter public vs hidden
    const publicProducts = allProducts.filter(p => p.visibility === 'public' && p.is_active);
    const hiddenProducts = allProducts.filter(p => p.visibility !== 'public' || !p.is_active);
    
    // Detailed analysis
    const publicWithImages = publicProducts.filter(p => p.image_url);
    const publicWithoutImages = publicProducts.filter(p => !p.image_url);
    const publicWithCheckout = publicProducts.filter(p => {
      const hasColors = (p.available_colors || []).length > 0;
      const hasSizes = (p.available_sizes || []).length > 0 || (p.size_prices || []).length > 0;
      return hasColors && hasSizes && p.price > 0;
    });
    
    // Identify sample/demo products in public (should not be there)
    const sampleNames = ['HC Classic Tee', 'HC Premium Hoodie', 'Custom Print Tee Package', 'red sneaker'];
    const publicSamples = publicProducts.filter(p => {
      const nameLower = (p.name || '').toLowerCase();
      return sampleNames.some(s => nameLower.includes(s.toLowerCase())) || 
             (!p.vendor_source || p.vendor_source === 'Sample') ||
             (p.internal_notes && p.internal_notes.toLowerCase().includes('demo'));
    });
    
    // Launch blocking issues
    const blockingIssues = [];
    if (publicWithoutImages.length > 0) {
      blockingIssues.push(`${publicWithoutImages.length} public products missing images`);
    }
    if (publicWithCheckout.length < publicProducts.length) {
      blockingIssues.push(`${publicProducts.length - publicWithCheckout.length} public products not checkout-ready`);
    }
    if (publicSamples.length > 0) {
      blockingIssues.push(`${publicSamples.length} sample/demo products showing publicly`);
    }
    
    return Response.json({
      summary: {
        totalPublic: publicProducts.length,
        totalHidden: hiddenProducts.length,
        withImages: publicWithImages.length,
        withoutImages: publicWithoutImages.length,
        checkoutReady: publicWithCheckout.length,
        samplesPublic: publicSamples.length,
        blockingIssues: blockingIssues,
        readyForLaunch: blockingIssues.length === 0,
      },
      sampleProducts: publicSamples.map(p => ({
        id: p.id,
        name: p.name,
        vendor: p.vendor_source,
        image: p.image_url,
      })),
      productsWithoutImages: publicWithoutImages.map(p => ({
        id: p.id,
        name: p.name,
        vendor: p.vendor_source,
      })),
      notCheckoutReady: publicProducts.filter(p => {
        const hasColors = (p.available_colors || []).length > 0;
        const hasSizes = (p.available_sizes || []).length > 0 || (p.size_prices || []).length > 0;
        return !(hasColors && hasSizes && p.price > 0);
      }).map(p => ({
        id: p.id,
        name: p.name,
        hasColors: (p.available_colors || []).length > 0,
        hasSizes: (p.available_sizes || []).length > 0 || (p.size_prices || []).length > 0,
        price: p.price,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});