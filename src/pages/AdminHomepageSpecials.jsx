import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { getPublicProductName } from '@/lib/productDisplayName';

const money = value => value == null ? '—' : `$${Number(value).toFixed(2)}`;
const dateValue = value => value ? new Date(value).toISOString().slice(0, 16) : '';
const pickLabels = ['Current Pick', 'Great Blank Price', 'Bulk Friendly', 'Cold Weather Pick', 'Creator Favorite', 'Team Order Pick', 'Brand Builder Pick'];
const blankEdit = { headline: '', subtitle: '', starts_at: '', ends_at: '', display_order: 0, promo_image_url: '', badge_label: 'Current Pick' };
const isCurrentSale = candidate => candidate.eligible && candidate.is_vendor_special;
const isCurrentPick = candidate => candidate.eligible && !candidate.is_vendor_special;
const priority = candidate => {
  const brand = String(candidate.brand || '').toLowerCase();
  const category = String(candidate.category || '').toLowerCase();
  const name = String(candidate.product_name || '').toLowerCase();
  if (/(t-shirt|tshirt|tee|youth)/.test(`${category} ${name}`)) {
    if (['hanes', 'gildan', 'shaka wear', 'rabbit skins'].some(name => brand.includes(name))) return 0;
    return 1;
  }
  if (/(hoodie|hooded|fleece)/.test(`${category} ${name}`)) return 2;
  return 3;
};

