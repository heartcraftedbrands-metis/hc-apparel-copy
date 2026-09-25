import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { BRAND_PAGES, defaultBrandPage, normalizeBrandName } from '@/lib/brandPages';
import { filterPublicProducts } from '@/lib/productVisibility';
import { CATEGORY_FILTERS, getProductBrand } from '@/lib/shopGarmentFilters';

const maxBytes = 8 * 1024 * 1024;
const HERO_WIDTH = 1600;
const HERO_HEIGHT = 900;
const HERO_POSITIONS = [
  ['center center', 'Center Center'],
  ['center top', 'Center Top'],
  ['center bottom', 'Center Bottom'],
  ['left center', 'Left Center'],
  ['right center', 'Right Center'],
];

function HeroPreview({ image, name, position, fit = 'cover', mobile = false }) {
  return <div className={mobile ? 'mx-auto w-[180px]' : 'w-full'}>
    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{mobile ? 'Mobile hero preview' : 'Desktop hero preview'}</p>
    <div className={`${mobile && fit === 'contain' ? 'aspect-[4/5]' : 'aspect-video'} overflow-hidden rounded-lg border ${fit === 'contain' ? 'bg-[#efebeb]' : 'bg-[#25331a]'}`}>
      {image ? <img src={image} alt={`${name} ${mobile ? 'mobile' : 'desktop'} hero preview`} className="h-full w-full" style={{ objectFit: fit, objectPosition: position }} /> : <div className="flex h-full items-center justify-center px-3 text-center text-sm font-bold text-white">{name}</div>}
    </div>
  </div>;
}

