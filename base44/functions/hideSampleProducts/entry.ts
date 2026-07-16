import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const { product_ids } = await req.json();
    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return Response.json({ error: 'Missing product_ids array' }, { status: 400 });
    }

    // Hide each product
    const updated = [];
    for (const id of product_ids) {
      try {
        await base44.asServiceRole.entities.Product.update(id, { visibility: 'hidden' });
        updated.push(id);
      } catch (err) {
        console.error(`Failed to hide product ${id}:`, err.message);
      }
    }

    return Response.json({
      message: `Hidden ${updated.length} sample products`,
      hidden_ids: updated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});