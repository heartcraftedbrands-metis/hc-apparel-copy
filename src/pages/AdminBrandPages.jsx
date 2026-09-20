import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { BRAND_PAGES } from '@/lib/brandPages';
import { CATEGORY_FILTERS } from '@/lib/shopGarmentFilters';

const maxBytes = 8 * 1024 * 1024;

export default function AdminBrandPages() {
  const [pages, setPages] = useState(BRAND_PAGES);
  const [selected, setSelected] = useState(BRAND_PAGES[0].slug);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [catalogResult, setCatalogResult] = useState(null);
  useEffect(() => {
    document.title = 'Admin Brand Pages | HC Apparel';
    supabase.from('brand_pages').select('*').then(({ data, error: loadError }) => {
      if (loadError) { setError('Brand settings could not be loaded. Check the brand pages migration.'); return; }
      const saved = new Map((data || []).map(page => [page.slug, page]));
      setPages(BRAND_PAGES.map(page => ({ ...page, ...saved.get(page.slug) })));
    });
  }, []);
  const page = pages.find(item => item.slug === selected);
  const update = patch => setPages(items => items.map(item => item.slug === selected ? { ...item, ...patch } : item));
  const upload = async (kind, file) => {
    if (!file) return;
    setError(''); setMessage('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > maxBytes) {
      setError('Use a PNG, JPG, or WEBP image under 8 MB.'); return;
    }
    setBusy(true);
    try {
      const path = `brand-pages/${selected}/${kind}-${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error: uploadError } = await supabase.storage.from('storefront-assets').upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('storefront-assets').getPublicUrl(path);
      update({ [kind === 'hero' ? 'hero_image_url' : 'logo_url']: data.publicUrl });
      setMessage('Image uploaded. Save Changes to publish this brand-page setting.');
    } catch { setError('Image upload failed. Check admin access and try again.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    const payload = {
      slug: page.slug, name: page.name.trim(), tagline: page.tagline.trim(), description: page.description.trim(),
      hero_image_url: page.hero_image_url || null, logo_url: page.logo_url || null,
      categories: page.categories, is_active: page.is_active !== false, sort_order: Number(page.sort_order) || 0,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase.from('brand_pages').upsert(payload, { onConflict: 'slug' });
    setBusy(false);
    if (saveError) setError('Brand page could not be saved. Check admin access and try again.');
    else setMessage('Brand page saved.');
  };
  const vendorAction = async action => {
    setBusy(true); setError(''); setMessage('');
    const { data, error: actionError } = await supabase.functions.invoke('ss-activewear', {
      body: { action, brand: page.name, ...(action === 'sync_brand_products' && catalogResult?.import_session_id ? { style_session_id: catalogResult.import_session_id } : {}) },
    });
    setBusy(false);
    if (actionError || data?.error) setError(data?.error || 'Private vendor catalog staging failed. No storefront products changed.');
    else {
      setCatalogResult(data);
      setMessage(action === 'stage_brand_styles'
        ? `${data.staged_styles} ${page.name} styles staged privately. No products published.`
        : action === 'sync_brand_products'
          ? `${data.skus} SKU variants staged privately. Review before any product import or publication.`
          : `${data.private_drafts} private ${page.name} drafts reviewed; ${data.ready_for_private_qa} ready for private QA.`);
    }
  };
  return <main className="min-h-screen bg-[#f8f5ed] px-4 py-10"><div className="mx-auto max-w-6xl">
    <Link to="/AdminDashboard" className="text-sm text-primary underline">← Admin Dashboard</Link>
    <h1 className="mt-3 text-3xl font-black">Admin Brand Pages</h1>
    <p className="mt-2 text-sm text-muted-foreground">Manage brand presentation only. Product visibility and pricing are handled separately.</p>
    <div className="mt-8 grid gap-5 md:grid-cols-[240px_1fr]">
      <nav aria-label="Brands" className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible">{[...pages].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => <button key={item.slug} type="button" onClick={() => { setSelected(item.slug); setError(''); setMessage(''); }} className={`shrink-0 rounded-lg border px-4 py-3 text-left text-sm font-semibold ${selected === item.slug ? 'bg-primary text-white' : 'bg-white'}`}>{item.name}</button>)}</nav>
      {page && <div className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Brand name<input value={page.name} onChange={event => update({ name: event.target.value })} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
          <label className="text-sm font-semibold">Sort order<input type="number" value={page.sort_order || 0} onChange={event => update({ sort_order: event.target.value })} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
        </div>
        <label className="mt-4 block text-sm font-semibold">Tagline<input value={page.tagline} onChange={event => update({ tagline: event.target.value })} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
        <label className="mt-4 block text-sm font-semibold">Description<textarea value={page.description} onChange={event => update({ description: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={page.is_active !== false} onChange={event => update({ is_active: event.target.checked })} /> Show brand page</label>
        <div className="mt-6"><p className="text-sm font-semibold">Category shortcuts</p><div className="mt-2 flex flex-wrap gap-2">{CATEGORY_FILTERS.slice(1).map(item => <label key={item.value} className="rounded-full border px-3 py-1.5 text-xs"><input type="checkbox" className="mr-2" checked={page.categories?.includes(item.value) || false} onChange={event => update({ categories: event.target.checked ? [...(page.categories || []), item.value] : (page.categories || []).filter(value => value !== item.value) })} />{item.label}</label>)}</div></div>
        <div className="mt-7 grid gap-5 sm:grid-cols-2">{[['hero', 'Hero image', page.hero_image_url], ['logo', 'Brand logo', page.logo_url || page.logo]].map(([kind, label, url]) => <div key={kind} className="min-w-0 rounded-xl border p-4"><p className="mb-3 text-sm font-semibold">{label}</p><div className="flex h-36 items-center justify-center overflow-hidden rounded-lg bg-[#eee9dd]">{url ? <img src={url} alt={`${page.name} ${label.toLowerCase()}`} className="max-h-full max-w-full object-contain" /> : <span className="text-sm font-bold">{page.name}</span>}</div><input aria-label={`Upload ${label.toLowerCase()}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => upload(kind, event.target.files?.[0])} className="mt-3 w-full text-xs" /><button type="button" onClick={() => update({ [kind === 'hero' ? 'hero_image_url' : 'logo_url']: null, ...(kind === 'logo' ? { logo: null } : {}) })} className="mt-2 text-xs text-red-700 underline">Remove custom image</button></div>)}</div>
        <div className="mt-7 flex flex-wrap gap-3"><button type="button" onClick={save} disabled={busy} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Working…' : 'Save Changes'}</button><Link to={`/brand/${page.slug}`} className="rounded-lg border px-5 py-2.5 text-sm font-bold">Preview Page</Link></div>
        {['Comfort Colors', 'DRI DUCK', 'Champion'].includes(page.name) && <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold">Private S&S catalog staging</h2><p className="mt-1 text-sm text-muted-foreground">Fetch real styles and SKU variants for {page.name}. This does not create or publish products, change prices, or submit orders.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => vendorAction('stage_brand_styles')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Stage focused styles</button><button type="button" disabled={busy || !catalogResult?.import_session_id} onClick={() => vendorAction('sync_brand_products')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Fetch SKU details</button><button type="button" disabled={busy} onClick={() => vendorAction('get_brand_draft_report')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Review private drafts</button></div>{catalogResult?.style_summaries && <p className="mt-3 text-xs text-muted-foreground">{catalogResult.style_summaries.length} styles checked · {catalogResult.style_summaries.filter(style => style.image_available && style.stocked_variants > 0 && style.minimum_vendor_cost > 0).length} have images, inventory, and current vendor cost.</p>}{catalogResult?.products && <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{catalogResult.products.map(product => <div key={product.id} className="rounded-lg border bg-white p-3 text-xs"><p className="font-bold">{product.name} · {product.style_number}</p><p>{product.sku_variants} SKUs · {product.colors} colors · {product.sizes} sizes · ${Number(product.public_price).toFixed(2)} · {product.inventory} units</p><p className={product.ready_for_private_qa ? 'text-green-700' : 'text-red-700'}>{product.ready_for_private_qa ? 'Ready for private QA' : product.blockers.join(' · ')}</p></div>)}</div>}</div>}
      </div>}
    </div>
  </div></main>;
}
