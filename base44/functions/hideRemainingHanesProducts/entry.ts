import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Hide the 2 Hanes products by ID
    const hanesIds = [
      '69dd0f3d0e68e8e1677960eb', // Hanes - Unisex Beefy-T® T-Shirt - 5180
      '69dd0f02684b8f1d4f1172f0', // Hanes - Unisex Beefy-T® Retro Street T-Shirt - 5180R
    ];

    const hidden = [];

    for (const id of hanesIds) {
      const product = await base44.asServiceRole.entities.Product.get(id);
      if (product) {
        await base44.asServiceRole.entities.Product.update(id, {
          visibility: 'hidden',
        });
        hidden.push({ id, name: product.name });
      }
    }

    return Response.json({
      status: 'success',
      hidden: hidden.length,
      hiddenProducts: hidden,
      message: `${hidden.length} Hanes products hidden from public storefront.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});