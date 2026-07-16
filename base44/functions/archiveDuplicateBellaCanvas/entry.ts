import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Archive the messy BELLA + CANVAS 0990 duplicate (ID: 6a397f8de0b410a426c230ec)
    await base44.entities.Product.update('6a397f8de0b410a426c230ec', {
      visibility: 'hidden',
      internal_notes: '[SYSTEM] Duplicate archived - cleaner version kept as "Bella + Canvas 0990" with 2 colors and 3 sizes',
    });

    return Response.json({
      success: true,
      message: 'Messy duplicate BELLA + CANVAS 0990 ($34.11) archived. Keeping clean version ($8.99).',
      archivedId: '6a397f8de0b410a426c230ec',
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});