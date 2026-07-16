import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const orderData = await req.json();

    if (!orderData.customer_email || !orderData.customer_name || !orderData.order_items?.length) {
      return Response.json({ error: 'Missing required order fields' }, { status: 400 });
    }

    // Ensure order_items include size and color if present
    const order_items = orderData.order_items.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      product_type: item.product_type,
      quantity: item.quantity,
      price: item.price,
      size: item.size || '',
      color: item.color || '',
      file_url: item.file_url || ''
    }));

    // Use service role so guests (unauthenticated users) can place orders
    const order = await base44.asServiceRole.entities.Order.create({
      ...orderData,
      order_items
    });

    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});