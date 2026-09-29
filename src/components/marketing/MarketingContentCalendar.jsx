import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Download, ExternalLink, Save, Upload } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const statuses = ['Idea', 'Draft', 'Ready to Publish', 'Published', 'Archived', 'Needs Update'];
const platforms = ['TikTok', 'X', 'Pinterest', 'LinkedIn', 'YouTube Shorts', 'Google Business', 'Email', 'SEO / GEO', 'Local Outreach'];
const activePlatforms = new Set(platforms);
const filters = ['All', ...platforms];
const maxImageBytes = 10 * 1024 * 1024;
const safeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const cacheKey = id => `hc-marketing-draft-${id}`;
const dateLabel = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : 'Date not set';

function Field({ label, value, onChange, type = 'text' }) {
  return <label className="min-w-0 text-xs font-bold text-muted-foreground">{label}<Input className="mt-1 min-h-11 w-full" type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} /></label>;
}

function TextArea({ label, value, onChange, rows = 4 }) {
  return <label className="min-w-0 text-xs font-bold text-muted-foreground">{label}<textarea className="mt-1 w-full resize-y rounded-md border bg-white px-3 py-2 text-base font-normal text-foreground sm:text-sm" rows={rows} value={value ?? ''} onChange={event => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, onChange, options }) {
  return <label className="min-w-0 text-xs font-bold text-muted-foreground">{label}<select className="mt-1 min-h-11 w-full rounded-md border bg-white px-3 text-base font-normal text-foreground sm:text-sm" value={value ?? ''} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
}

function buildPlatformUrl(row) {
  const link = row.tracking_url || row.product_url || row.product_link || '';
  if (row.platform === 'Pinterest') return `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(link)}&media=${encodeURIComponent(row.recommended_image_url || '')}&description=${encodeURIComponent(`${row.headline || ''}\n\n${row.caption || ''}`)}`;
  if (row.platform === 'X') return `https://x.com/intent/post?text=${encodeURIComponent(`${row.caption || ''}\n\n${link}`)}`;
  return row.account_profile_url || '';
}

