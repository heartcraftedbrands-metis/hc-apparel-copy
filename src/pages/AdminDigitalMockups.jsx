import { useEffect, useState } from 'react';
import { Archive, CheckCircle2, FileImage, ImagePlus, Loader2, Save, Star, UploadCloud, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createWatermarkedPreview, digitalMockupsRequest, formatFileSize } from '@/lib/digitalMockups';

const productOf = asset => Array.isArray(asset.products) ? asset.products[0] : asset.products;
const currentVersion = asset => (asset.digital_mockup_versions || []).find(version => version.id === asset.current_version_id) || (asset.digital_mockup_versions || []).sort((a, b) => b.version_number - a.version_number)[0];
const splitTags = value => String(value || '').split(',').map(tag => tag.trim()).filter(Boolean);

function AssetEditor({ asset, onSaved }) {
  const product = productOf(asset) || {};
  const version = currentVersion(asset) || {};
  const [form, setForm] = useState({ title: product.name || '', description: product.description || '', price: product.price || 1.2, garment_type: asset.garment_type || 't_shirt', color_name: asset.color_name || '', tags: (asset.tags || []).join(', '), publication_status: asset.publication_status, is_featured: asset.is_featured });
  const [saving, setSaving] = useState(false);
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const save = async featured => {
    setSaving(true);
    try {
      await digitalMockupsRequest({ action: 'admin_update', asset_id: asset.id, ...form, tags: splitTags(form.tags), is_featured: featured === true || form.is_featured });
      toast.success(featured ? 'Featured mockup updated.' : 'Mockup saved.');
      onSaved();
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };
  return <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="grid md:grid-cols-[220px_1fr]">
      <div className="relative bg-muted"><img src={version.preview_url || product.image_url} alt="" className="aspect-[4/5] h-full w-full object-cover object-top" />{asset.is_featured && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-xs font-bold text-accent-foreground"><Star className="h-3 w-3" />Featured</span>}</div>
      <div className="space-y-4 p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-2"><div><Label>Title</Label><Input value={form.title} onChange={update('title')} /></div><div><Label>Price</Label><Input type="number" min="0.01" step="0.01" value={form.price} onChange={update('price')} /></div><div><Label>Garment type</Label><Input value={form.garment_type} onChange={update('garment_type')} placeholder="t_shirt" /></div><div><Label>Color</Label><Input value={form.color_name} onChange={update('color_name')} /></div></div>
        <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={update('description')} /></div>
        <div><Label>Tags</Label><Input value={form.tags} onChange={update('tags')} placeholder="oversized, blank tee, women" /></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><div><Label>Publishing status</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.publication_status} onChange={update('publication_status')}><option value="draft">Draft</option><option value="published">Published</option><option value="unpublished">Unpublished</option><option value="archived">Archived</option></select></div><div className="flex items-end gap-2"><Button variant="outline" onClick={() => save(true)} disabled={saving}><Star className="mr-2 h-4 w-4" />Feature</Button><Button onClick={() => save(false)} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save'}</Button></div></div>
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-4"><div><dt className="text-muted-foreground">Original</dt><dd className="break-all font-semibold">{version.original_file_name}</dd></div><div><dt className="text-muted-foreground">Dimensions</dt><dd className="font-semibold">{version.pixel_width} × {version.pixel_height}</dd></div><div><dt className="text-muted-foreground">Format / size</dt><dd className="font-semibold">PNG · {formatFileSize(version.file_size_bytes)}</dd></div><div><dt className="text-muted-foreground">SKU</dt><dd className="font-semibold">{asset.sku}</dd></div></dl>
      </div>
    </div>
  </article>;
}

export default function AdminDigitalMockups() {
  const [assets, setAssets] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState([]);
  const [hero, setHero] = useState(null);
  const [savingHero, setSavingHero] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await digitalMockupsRequest({ action: 'admin_list' });
      setAssets(result.assets || []);
      setSettings(result.settings);
      setHero(result.settings);
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const uploadFiles = async event => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    const initial = files.map(file => ({ name: file.name, status: 'queued', progress: 0, message: '' }));
    setUploads(initial);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const setRow = values => setUploads(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row));
      try {
        if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) throw new Error('Only PNG files are supported for this launch collection.');
        setRow({ status: 'watermarking', progress: 5, message: 'Creating protected preview…' });
        const preview = await createWatermarkedPreview(file, progress => setRow({ progress: Math.max(5, Math.round(progress * 0.55)), status: 'watermarking' }));
        setRow({ status: 'uploading', progress: 60, message: 'Uploading original privately…' });
        const formData = new FormData();
        formData.set('action', 'admin_upload');
        formData.set('original', file);
        formData.set('preview', preview);
        formData.set('metadata', JSON.stringify({ title: `Blank T-Shirt Mockup ${assets.length + index + 1}`, description: 'Full-resolution PNG digital image download for presenting your artwork. Digital image download. No physical garment included.', garment_type: 't_shirt', color_name: 'Unspecified', tags: ['blank t-shirt', 'apparel mockup'], price: Number(settings?.default_price || 1.2) }));
        const result = await digitalMockupsRequest(formData);
        setRow({ status: result.duplicate ? 'duplicate' : 'complete', progress: 100, message: result.message || 'Draft created. Review metadata before publishing.' });
      } catch (error) {
        setRow({ status: 'error', progress: 0, message: error.message || 'Upload failed. Retry is safe.' });
      }
    }
    await load();
  };

  const saveHero = async () => {
    setSavingHero(true);
    try {
      await digitalMockupsRequest({ action: 'admin_update_hero', ...hero });
      toast.success('Hero copy and terms saved.');
      await load();
    } catch (error) { toast.error(error.message); }
    finally { setSavingHero(false); }
  };
  const heroUpdate = key => event => setHero(current => ({ ...current, [key]: event.target.value }));

  return <main className="min-h-screen bg-muted/30">
    <header className="bg-primary px-4 py-7 text-primary-foreground"><div className="container mx-auto max-w-7xl"><Link to="/AdminDashboard" className="text-sm text-primary-foreground/75 hover:text-primary-foreground">← Admin Dashboard</Link><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-3xl font-black"><FileImage className="text-accent" />Digital Mockups</h1><p className="mt-1 text-sm text-primary-foreground/75">Private originals, watermarked previews, reusable product records, publishing, and hero settings.</p></div><Button asChild variant="outline" className="border-primary-foreground/35 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><Link to="/DigitalMockups">View storefront</Link></Button></div></div></header>
    <div className="container mx-auto max-w-7xl space-y-7 px-4 py-7">
      <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h2 className="flex items-center gap-2 text-xl font-bold"><UploadCloud className="text-primary" />Upload mockups</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Select one or many PNGs. Originals go to private storage; reduced HC-logo watermarked previews are generated automatically. Exact-file retries are detected by SHA-256 and do not create duplicates.</p></div><label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg bg-primary px-5 font-bold text-primary-foreground hover:bg-primary/90"><ImagePlus className="mr-2 h-5 w-5" />Choose PNG files<input type="file" accept="image/png,.png" multiple className="sr-only" onChange={uploadFiles} /></label></div>
        {uploads.length > 0 && <div className="mt-5 space-y-2">{uploads.map((row, index) => <div key={`${row.name}-${index}`} className="rounded-lg border bg-background p-3"><div className="flex items-start gap-3">{row.status === 'complete' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" /> : row.status === 'error' ? <XCircle className="mt-0.5 h-5 w-5 text-destructive" /> : row.status === 'duplicate' ? <Archive className="mt-0.5 h-5 w-5 text-amber-600" /> : <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />}<div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold">{row.name}</p><p className="text-xs text-muted-foreground">{row.message || row.status}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${row.progress}%` }} /></div></div></div></div>)}</div>}
      </section>

      {hero && <section className="rounded-2xl border bg-card p-5 shadow-sm"><h2 className="text-xl font-bold">Hero and download terms</h2><p className="mt-1 text-sm text-muted-foreground">This copy is database-managed, so future collection changes do not require a code deployment.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><div><Label>Heading</Label><Input value={hero.heading || ''} onChange={heroUpdate('heading')} /></div><div><Label>Button</Label><Input value={hero.button_label || ''} onChange={heroUpdate('button_label')} /></div><div className="md:col-span-2"><Label>Description</Label><Textarea value={hero.description || ''} onChange={heroUpdate('description')} /></div><div><Label>Supporting text</Label><Input value={hero.supporting_text || ''} onChange={heroUpdate('supporting_text')} /></div><div><Label>Right headline</Label><Textarea value={hero.right_headline || ''} onChange={heroUpdate('right_headline')} /></div><div><Label>Quality label</Label><Input value={hero.quality_label || ''} onChange={heroUpdate('quality_label')} /></div><div><Label>Launch detail</Label><Input value={hero.launch_detail || ''} onChange={heroUpdate('launch_detail')} /></div><div><Label>Default price</Label><Input type="number" min="0.01" step="0.01" value={hero.default_price || 1.2} onChange={heroUpdate('default_price')} /></div><div><Label>Terms status</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={hero.license_status || 'proposed'} onChange={heroUpdate('license_status')}><option value="proposed">Proposed — review required</option><option value="approved">Approved</option></select></div><div className="md:col-span-2"><Label>Digital mockup license terms</Label><Textarea rows={5} value={hero.license_terms || ''} onChange={heroUpdate('license_terms')} /></div></div><Button className="mt-4" onClick={saveHero} disabled={savingHero}><Save className="mr-2 h-4 w-4" />{savingHero ? 'Saving…' : 'Save hero and terms'}</Button></section>}

      <section><div className="mb-4 flex items-end justify-between"><div><h2 className="text-2xl font-black">Mockup catalog</h2><p className="text-sm text-muted-foreground">Review every upload before publishing. Replacing a purchased original creates a new immutable version.</p></div><p className="text-sm font-semibold text-muted-foreground">{assets.length} record{assets.length === 1 ? '' : 's'}</p></div>{loading ? <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">Loading catalog…</p> : assets.length === 0 ? <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No mockups uploaded yet.</p> : <div className="space-y-5">{assets.map(asset => <AssetEditor key={asset.id} asset={asset} onSaved={load} />)}</div>}</section>
    </div>
  </main>;
}