export default function AdminBrandPages() {
  const [pages, setPages] = useState(BRAND_PAGES);
  const [selected, setSelected] = useState(BRAND_PAGES[0].slug);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [catalogResult, setCatalogResult] = useState(null);
  useEffect(() => {
    document.title = 'Admin Brand Pages | HC Apparel';
    Promise.all([
      supabase.from('brand_pages').select('*'),
      base44.entities.Product.list('-created_date'),
    ]).then(([{ data, error: loadError }, catalog]) => {
      if (loadError) setError('Saved brand settings could not be loaded. Catalog defaults remain available.');
      const saved = new Map((data || []).map(item => [item.slug, item]));
      const publicProducts = filterPublicProducts(catalog || []);
      const counts = new Map();
      publicProducts.forEach(product => {
        const name = getProductBrand(product);
        if (!name) return;
        const key = normalizeBrandName(name);
        counts.set(key, { name, count: (counts.get(key)?.count || 0) + 1 });
      });
      const names = new Map(BRAND_PAGES.map(item => [normalizeBrandName(item.name), item.name]));
      counts.forEach((value, key) => names.set(key, value.name));
      const merged = [...names.entries()].map(([key, name]) => {
        const defaults = defaultBrandPage(name);
        const persisted = saved.get(defaults.slug);
        const productCount = counts.get(key)?.count || 0;
        const configStatus = productCount === 0
          ? 'No public products'
          : !persisted
            ? 'Missing config'
            : !(persisted.hero_image_url || defaults.hero_image_url)
              ? 'Missing hero'
              : 'Ready';
        return {
          ...defaults,
          ...(persisted || {}),
          product_count: productCount,
          config_status: configStatus,
          route_status: productCount > 0 ? 'Ready' : 'No public products',
          has_saved_config: Boolean(persisted),
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      setPages(merged);
      setSelected(current => merged.some(item => item.slug === current) ? current : merged[0]?.slug);
    }).catch(() => setError('Brand catalog status could not be loaded. Please refresh.'));
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
      hero_object_position: page.hero_object_position || 'center center',
      hero_mobile_object_position: page.hero_mobile_object_position || null,
      hero_image_fit: page.hero_image_fit === 'contain' ? 'contain' : 'cover',
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
          : action === 'get_champion_winter_candidate_report'
            ? `${data.winter_candidates} Champion winter candidates reviewed; ${data.ready_for_private_import} pass private-import checks.`
          : action === 'get_american_apparel_fall_winter_candidate_report'
            ? `${data.winter_candidates} American Apparel fall/winter candidates reviewed; ${data.ready_for_private_import} pass private-import checks.`
            : action === 'import_champion_winter_drafts'
              ? `${data.imported_private_drafts} Champion winter products imported as private drafts. Nothing was published.`
            : action === 'import_american_apparel_fall_winter_drafts'
              ? `${data.imported_private_drafts} American Apparel fall/winter products imported as private drafts. Nothing was published.`
              : action === 'get_next_level_candidate_report'
                ? `${data.winter_candidates} Next Level products reviewed; ${data.ready_for_private_import} pass current image, inventory, SKU, price, MAP, and margin checks.`
              : action === 'import_next_level_live_products'
                ? `${data.published} qualifying Next Level products published after authenticated S&S and pricing QA.`
              : action === 'get_adidas_candidate_report'
                ? `${data.winter_candidates} Adidas products reviewed; ${data.ready_for_private_import} pass current image, inventory, SKU, price, MAP, and margin checks.`
              : action === 'audit_adidas_pricing'
                ? `${data.products_audited} live Adidas products audited against current S&S cost, explicit MAP, MSRP, pricing rules, and payment floors. No prices changed.`
              : action === 'import_adidas_live_products'
                ? `${data.published} qualifying Adidas products published after authenticated S&S and pricing QA.`
              : action === 'mark_champion_winter_qa_ready'
                ? `${data.ready_for_admin_approval} Champion winter drafts marked Ready for Admin Approval. Nothing was published.`
              : action === 'mark_american_apparel_fall_winter_qa_ready'
                ? `${data.ready_for_admin_approval} American Apparel fall/winter drafts marked Ready for Admin Approval. Nothing was published.`
          : `${data.private_drafts} private ${page.name} drafts reviewed; ${data.ready_for_private_qa} ready for private QA.`);
    }
  };
  return <main className="min-h-screen bg-[#f8f5ed] px-4 py-10"><div className="mx-auto max-w-6xl">
    <Link to="/AdminDashboard" className="text-sm text-primary underline">← Admin Dashboard</Link>
    <h1 className="mt-3 text-3xl font-black">Admin Brand Pages</h1>
    <p className="mt-2 text-sm text-muted-foreground">Manage brand presentation only. Product visibility and pricing are handled separately.</p>
    <div className="mt-8 grid gap-5 md:grid-cols-[240px_1fr]">
      <nav aria-label="Brands" className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible">{[...pages].sort((a, b) => a.name.localeCompare(b.name)).map(item => <button key={item.slug} type="button" onClick={() => { setSelected(item.slug); setError(''); setMessage(''); }} className={`shrink-0 rounded-lg border px-4 py-3 text-left text-sm font-semibold ${selected === item.slug ? 'bg-primary text-white' : 'bg-white'}`}><span className="block">{item.name}</span><span className={`mt-1 block text-[10px] ${selected === item.slug ? 'text-white/75' : item.config_status === 'Ready' ? 'text-green-700' : 'text-amber-700'}`}>{item.config_status}</span></button>)}</nav>
      {page && <div className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        <div className="mb-5 grid gap-3 rounded-xl border bg-[#faf8f1] p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="block text-xs text-muted-foreground">Slug</span><strong>{page.slug}</strong></div>
          <div><span className="block text-xs text-muted-foreground">Public products</span><strong>{page.product_count || 0}</strong></div>
          <div><span className="block text-xs text-muted-foreground">Configuration</span><strong>{page.config_status}</strong></div>
          <div><span className="block text-xs text-muted-foreground">Route status</span><strong>{page.route_status}</strong></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Brand name<input value={page.name} onChange={event => update({ name: event.target.value })} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
          <label className="text-sm font-semibold">Sort order<input type="number" value={page.sort_order || 0} onChange={event => update({ sort_order: event.target.value })} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
        </div>
        <label className="mt-4 block text-sm font-semibold">Tagline<input value={page.tagline} onChange={event => update({ tagline: event.target.value })} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
        <label className="mt-4 block text-sm font-semibold">Description<textarea value={page.description} onChange={event => update({ description: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={page.is_active !== false} onChange={event => update({ is_active: event.target.checked })} /> Show brand page</label>
        <div className="mt-6"><p className="text-sm font-semibold">Category shortcuts</p><div className="mt-2 flex flex-wrap gap-2">{CATEGORY_FILTERS.slice(1).map(item => <label key={item.value} className="rounded-full border px-3 py-1.5 text-xs"><input type="checkbox" className="mr-2" checked={page.categories?.includes(item.value) || false} onChange={event => update({ categories: event.target.checked ? [...(page.categories || []), item.value] : (page.categories || []).filter(value => value !== item.value) })} />{item.label}</label>)}</div></div>
        <section className="mt-7 rounded-xl border bg-[#faf8f1] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-bold">{page.name} hero image</h2><p className="mt-1 text-sm text-muted-foreground">Upload or replace the wide editorial image shown at the top of this brand page.</p></div>
            <div className="rounded-lg bg-white px-3 py-2 text-xs leading-5 shadow-sm"><strong>Recommended Brand Hero Image Size:</strong> {HERO_WIDTH} × {HERO_HEIGHT} px<br /><strong>Aspect Ratio:</strong> 16:9<br /><strong>Format:</strong> JPG or WEBP</div>
          </div>
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Safe area:</strong> Keep faces, logos, and important subjects inside the center safe zone. Use this size for best desktop and mobile cropping.</p>
          <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
            <HeroPreview image={page.hero_image_url} name={page.name} position={page.hero_object_position || 'center center'} fit={page.hero_image_fit || 'cover'} />
            <HeroPreview image={page.hero_image_url} name={page.name} position={page.hero_mobile_object_position || page.hero_object_position || 'center center'} fit={page.hero_image_fit || 'cover'} mobile />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Upload / replace {page.name} hero image<input aria-label={`Upload ${page.name} hero image`} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => upload('hero', event.target.files?.[0])} className="mt-2 block w-full text-xs font-normal" /></label>
            <label className="text-sm font-semibold">Image fit<select value={page.hero_image_fit || 'cover'} onChange={event => update({ hero_image_fit: event.target.value })} className="mt-1 block w-full rounded-lg border bg-white p-2 font-normal"><option value="cover">Cover frame (cropped)</option><option value="contain">Show full garment</option></select></label>
            <label className="text-sm font-semibold">Desktop focal position<select value={page.hero_object_position || 'center center'} onChange={event => update({ hero_object_position: event.target.value })} className="mt-1 block w-full rounded-lg border bg-white p-2 font-normal">{HERO_POSITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm font-semibold">Mobile focal position<select value={page.hero_mobile_object_position || page.hero_object_position || 'center center'} onChange={event => update({ hero_mobile_object_position: event.target.value })} className="mt-1 block w-full rounded-lg border bg-white p-2 font-normal">{HERO_POSITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <button type="button" onClick={() => update({ hero_image_url: null })} className="mt-3 text-xs font-semibold text-red-700 underline">Remove hero image</button>
        </section>
        <section className="mt-5 rounded-xl border p-4 sm:p-5">
          <h2 className="font-bold">Brand logo</h2><p className="mt-1 text-sm text-muted-foreground">Upload a transparent PNG, JPG, or WEBP. Logos use object-fit contain and are never stretched.</p>
          <div className="mt-4 flex h-36 items-center justify-center overflow-hidden rounded-lg bg-[#eee9dd] p-4">{page.logo_url || page.logo ? <img src={page.logo_url || page.logo} alt={`${page.name} logo preview`} className="max-h-full max-w-full object-contain" /> : <span className="text-xl font-black">{page.name}</span>}</div>
          <label className="mt-4 block text-sm font-semibold">Upload / replace brand logo<input aria-label="Upload brand logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => upload('logo', event.target.files?.[0])} className="mt-2 block w-full text-xs font-normal" /></label>
          <button type="button" onClick={() => update({ logo_url: null, logo: null })} className="mt-3 text-xs font-semibold text-red-700 underline">Remove brand logo</button>
        </section>
        <div className="mt-7 flex flex-wrap gap-3"><button type="button" onClick={save} disabled={busy} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Working…' : 'Save Changes'}</button><Link to={`/brand/${page.slug}`} className="rounded-lg border px-5 py-2.5 text-sm font-bold">Preview Page</Link></div>
        {['Comfort Colors', 'DRI DUCK', 'Champion', 'American Apparel', 'Next Level', 'adidas'].includes(page.name) && <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold">Authenticated S&S catalog staging</h2><p className="mt-1 text-sm text-muted-foreground">Fetch current styles and SKU variants for {page.name}. Staging and review do not submit vendor orders.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => vendorAction('stage_brand_styles')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Stage focused styles</button><button type="button" disabled={busy || !catalogResult?.import_session_id} onClick={() => vendorAction('sync_brand_products')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Fetch SKU details</button>{page.name === 'Champion' && <><button type="button" disabled={busy} onClick={() => vendorAction('get_champion_winter_candidate_report')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Review winter candidates</button><button type="button" disabled={busy || !catalogResult?.products?.some(product => product.ready_for_private_import)} onClick={() => vendorAction('import_champion_winter_drafts')} className="rounded-lg border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">Import passing winter drafts</button><button type="button" disabled={busy} onClick={() => vendorAction('mark_champion_winter_qa_ready')} className="rounded-lg border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">Mark winter QA ready for approval</button></>}{page.name === 'American Apparel' && <><button type="button" disabled={busy} onClick={() => vendorAction('get_american_apparel_fall_winter_candidate_report')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Review fall/winter candidates</button><button type="button" disabled={busy || !catalogResult?.products?.some(product => product.ready_for_private_import)} onClick={() => vendorAction('import_american_apparel_fall_winter_drafts')} className="rounded-lg border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">Import passing fall/winter drafts</button><button type="button" disabled={busy} onClick={() => vendorAction('mark_american_apparel_fall_winter_qa_ready')} className="rounded-lg border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">Mark fall/winter QA ready</button></>}{page.name === 'Next Level' && <><button type="button" disabled={busy} onClick={() => vendorAction('get_next_level_candidate_report')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Review Next Level candidates</button><button type="button" disabled={busy || !catalogResult?.products?.some(product => product.ready_for_private_import)} onClick={() => vendorAction('import_next_level_live_products')} className="rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Publish passing Next Level products</button></>}{page.name === 'adidas' && <><button type="button" disabled={busy} onClick={() => vendorAction('get_adidas_candidate_report')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Review Adidas candidates</button><button type="button" disabled={busy} onClick={() => vendorAction('audit_adidas_pricing')} className="rounded-lg border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">Audit live Adidas pricing</button><button type="button" disabled={busy || !catalogResult?.products?.some(product => product.ready_for_private_import)} onClick={() => vendorAction('import_adidas_live_products')} className="rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Publish passing Adidas products</button></>}<button type="button" disabled={busy} onClick={() => vendorAction('get_brand_draft_report')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Review private drafts</button></div>{catalogResult?.style_summaries && <p className="mt-3 text-xs text-muted-foreground">{catalogResult.style_summaries.length} styles checked · {catalogResult.style_summaries.filter(style => style.image_available && style.stocked_variants > 0 && style.minimum_vendor_cost > 0).length} have images, inventory, and current vendor cost.</p>}{catalogResult?.audits && <div className="mt-4 overflow-x-auto rounded-lg border bg-white"><table className="min-w-[1100px] w-full text-left text-xs"><thead className="bg-primary/5"><tr>{['Style','Product','S&S Cost','MAP','MSRP / List','Current HC Price','Safe Floor','Recommended','Difference','Pricing Source','Status'].map(label => <th key={label} className="whitespace-nowrap px-3 py-2 font-bold">{label}</th>)}</tr></thead><tbody>{catalogResult.audits.map(item => <tr key={item.product_id} className="border-t"><td className="px-3 py-2 font-semibold">{item.style}</td><td className="px-3 py-2">{item.product}</td><td className="px-3 py-2">{item.ss_cost == null ? 'Unavailable' : `$${Number(item.ss_cost).toFixed(2)}`}</td><td className="px-3 py-2">{item.map == null ? 'Not verified' : `$${Number(item.map).toFixed(2)}`}</td><td className="px-3 py-2">{item.msrp_list == null ? 'Unavailable' : `$${Number(item.msrp_list).toFixed(2)}`}</td><td className="px-3 py-2">${Number(item.current_customer_price).toFixed(2)}</td><td className="px-3 py-2">{item.calculated_safe_floor == null ? 'Unavailable' : `$${Number(item.calculated_safe_floor).toFixed(2)}`}</td><td className="px-3 py-2">{item.recommended_customer_price == null ? 'Unavailable' : `$${Number(item.recommended_customer_price).toFixed(2)}`}</td><td className="px-3 py-2">${Number(item.difference).toFixed(2)}</td><td className="px-3 py-2">{item.pricing_source}</td><td className={`px-3 py-2 font-bold ${item.status === 'PASS' ? 'text-green-700' : 'text-amber-800'}`}>{item.status}</td></tr>)}</tbody></table></div>}{catalogResult?.products && <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{catalogResult.products.map(product => { const candidate = product.ready_for_private_import !== undefined; const draftReport = product.sku_variants !== undefined; return <div key={product.id || product.part_number || product.style_number} className="rounded-lg border bg-white p-3 text-xs"><p className="font-bold">{product.name || product.customer_name} · {product.style_number || product.style_name || product.part_number}</p>{candidate ? <><p>{product.stocked_variants} stocked SKUs · {product.stocked_colors} colors · {product.stocked_sizes} sizes · {product.total_inventory} units</p><p className={product.ready_for_private_import ? 'text-green-700' : 'text-red-700'}>{product.ready_for_private_import ? 'Ready after authenticated S&S and pricing QA' : product.blockers?.join(' · ')}</p></> : draftReport ? <><p>{product.sku_variants} SKUs · {product.colors} colors · {product.sizes} sizes · ${Number(product.public_price).toFixed(2)} · {product.inventory} units</p><p className={product.ready_for_private_qa ? 'text-green-700' : 'text-red-700'}>{product.ready_for_private_qa ? 'Ready for private QA' : product.blockers.join(' · ')}</p>{product.id && <Link className="mt-2 inline-block font-semibold text-primary underline" to={`/ProductDetail?id=${encodeURIComponent(product.id)}&preview=draft`}>Open private QA preview</Link>}</> : <p className="text-green-700">Private draft created · Not published</p>}</div>; })}</div>}</div>}
      </div>}
    </div>
  </div></main>;
}