function DraftEditor({ source, onSave, onClose, onNotice, onError }) {
  const [row, setRow] = useState(source);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(source.id)) || 'null');
      if (cached?._dirty) {
        setRow({ ...source, ...cached.row });
        setDirty(true);
        setRecovered(true);
      } else setRow(source);
    } catch { setRow(source); }
  }, [source]);

  useEffect(() => {
    if (!dirty) return undefined;
    localStorage.setItem(cacheKey(source.id), JSON.stringify({ _dirty: true, row, savedAt: new Date().toISOString() }));
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, row, source.id]);

  const change = patch => { setRow(current => ({ ...current, ...patch })); setDirty(true); };
  const save = async () => {
    setSaving(true);
    const ok = await onSave(row);
    setSaving(false);
    if (ok) {
      localStorage.removeItem(cacheKey(source.id));
      setDirty(false);
      setRecovered(false);
      onNotice('Draft saved. It remains unpublished.');
    }
  };
  const upload = async file => {
    if (!file) return;
    if (!safeTypes.has(file.type) || file.size > maxImageBytes) { onError('Use a JPG, PNG, or WEBP image under 10 MB.'); return; }
    setUploading(true); onError('');
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `marketing-content/${source.id}/${crypto.randomUUID()}.${ext}`;
      const result = await supabase.storage.from('storefront-assets').upload(path, file, { contentType: file.type, upsert: false });
      if (result.error) throw result.error;
      const url = supabase.storage.from('storefront-assets').getPublicUrl(path).data.publicUrl;
      change({ recommended_image_url: url, media_storage_path: path, media_selected: true });
      onNotice('Artwork uploaded. Save the draft to keep this replacement.');
    } catch { onError('Artwork upload failed. Check admin access and try again.'); }
    finally { setUploading(false); }
  };
  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(`${row.caption || ''}\n\n${row.tracking_url || row.product_url || ''}`.trim()); onNotice('Caption and shopping link copied.'); }
    catch { onError('Caption could not be copied. Select the caption manually.'); }
  };
  const markPosted = async () => {
    if (!window.confirm('Mark this draft as posted? This changes only the Marketing Center record and does not publish to the platform.')) return;
    const posted = { ...row, status: 'Published', published_date: row.published_date || new Date().toISOString() };
    setRow(posted); setSaving(true);
    const ok = await onSave(posted);
    setSaving(false);
    if (ok) { localStorage.removeItem(cacheKey(source.id)); setDirty(false); onNotice('Marked as posted in Marketing Center.'); }
  };
  const platformUrl = buildPlatformUrl(row);

  return <div className="mt-4 min-w-0 rounded-xl border bg-muted/30 p-3 sm:p-4">
    {recovered && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">Recovered unsaved edits from this device.</p>}
    <p className="mb-3 text-xs text-muted-foreground">Unsaved edits are kept on this device and restored if you leave. Saving never publishes the post.</p>
    {row.recommended_image_url && <div className="rounded-xl border bg-white p-2"><img src={row.recommended_image_url} alt={row.image_alt_text || `Artwork for ${row.headline}`} className="mx-auto max-h-[70vh] w-full object-contain" /></div>}
    <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-semibold"><Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload / replace artwork'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
    <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
      <SelectField label="Platform" value={row.platform} options={platforms} onChange={value => change({ platform: value })} />
      <Field label="Scheduled date" type="date" value={row.planned_date} onChange={value => change({ planned_date: value })} />
      <Field label="Post / Pin title" value={row.headline} onChange={value => change({ headline: value })} />
      <SelectField label="Status" value={row.status} options={statuses.filter(status => status !== 'Published' || row.status === 'Published')} onChange={value => change({ status: value })} />
      <TextArea label={row.platform === 'Pinterest' ? 'Pinterest description' : 'Caption'} value={row.caption} onChange={value => change({ caption: value })} rows={5} />
      <TextArea label="Image alt text" value={row.image_alt_text} onChange={value => change({ image_alt_text: value })} rows={5} />
      <Field label="Shopping link" value={row.product_url || row.product_link} onChange={value => change({ product_url: value, product_link: value })} />
      <Field label="UTM tracking link" value={row.tracking_url} onChange={value => change({ tracking_url: value })} />
      <Field label="CTA" value={row.cta} onChange={value => change({ cta: value })} />
      <Field label="Hashtags" value={row.hashtags} onChange={value => change({ hashtags: value })} />
      <Field label="Assigned To" value={row.assigned_to} onChange={value => change({ assigned_to: value })} />
      <Field label="Published URL (after manual posting)" value={row.published_url} onChange={value => change({ published_url: value })} />
    </div>
    <div className="sticky bottom-2 z-10 mt-4 grid gap-2 rounded-xl border bg-white/95 p-2 shadow-lg backdrop-blur sm:flex sm:flex-wrap">
      <Button className="min-h-11" disabled={saving || uploading} onClick={save}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}</Button>
      <Button className="min-h-11" variant="outline" onClick={copyCaption}><Copy className="mr-2 h-4 w-4" />Copy Caption</Button>
      {row.recommended_image_url && <Button className="min-h-11" variant="outline" asChild><a href={row.recommended_image_url} download target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />Download Image</a></Button>}
      {platformUrl && <Button className="min-h-11" variant="outline" asChild><a href={platformUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open {row.platform}</a></Button>}
      <Button className="min-h-11" variant="outline" onClick={markPosted}><CheckCircle2 className="mr-2 h-4 w-4" />Mark as posted</Button>
      <Button className="min-h-11 sm:ml-auto" variant="ghost" onClick={onClose}>Close editor</Button>
    </div>
  </div>;
}

