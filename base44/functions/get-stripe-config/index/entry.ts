Deno.serve(async (req) => {
  return Response.json({
    publishableKey: Deno.env.get("STRIPE_PUBLISHABLE_KEY"),
  });
});