export default function AdminHomepageSpecials() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('picks');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [edit, setEdit] = useState(blankEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const { data: candidates = [], isLoading, error: loadError } = useQuery({
    queryKey: ['homepage-special-candidates'],
    queryFn: async () => {
      const { data, error: requestError } = await supabase.rpc('homepage_special_candidates');
      if (requestError) throw requestError;
      return data || [];
    },
  });
  const { data: rows = [], error: rowsError } = useQuery({
    queryKey: ['homepage-special-records'],
    queryFn: async () => {
      const { data, error: requestError } = await supabase.from('homepage_specials').select('*').order('display_order');
      if (requestError) throw requestError;
      return data || [];
    },
  });
  const records = useMemo(() => new Map(rows.map(row => [`${row.product_id}:${row.sku}`, row])), [rows]);
  const filtered = useMemo(() => candidates.filter(candidate => {
    if (view === 'picks' && !isCurrentPick(candidate)) return false;
    if (view === 'specials' && !isCurrentSale(candidate)) return false;
    if (view === 'blocked' && candidate.eligible) return false;
    const value = `${candidate.product_name} ${candidate.brand} ${candidate.sku} ${candidate.category}`.toLowerCase();
    return value.includes(search.trim().toLowerCase());
  }).sort((a, b) => priority(a) - priority(b)
    || Number(b.inventory_qty) - Number(a.inventory_qty)
    || Number(a.public_price) - Number(b.public_price)), [candidates, search, view]);
  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);
  const selectedRecord = selected && records.get(`${selected.product_id}:${selected.sku}`);

  const choose = candidate => {
    setSelected(candidate);
    const record = records.get(`${candidate.product_id}:${candidate.sku}`);
    setEdit(record ? {
      headline: record.headline || '', subtitle: record.subtitle || '',
      starts_at: dateValue(record.starts_at), ends_at: dateValue(record.ends_at),
      display_order: record.display_order || 0, promo_image_url: record.promo_image_url || '',
      badge_label: record.badge_label || 'Current Pick',
    } : blankEdit);
    setError(''); setMessage('');
  };

  const save = async (changes = {}) => {
    if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const existing = records.get(`${selected.product_id}:${selected.sku}`);
      const payload = {
        product_id: selected.product_id, sku: selected.sku,
        headline: edit.headline.trim() || null, subtitle: edit.subtitle.trim() || null,
        promo_image_url: edit.promo_image_url || null,
        badge_label: edit.badge_label,
        starts_at: edit.starts_at ? new Date(edit.starts_at).toISOString() : null,
        ends_at: edit.ends_at ? new Date(edit.ends_at).toISOString() : null,
        display_order: Number(edit.display_order) || 0,
        approved: existing?.approved || false, active: existing?.active || false,
        rejected_at: existing?.rejected_at || null,
        ...changes,
      };
      const { error: saveError } = await supabase.from('homepage_specials')
        .upsert(payload, { onConflict: 'product_id,sku' });
      if (saveError) throw saveError;
      await client.invalidateQueries({ queryKey: ['homepage-special-records'] });
      await client.invalidateQueries({ queryKey: ['storefront-homepage-specials'] });
      setMessage('Homepage display record saved. Product and checkout pricing were not changed.');
    } catch (cause) { setError(cause.message || 'Could not save homepage pick.'); }
    finally { setBusy(false); }
  };

  const uploadImage = async file => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Choose a PNG, JPG/JPEG, or WEBP image under 10 MB.'); return;
    }
    setBusy(true); setError('');
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `homepage-specials/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('storefront-assets').upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('storefront-assets').getPublicUrl(path);
      setEdit(current => ({ ...current, promo_image_url: data.publicUrl }));
      setMessage('Image uploaded. Save this display record to use it on the homepage.');
    } catch (cause) { setError(cause.message || 'Image upload failed.'); }
    finally { setBusy(false); }
  };

  const refreshExistingSkus = async () => {
    setRefreshing(true); setError(''); setMessage('');
    try {
      const { data, error: requestError } = await supabase.functions.invoke('homepage-specials-refresh', {
        body: { action: 'refresh_existing_candidates' },
      });
      if (requestError || data?.error) throw new Error(data?.error || requestError?.message || 'S&S refresh failed');
      setRefreshResult(data);
      await client.invalidateQueries({ queryKey: ['homepage-special-candidates'] });
      setMessage(`Read-only S&S refresh complete: ${data.products_refreshed} catalog products and ${data.skus_refreshed} existing SKUs updated. No product prices or orders changed.`);
    } catch (cause) { setError(cause.message || 'S&S refresh failed.'); }
    finally { setRefreshing(false); }
  };

  return (
    <main className="min-h-screen bg-[#f6f3e9] p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link to="/AdminDashboard" className="text-sm font-medium text-[#34472c] underline">Admin Dashboard</Link>
        <div>
          <h1 className="text-3xl font-bold text-[#283820]">Homepage Specials Manager</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#586251]">Review real S&amp;S SKU prices and inventory. Nothing appears on the homepage until you approve and activate it. Regular product and checkout prices remain unchanged.</p>
          <p className="mt-3 max-w-3xl rounded-xl border border-[#ded4b6] bg-[#fffaf0] p-3 text-sm text-[#554a31]">Current Picks are not verified vendor discounts. They are manually approved featured products based on current price, inventory, season, and business fit. Favor in-stock Hanes, Gildan, Shaka Wear, Rabbit Skins, youth/family tees, and sensible hoodie or fleece picks. Avoid expensive, low-stock, stale, image-less, or below-margin products. Do not feature the quantity-one Columbia Jacket as a deal; a premium cold-weather feature would require a separate deliberate review.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d9d4c4] bg-white p-4">
          <button type="button" disabled={refreshing} onClick={refreshExistingSkus} className="rounded-lg bg-[#34472c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{refreshing ? 'Refreshing existing S&S SKUs…' : 'Refresh existing S&S pricing & inventory'}</button>
          <p className="text-xs text-[#586251]">Fetches only selected SKUs for products already in the catalog. Does not import styles, change storefront prices, or submit orders.</p>
          {refreshResult && <p className="w-full text-xs text-[#586251]">API requests: {refreshResult.api_requests} · SKUs skipped: {refreshResult.skipped} · Fetched: {new Date(refreshResult.fetched_at).toLocaleString()}</p>}
        </div>
        {(loadError || rowsError || error) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error || loadError?.message || rowsError?.message}</p>}
        {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[['Current picks to review', candidates.filter(row => isCurrentPick(row) && !records.get(`${row.product_id}:${row.sku}`)?.approved).length], ['Verified current S&S specials', candidates.filter(isCurrentSale).length], ['Blocked candidates', candidates.filter(row => !row.eligible).length], ['Approved and active', rows.filter(row => row.approved && row.active).length]].map(([label, count]) => (
            <div key={label} className="rounded-xl border bg-white p-4"><p className="text-sm text-[#586251]">{label}</p><p className="mt-1 text-2xl font-bold text-[#283820]">{count}</p></div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
          <section className="rounded-2xl border bg-white p-4 md:p-5" aria-label="S&S homepage candidates">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-bold text-[#283820]">Homepage candidates</h2><p className="text-xs text-[#586251]">Vendor cost is admin-only. Current picks are not sales; verified current S&amp;S specials are listed separately.</p></div>
              <input aria-label="Search candidates" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, brand, SKU…" className="w-full rounded-lg border px-3 py-2 text-sm sm:w-64" />
            </div>
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Candidate type">
              {[["picks", 'Current Picks', candidates.filter(isCurrentPick).length], ['specials', 'Verified S&S Specials', candidates.filter(isCurrentSale).length], ['blocked', 'Blocked', candidates.filter(row => !row.eligible).length]].map(([key, label, count]) => <button key={key} type="button" onClick={() => { setView(key); setPage(1); setSelected(null); }} aria-pressed={view === key} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${view === key ? 'border-[#34472c] bg-[#34472c] text-white' : 'border-[#d9d4c4] text-[#34472c]'}`}>{label} ({count})</button>)}
            </div>
            {isLoading && <p className="text-sm">Loading S&amp;S candidates…</p>}
            {!isLoading && !filtered.length && <p className="rounded-lg bg-[#f6f3e9] p-4 text-sm text-[#586251]">No candidates in this view. Nothing appears publicly until an eligible item is manually approved.</p>}
            <div className="space-y-2">
              {visible.map(candidate => {
                const record = records.get(`${candidate.product_id}:${candidate.sku}`);
                return <button key={`${candidate.product_id}:${candidate.sku}`} type="button" onClick={() => choose(candidate)} className={`flex w-full gap-3 rounded-xl border p-3 text-left transition hover:border-[#9d7b35] ${selected?.sku === candidate.sku && selected?.product_id === candidate.product_id ? 'border-[#9d7b35] bg-[#fbf7e9]' : 'bg-white'}`}>
                  <img src={candidate.image_url} alt="" className="h-20 w-20 shrink-0 rounded-lg bg-[#f6f3e9] object-contain" />
                  <span className="min-w-0 flex-1"><span className="block text-xs font-semibold uppercase tracking-wide text-[#6a735c]">{candidate.brand} · {candidate.sku}</span><span className="block truncate font-semibold text-[#283820]">{getPublicProductName({ name: candidate.product_name, brand: candidate.brand, category: candidate.category })}</span><span className="block text-xs text-[#586251]">Vendor {money(candidate.vendor_price)} · HC public {money(candidate.public_price)} · Qty {candidate.inventory_qty}</span><span className={`mt-1 block text-xs ${candidate.eligible ? 'text-green-700' : 'text-amber-800'}`}>{isCurrentSale(candidate) ? 'Verified current S&S special · ' : candidate.is_vendor_special ? 'Historical vendor special (not current) · ' : 'Current pick · '}{candidate.reason}{record?.active ? ' · Live' : record?.approved ? ' · Approved/inactive' : record?.rejected_at ? ' · Rejected' : ''}</span></span>
                </button>;
              })}
            </div>
            {filtered.length > pageSize && <div className="mt-4 flex items-center justify-between text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><span>Page {Math.min(page, pages)} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div>}
          </section>
          <section className="h-fit rounded-2xl border bg-white p-4 md:p-5" aria-label="Special display editor">
            <h2 className="text-xl font-bold text-[#283820]">Review &amp; display</h2>
            {!selected ? <p className="mt-3 text-sm text-[#586251]">Choose a SKU to review its price and homepage display.</p> : <div className="mt-4 space-y-4">
              <img src={edit.promo_image_url || selected.image_url} alt="Selected product" className="h-44 w-full rounded-xl bg-[#f6f3e9] object-contain" />
              <div className="rounded-lg bg-[#f6f3e9] p-3 text-sm"><p>Vendor SKU: {selected.sku} · Inventory: {selected.inventory_qty}</p><p>Vendor price: {money(selected.vendor_price)} · Rule buffer: {money(selected.markup)}</p><p className="font-semibold">Current storefront/checkout price: {money(selected.public_price)}</p>{isCurrentSale(selected) && <p>Verified S&amp;S special price: {money(selected.vendor_special_price)} · Vendor reference: {money(selected.reference_vendor_price)}</p>}<p className="mt-1 text-xs">S&amp;S data: {selected.fetched_at ? new Date(selected.fetched_at).toLocaleString() : 'unavailable'}</p></div>
              {!isCurrentSale(selected) && <label className="block text-sm font-medium">Homepage label<select value={edit.badge_label} onChange={event => setEdit({ ...edit, badge_label: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">{pickLabels.map(label => <option key={label} value={label}>{label}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#586251]">A featured-product label, not a discount claim. Choose only one that accurately fits this item.</span></label>}
              <label className="block text-sm font-medium">Headline<input value={edit.headline} onChange={event => setEdit({ ...edit, headline: event.target.value })} placeholder={getPublicProductName({ name: selected.product_name, brand: selected.brand })} maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="block text-sm font-medium">Subtitle<input value={edit.subtitle} onChange={event => setEdit({ ...edit, subtitle: event.target.value })} maxLength={180} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              <label className="block text-sm font-medium">Replace promo image (optional)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => uploadImage(event.target.files?.[0])} className="mt-1 block w-full text-sm" /></label>
              {edit.promo_image_url && <button type="button" onClick={() => setEdit({ ...edit, promo_image_url: '' })} className="text-xs text-[#34472c] underline">Use S&amp;S product image instead</button>}
              <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Start<input type="datetime-local" value={edit.starts_at} onChange={event => setEdit({ ...edit, starts_at: event.target.value })} className="mt-1 w-full rounded-lg border px-2 py-2" /></label><label className="text-sm font-medium">End<input type="datetime-local" value={edit.ends_at} onChange={event => setEdit({ ...edit, ends_at: event.target.value })} className="mt-1 w-full rounded-lg border px-2 py-2" /></label></div>
              <label className="block text-sm font-medium">Display order<input type="number" value={edit.display_order} onChange={event => setEdit({ ...edit, display_order: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
              {!selected.eligible && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Cannot approve: {selected.reason}</p>}
              <div className="flex flex-wrap gap-2 text-sm">
                <button type="button" disabled={busy} onClick={() => save()} className="rounded-lg border px-3 py-2">Save display</button>
                <button type="button" disabled={busy || !selected.eligible} onClick={() => save({ approved: true, active: true, rejected_at: null })} className="rounded-lg bg-[#34472c] px-3 py-2 font-semibold text-white disabled:opacity-40">Approve &amp; activate</button>
                {selectedRecord?.active && <button type="button" disabled={busy} onClick={() => save({ active: false })} className="rounded-lg border px-3 py-2">Deactivate</button>}
                <button type="button" disabled={busy} onClick={() => save({ approved: false, active: false, rejected_at: new Date().toISOString() })} className="rounded-lg border border-red-200 px-3 py-2 text-red-700">Reject / remove</button>
              </div>
            </div>}
          </section>
        </div>
      </div>
    </main>
  );
}