export default function MarketingContentCalendar({ campaigns, drafts, accounts, onSave, onNotice, onError }) {
  const [filter, setFilter] = useState('All');
  const [openId, setOpenId] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const campaign = campaigns.find(item => item.campaign_key === 'hc_apparel_organic_launch');
  const rows = useMemo(() => campaign ? drafts.filter(item => item.campaign_id === campaign.id).sort((a, b) => String(a.planned_date || '').localeCompare(String(b.planned_date || '')) || a.platform.localeCompare(b.platform)) : [], [campaign, drafts]);
  if (!campaign) return null;
  const activeRows = rows.filter(item => item.active_schedule !== false && item.status !== 'Archived' && activePlatforms.has(item.platform));
  const inactiveRows = rows.filter(item => !activeRows.includes(item) && (item.platform === 'Facebook' || item.platform === 'Instagram' || item.original_platform === 'Facebook' || item.original_platform === 'Instagram'));
  const visibleRows = activeRows.filter(item => filter === 'All' || item.platform === filter);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayRows = activeRows.filter(item => item.planned_date === todayKey);
  const accountFor = platform => accounts.find(item => item.platform === platform);
  const renderRow = item => {
    const account = accountFor(item.platform);
    const open = openId === item.id;
    return <article key={item.id} className="min-w-0 overflow-hidden rounded-xl border bg-white p-3 sm:p-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[88px_130px_minmax(0,1fr)_auto] sm:items-start">
        <div><p className="text-[11px] font-bold uppercase text-muted-foreground">Day / Date</p><p className="font-black">Day {item.day_number}</p><p className="text-xs text-muted-foreground">{dateLabel(item.planned_date)}</p></div>
        <div><p className="text-[11px] font-bold uppercase text-muted-foreground">Platform / Account</p><p className="font-semibold">{item.platform}</p><p className="break-words text-xs text-muted-foreground">{item.account_handle || account?.handle || account?.status || 'No account assigned'}</p></div>
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase text-muted-foreground">Content / Product</p><p className="break-words font-semibold">{item.headline}</p><p className="mt-1 break-words text-xs text-muted-foreground">{item.product_name || 'Outerwear collection'}</p><span className="mt-2 inline-block rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">{item.status}</span></div>
        <Button className="min-h-11 w-full sm:w-auto" size="sm" variant="outline" onClick={() => setOpenId(open ? null : item.id)}>{open ? 'Close' : 'Open / Review'}</Button>
      </div>
      {open && <DraftEditor source={item} onSave={onSave} onClose={() => setOpenId(null)} onNotice={onNotice} onError={onError} />}
    </article>;
  };
  return <div className="min-w-0 space-y-5">
    <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-4"><h2 className="font-black text-primary">Today's Content</h2><p className="mt-1 text-sm text-muted-foreground">{dateLabel(todayKey)} · {todayRows.length} scheduled item{todayRows.length === 1 ? '' : 's'}</p></div><div className="grid gap-3 p-3 sm:p-4">{todayRows.length ? todayRows.map(renderRow) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No active-channel campaign content is scheduled for today.</p>}</div></section>
    <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-4"><h2 className="font-black text-primary">7-Day Content Calendar</h2><p className="mt-1 text-sm text-muted-foreground">Mobile agenda view for {activeRows.length} active HC Apparel Organic Launch drafts. Nothing publishes automatically.</p></div><div className="p-3 sm:p-4"><div className="mb-4 flex snap-x gap-2 overflow-x-auto pb-2" aria-label="Calendar filters">{filters.map(item => <button key={item} type="button" onClick={() => setFilter(item)} className={`min-h-11 shrink-0 snap-start rounded-full px-4 py-2 text-sm font-bold ${filter === item ? 'bg-primary text-white' : 'bg-muted text-primary'}`}>{item}</button>)}</div><div className="grid gap-3">{visibleRows.map(renderRow)}</div></div></section>
    {inactiveRows.length > 0 && <section className="overflow-hidden rounded-xl border bg-white p-4"><h2 className="font-black text-primary">Historical / Inactive Channels</h2><p className="mt-1 text-sm text-muted-foreground">{inactiveRows.length} retained Meta drafts are excluded from current scheduling.</p><Button className="mt-3 min-h-11" size="sm" variant="outline" onClick={() => setShowInactive(value => !value)}>{showInactive ? 'Hide inactive history' : 'Show inactive history'}</Button>{showInactive && <div className="mt-4 grid gap-3">{inactiveRows.map(renderRow)}</div>}</section>}
  </div>;
}
