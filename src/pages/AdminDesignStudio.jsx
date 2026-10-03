import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Check, Circle, Cloud, Download, Eye, Layers,
  LockKeyhole, Plus, Redo2, Save, Shirt, Square, Star, Type, Undo2, Upload, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import DesignCanvas from '@/components/design-studio/DesignCanvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  ACTIVE_PRODUCTION_ROUTES, DESIGN_PLACEMENTS, STUDIO_FONTS,
  calculateStudioPricing, createHistory, createStudioDocument, historyReducer,
  isRestrictedCustomizationProduct, makeElement, updatePlacement, validateDesign,
} from '@/lib/designStudio';
import { getCustomizationColors, getCustomizationSizes, findCustomizationVariant } from '@/lib/productCustomization';
import { getPublicProductName } from '@/lib/productDisplayName';

const BRAND = { plum: '#4b1236', gold: '#b58d2a', green: '#4f6b45', linen: '#f7f3ea' };
const TABS = [['studio', 'Studio'], ['designs', 'Saved Designs'], ['review', 'Production Review'], ['areas', 'Print Areas'], ['vendors', 'Pricing & Vendors'], ['settings', 'Settings']];

async function invoke(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('design-studio', { body: { action, ...payload } });
  if (error) {
    let message = error.message || 'Design Studio request failed.';
    try { message = (await error.context?.json())?.error || message; } catch { /* Keep transport message. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const readFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const displayImage = value => value?.startsWith('Images/') || value?.startsWith('/Images/')
  ? `https://www.ssactivewear.com/${value.replace(/^\//, '')}` : value;

function productPrice(product, variant) {
  return Number(variant?.price ?? product?.account_price ?? product?.price ?? 0);
}

function download(name, value, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function imageForCanvas(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('A private artwork file could not be loaded for export. Reopen the design to refresh access.');
  return createImageBitmap(await response.blob());
}

async function renderProductionPng(elements, area) {
  const dpi = 300;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(Number(area.width_in) * dpi);
  canvas.height = Math.round(Number(area.height_in) * dpi);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const element of elements.filter(item => item.visible)) {
    const x = (element.x / 100) * canvas.width;
    const y = (element.y / 100) * canvas.height;
    const width = (element.width / 100) * canvas.width;
    const height = (element.height / 100) * canvas.height;
    context.save();
    context.globalAlpha = element.opacity ?? 1;
    context.translate(x + width / 2, y + height / 2);
    context.rotate((Number(element.rotation || 0) * Math.PI) / 180);
    context.translate(-width / 2, -height / 2);
    if (element.type === 'image') {
      const image = await imageForCanvas(element.previewUrl);
      const scale = Math.min(width / image.width, height / image.height);
      const drawWidth = image.width * scale, drawHeight = image.height * scale;
      context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      image.close?.();
    } else if (element.type === 'shape') {
      context.fillStyle = element.fill;
      context.strokeStyle = element.fill;
      if (element.shape === 'circle') { context.beginPath(); context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2); context.fill(); }
      else if (element.shape === 'triangle') { context.beginPath(); context.moveTo(width / 2, 0); context.lineTo(width, height); context.lineTo(0, height); context.closePath(); context.fill(); }
      else if (element.shape === 'star') { context.beginPath(); for (let point = 0; point < 10; point += 1) { const radius = point % 2 ? .22 : .5; const angle = -Math.PI / 2 + point * Math.PI / 5; const px = width / 2 + Math.cos(angle) * width * radius; const py = height / 2 + Math.sin(angle) * height * radius; point ? context.lineTo(px, py) : context.moveTo(px, py); } context.closePath(); context.fill(); }
      else if (element.shape === 'line') { context.lineWidth = Math.max(2, height * .12); context.lineCap = 'round'; context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke(); }
      else context.fillRect(0, 0, width, height);
    } else if (element.type === 'text') {
      context.fillStyle = element.fill;
      const fontSize = Math.max(12, height * .72);
      context.font = `${element.fontWeight || 700} ${fontSize}px "${element.fontFamily || 'Arial'}"`;
      context.textAlign = 'center'; context.textBaseline = 'middle';
      if (Number(element.curve)) {
        const characters = [...String(element.text || '')];
        const direction = Number(element.curve) > 0 ? -1 : 1;
        const arc = Math.min(Math.PI * .9, Math.abs(Number(element.curve)) / 50 * Math.PI * .75);
        const radius = Math.max(width, height) / Math.max(.2, arc);
        characters.forEach((character, index) => {
          const angle = direction * (-arc / 2 + (arc * (index + .5)) / Math.max(1, characters.length));
          context.save(); context.translate(width / 2 + Math.sin(angle) * radius, height / 2 + direction * (radius - Math.cos(angle) * radius)); context.rotate(direction * angle); context.fillText(character, 0, 0); context.restore();
        });
      } else {
        const measured = Math.max(1, context.measureText(element.text || '').width);
        context.save(); context.translate(width / 2, height / 2); context.scale(Math.min(1, width / measured), 1); context.fillText(element.text || '', 0, 0); context.restore();
      }
    }
    context.restore();
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Production artwork could not be rendered.')), 'image/png'));
}

function Field({ label, children, hint }) {
  return <label className="block min-w-0 text-sm font-medium">{label}<div className="mt-1">{children}</div>{hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}</label>;
}

function AddPanel({ onText, onShape, onUpload, busy }) {
  return <div className="space-y-4">
    <div><h3 className="font-bold text-[#4b1236]">Add design</h3><p className="text-xs text-muted-foreground">Only HC-managed tools and your own files are available.</p></div>
    <Button variant="outline" className="h-12 w-full justify-start" onClick={onText}><Type className="mr-3 h-5 w-5" />Editable text</Button>
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" onClick={() => onShape('rectangle')}><Square className="mr-2 h-4 w-4" />Rectangle</Button>
      <Button variant="outline" onClick={() => onShape('circle')}><Circle className="mr-2 h-4 w-4" />Circle</Button>
      <Button variant="outline" onClick={() => onShape('star')}><Star className="mr-2 h-4 w-4" />Star</Button>
      <Button variant="outline" onClick={() => onShape('line')}>— Line</Button>
    </div>
    <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-[#b58d2a]/60 bg-[#f7f3ea] px-3 text-sm font-semibold text-[#4b1236]">
      <Upload className="mr-2 h-4 w-4" />{busy ? 'Validating upload…' : 'Upload PNG, JPG, or SVG'}
      <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={onUpload} disabled={busy} />
    </label>
    <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
      Files are validated server-side, stored privately, and preserved separately from garment mockups. SVG scripts, event handlers, embeds, and external references are rejected.
    </div>
  </div>;
}

function VariantPanel({ products, product, document, onProduct, onField }) {
  const colors = getCustomizationColors(product);
  const sizes = getCustomizationSizes(product, document.color);
  return <div className="space-y-4">
    <div><h3 className="font-bold text-[#4b1236]">Garment & variants</h3><p className="text-xs text-muted-foreground">Only published, active, eligible products appear.</p></div>
    <Field label="Garment">
      <select value={document.productId} onChange={event => onProduct(event.target.value)} className="h-11 w-full rounded-md border bg-white px-3 text-sm">
        <option value="">Choose an eligible T-shirt</option>
        {products.map(item => <option key={item.id} value={item.id}>{getPublicProductName(item)} {item.supplier_sku ? `(${item.supplier_sku})` : ''}</option>)}
      </select>
    </Field>
    <Field label="Color"><select value={document.color} onChange={event => onField('color', event.target.value)} disabled={!product} className="h-11 w-full rounded-md border bg-white px-3 text-sm disabled:opacity-50"><option value="">Choose color</option>{colors.map(value => <option key={value}>{value}</option>)}</select></Field>
    <Field label="Size"><select value={document.size} onChange={event => onField('size', event.target.value)} disabled={!document.color} className="h-11 w-full rounded-md border bg-white px-3 text-sm disabled:opacity-50"><option value="">Choose size</option>{sizes.map(value => <option key={value}>{value}</option>)}</select></Field>
    <Field label="Quantity"><Input type="number" min="1" value={document.quantity} onChange={event => onField('quantity', Math.max(1, Number(event.target.value) || 1))} /></Field>
    <Field label="Production route"><select value={document.productionRoute} onChange={event => onField('productionRoute', event.target.value)} className="h-11 w-full rounded-md border bg-white px-3 text-sm">{ACTIVE_PRODUCTION_ROUTES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
  </div>;
}

function LayerPanel({ document, setDocument, selectedIds, setSelectedIds }) {
  const placement = document.activePlacement;
  const layers = document.placements?.[placement] || [];
  const patch = (id, values) => setDocument(updatePlacement(document, placement, items => items.map(item => item.id === id ? { ...item, ...values } : item)));
  const move = (index, direction) => setDocument(updatePlacement(document, placement, items => {
    const next = [...items]; const target = index + direction;
    if (target < 0 || target >= next.length) return next;
    [next[index], next[target]] = [next[target], next[index]]; return next;
  }));
  return <div className="space-y-3">
    <div><h3 className="font-bold text-[#4b1236]">Layers</h3><p className="text-xs text-muted-foreground">Top rows print above lower rows.</p></div>
    {!layers.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No layers on this placement.</p>}
    {[...layers].reverse().map((layer, reverseIndex) => {
      const index = layers.length - reverseIndex - 1;
      return <div key={layer.id} className={`rounded-xl border p-3 ${selectedIds.includes(layer.id) ? 'border-[#b58d2a] bg-[#f7f3ea]' : 'bg-white'}`}>
        <button type="button" className="w-full truncate text-left text-sm font-semibold" onClick={() => setSelectedIds([layer.id])}>{layer.name}</button>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => patch(layer.id, { visible: !layer.visible })}>{layer.visible ? <Eye className="h-4 w-4" /> : <X className="h-4 w-4" />}<span className="sr-only">Toggle visibility</span></Button>
          <Button size="sm" variant="ghost" onClick={() => patch(layer.id, { locked: !layer.locked })}><LockKeyhole className={`h-4 w-4 ${layer.locked ? 'text-[#4b1236]' : 'opacity-40'}`} /><span className="sr-only">Toggle lock</span></Button>
          <Button size="sm" variant="ghost" onClick={() => move(index, 1)}>↑</Button><Button size="sm" variant="ghost" onClick={() => move(index, -1)}>↓</Button>
        </div>
      </div>;
    })}
  </div>;
}

function EditorFields({ selected, patchSelected }) {
  if (!selected) return null;
  return <Card className="border-[#d8c9b7]"><CardHeader className="pb-2"><CardTitle className="text-base text-[#4b1236]">Selected layer</CardTitle></CardHeader><CardContent className="space-y-3">
    <Field label="Layer name"><Input value={selected.name} onChange={event => patchSelected({ name: event.target.value })} /></Field>
    {selected.type === 'text' && <>
      <Field label="Text"><Input value={selected.text} onChange={event => patchSelected({ text: event.target.value })} /></Field>
      <Field label="Font"><select value={selected.fontFamily} onChange={event => patchSelected({ fontFamily: event.target.value })} className="h-10 w-full rounded-md border bg-white px-3">{STUDIO_FONTS.map(font => <option key={font}>{font}</option>)}</select></Field>
      <Field label={`Curve: ${selected.curve || 0}`}><input type="range" min="-50" max="50" value={selected.curve || 0} onChange={event => patchSelected({ curve: Number(event.target.value) })} className="w-full" /></Field>
    </>}
    {(selected.type === 'text' || selected.type === 'shape') && <Field label="Color"><Input type="color" value={selected.fill || BRAND.plum} onChange={event => patchSelected({ fill: event.target.value })} className="h-10 p-1" /></Field>}
  </CardContent></Card>;
}

export default function AdminDesignStudio() {
  const [tab, setTab] = useState('studio');
  const [history, dispatch] = useReducer(historyReducer, createStudioDocument(), createHistory);
  const document = history.present;
  const setDocument = useCallback(value => dispatch({ type: 'set', value }), []);
  const [selectedIds, setSelectedIds] = useState([]);
  const [products, setProducts] = useState([]);
  const [printAreas, setPrintAreas] = useState([]);
  const [designId, setDesignId] = useState('');
  const [version, setVersion] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [saveState, setSaveState] = useState('Not saved');
  const [previewMode, setPreviewMode] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('');
  const [areaForm, setAreaForm] = useState({ product_id: '', product_size: '*', production_route: 'hc_transfer_press', provider_key: 'hc', print_method: 'dtf', placement: 'front', width_in: '', height_in: '', min_dpi: 150, enabled: true, verified: true, source_note: '' });
  const savedJsonRef = useRef(JSON.stringify(document));

  const product = products.find(item => item.id === document.productId) || null;
  const variant = product ? findCustomizationVariant(product, document.color, document.size) : null;
  const activeArea = printAreas.find(item => item.placement === document.activePlacement && item.production_route === document.productionRoute && item.enabled);
  const warnings = useMemo(() => validateDesign(document, printAreas.filter(item => item.production_route === document.productionRoute && item.enabled)), [document, printAreas]);
  const selected = (document.placements?.[document.activePlacement] || []).find(item => selectedIds.includes(item.id));
  const printingCharge = 0;
  const pricing = calculateStudioPricing({ route: document.productionRoute, garmentRetail: productPrice(product, variant), printingCharge, quantity: document.quantity });

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase.from('storefront_products').select('*').eq('product_type', 'physical').eq('is_active', true).eq('visibility', 'public').limit(1000);
    if (error) throw error;
    const tshirts = (data || []).filter(item => {
      const name = String(item.name || '').toLowerCase();
      const shirtCategory = ['short_sleeve_shirts','mens_short_sleeve_shirts','womens_short_sleeve_shirts','youth_short_sleeve_shirts'].includes(item.category);
      const namedAsTee = /(t-?shirt|\btee\b)/i.test(name);
      const explicitlyNotTee = /(hoodie|sweatshirt|tank|polo|jacket|coat)/i.test(name);
      const legacyTee = item.category === 'apparel_blanks' && namedAsTee;
      return (shirtCategory || legacyTee) && namedAsTee && !explicitlyNotTee && !isRestrictedCustomizationProduct(item);
    });
    tshirts.sort((a, b) => (String(a.supplier_sku).toUpperCase() === '5000' ? -1 : String(b.supplier_sku).toUpperCase() === '5000' ? 1 : getPublicProductName(a).localeCompare(getPublicProductName(b))));
    setProducts(tshirts);
  }, []);
  const loadDesigns = useCallback(async () => { const data = await invoke('list'); setDesigns(data.designs || []); }, []);
  const loadStatus = useCallback(async () => { const data = await invoke('status'); setStatus(data); }, []);
  useEffect(() => { Promise.all([loadProducts(), loadDesigns(), loadStatus()]).catch(error => toast.error(error.message)); }, [loadDesigns, loadProducts, loadStatus]);
  useEffect(() => {
    if (!document.productId) { setPrintAreas([]); return; }
    supabase.from('design_print_areas').select('*').eq('product_id', document.productId).then(({ data }) => setPrintAreas(data || []));
  }, [document.productId]);

  useEffect(() => {
    const changed = JSON.stringify(document) !== savedJsonRef.current;
    if (!changed) return undefined;
    setSaveState('Unsaved changes');
    const timer = setTimeout(async () => {
      if (!document.productId || !designId) return;
      setSaveState('Autosaving…');
      try {
        const result = await invoke('save', { design_id: designId, document, explicit: false });
        setSaveState(`Autosaved ${new Date(result.design.autosaved_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
        savedJsonRef.current = JSON.stringify(document);
      } catch (error) { setSaveState('Autosave failed'); console.error('[design-studio-autosave]', error.message); }
    }, Math.max(3000, Number(status?.settings?.autosave_seconds || 8) * 1000));
    return () => clearTimeout(timer);
  }, [designId, document, status?.settings?.autosave_seconds]);

  useEffect(() => {
    const beforeUnload = event => { if (JSON.stringify(document) !== savedJsonRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [document]);

  const onProduct = id => {
    const next = products.find(item => item.id === id);
    setDocument({ ...document, productId: id, productName: next ? getPublicProductName(next) : '', productSku: next?.supplier_sku || '', productImage: displayImage(next?.image_url || ''), color: '', size: '', updatedAt: new Date().toISOString() });
  };
  const onField = (key, value) => setDocument({ ...document, [key]: value, ...(key === 'color' ? { size: '' } : {}), updatedAt: new Date().toISOString() });
  const addElement = element => {
    setDocument(updatePlacement(document, document.activePlacement, items => [...items, element]));
    setSelectedIds([element.id]); setMobilePanel('');
  };
  const patchSelected = values => setDocument(updatePlacement(document, document.activePlacement, items => items.map(item => selectedIds.includes(item.id) ? { ...item, ...values } : item)));
  const upload = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy('upload');
    try {
      const data = await invoke('upload', { filename: file.name, data: await readFile(file), design_id: designId || null });
      addElement(makeElement('image', { name: file.name, assetId: data.asset.id, storagePath: data.asset.storage_path, previewUrl: data.preview_url, pixelWidth: data.asset.pixel_width, pixelHeight: data.asset.pixel_height }));
      toast.success('Artwork validated and stored privately.');
    } catch (error) { toast.error(error.message); } finally { setBusy(''); event.target.value = ''; }
  };
  const save = async () => {
    if (!document.productId) return toast.error('Choose a garment first.');
    setBusy('save'); setSaveState('Saving…');
    try {
      const result = await invoke('save', { design_id: designId || null, document, explicit: true });
      setDesignId(result.design.id); setVersion(result.version); savedJsonRef.current = JSON.stringify(document);
      setSaveState(`Saved · version ${result.version.version_number}`); await loadDesigns();
      toast.success('Editable design and immutable version saved.');
    } catch (error) { setSaveState('Save failed'); toast.error(error.message); } finally { setBusy(''); }
  };
  const openDesign = async id => {
    setBusy('load'); try {
      const result = await invoke('load', { design_id: id });
      dispatch({ type: 'replace', value: result.design.document }); setDesignId(result.design.id); setVersion(null); setSelectedIds([]); savedJsonRef.current = JSON.stringify(result.design.document); setSaveState('Saved'); setTab('studio');
    } catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };
  const newDesign = () => { dispatch({ type: 'replace', value: createStudioDocument() }); setDesignId(''); setVersion(null); setSelectedIds([]); setSaveState('Not saved'); };
  const attachPreviewCart = () => {
    if (!version) return toast.error('Save an immutable version first.');
    if (warnings.some(item => item.level === 'blocker')) return toast.error('Resolve production blockers before attaching this design.');
    if (Number(document.quantity) >= 50) return toast.error('Orders of 50 or more use the existing Bulk Quote workflow.');
    const items = JSON.parse(localStorage.getItem('hc_design_preview_cart') || '[]');
    items.push({ id: crypto.randomUUID(), design_id: designId, design_version_id: version.id, product_id: document.productId, color: document.color, size: document.size, quantity: document.quantity, admin_preview_only: true });
    localStorage.setItem('hc_design_preview_cart', JSON.stringify(items)); toast.success('Attached to the isolated admin preview cart. Public custom checkout remains off.');
  };
  const exportPackage = async () => {
    if (!version) return toast.error('Save an immutable version first.');
    if (warnings.some(item => item.level === 'blocker')) return toast.error('Production export is blocked until artwork and print-area issues are resolved.');
    setBusy('export');
    try {
      for (const [placement, elements] of Object.entries(document.placements || {})) {
        if (!elements?.length) continue;
        const area = printAreas.find(item => item.placement === placement && item.production_route === document.productionRoute && item.enabled && item.verified);
        if (!area) throw new Error(`Verified dimensions are missing for ${placement}.`);
        const blob = await renderProductionPng(elements, area);
        const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = `hc-design-${designId}-${placement}-${area.width_in}x${area.height_in}in-300dpi.png`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      download(`hc-design-${designId}-job.json`, JSON.stringify({ generated_at: new Date().toISOString(), mockup_is_approximate: true, production_files: 'Separate transparent 300 DPI PNG files downloaded for each configured location.', design_id: designId, version, garment: { product_id: document.productId, name: document.productName, sku: document.productSku, color: document.color, size: document.size, quantity: document.quantity }, production_route: document.productionRoute, print_method: document.printMethod, print_areas: printAreas, placements: document.placements, warnings }, null, 2));
      toast.success('Production artwork and job manifest downloaded separately.');
    } catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };

  const saveArea = async event => {
    event.preventDefault();
    if (!areaForm.product_id || !areaForm.width_in || !areaForm.height_in || !areaForm.source_note.trim()) return toast.error('Product, real dimensions, and a source note are required.');
    const { error } = await supabase.from('design_print_areas').upsert({ ...areaForm, width_in: Number(areaForm.width_in), height_in: Number(areaForm.height_in), min_dpi: Number(areaForm.min_dpi), source_effective_at: new Date().toISOString() }, { onConflict: 'product_id,product_size,production_route,provider_key,print_method,placement' });
    if (error) return toast.error(error.message);
    toast.success('Verified print-area configuration saved.'); if (areaForm.product_id === document.productId) { const { data } = await supabase.from('design_print_areas').select('*').eq('product_id', document.productId); setPrintAreas(data || []); }
  };

  const sidePanels = {
    add: <AddPanel onText={() => addElement(makeElement('text'))} onShape={shape => addElement(makeElement('shape', { shape, name: `${shape[0].toUpperCase()}${shape.slice(1)}` }))} onUpload={upload} busy={busy === 'upload'} />,
    variants: <VariantPanel products={products} product={product} document={document} onProduct={onProduct} onField={onField} />,
    layers: <LayerPanel document={document} setDocument={setDocument} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />,
  };

  return <div className="min-h-screen bg-[#f7f3ea]/60 pb-24 sm:pb-8">
    <header className="border-b border-[#b58d2a]/30 bg-[#4b1236] text-white"><div className="mx-auto max-w-[1500px] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Link to="/AdminDashboard"><Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white"><ArrowLeft /></Button></Link><div><h1 className="text-xl font-bold sm:text-2xl">HC Apparel Design Studio</h1><p className="text-xs text-white/70">Admin preview · custom checkout is not public</p></div></div><div className="flex items-center gap-2"><span className="hidden text-xs text-white/70 sm:inline">{saveState}</span><Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => setPreviewMode(value => !value)}><Eye className="mr-2 h-4 w-4" />{previewMode ? 'Edit' : 'Preview'}</Button><Button className="bg-[#b58d2a] text-white hover:bg-[#99761f]" onClick={save} disabled={busy === 'save'}><Save className="mr-2 h-4 w-4" />Save</Button></div></div>
      <nav className="mt-4 flex gap-1 overflow-x-auto pb-1" aria-label="Design Studio admin sections">{TABS.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === key ? 'bg-white text-[#4b1236]' : 'bg-white/10 text-white hover:bg-white/20'}`}>{label}</button>)}</nav>
    </div></header>

    {tab === 'studio' && <main className="mx-auto max-w-[1500px] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={document.name} onChange={event => onField('name', event.target.value)} aria-label="Design name" className="h-9 min-w-[180px] flex-1 bg-white sm:max-w-sm" />
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length}><Undo2 className="mr-1 h-4 w-4" />Undo</Button>
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length}><Redo2 className="mr-1 h-4 w-4" />Redo</Button>
        <Button size="sm" variant="outline" onClick={newDesign}><Plus className="mr-1 h-4 w-4" />New</Button>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[270px_minmax(0,1fr)_280px]">
        <aside className="hidden space-y-4 lg:block"><Card><CardContent className="p-4">{sidePanels.variants}</CardContent></Card><Card><CardContent className="p-4">{sidePanels.add}</CardContent></Card></aside>
        <div className="min-w-0 space-y-3">
          <div className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2">{DESIGN_PLACEMENTS.map(([key, label]) => {
            const area = printAreas.find(item => item.placement === key && item.production_route === document.productionRoute && item.enabled);
            return <button key={key} type="button" disabled={document.productId && !area} onClick={() => { onField('activePlacement', key); setSelectedIds([]); }} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${document.activePlacement === key ? 'bg-[#4f6b45] text-white' : 'bg-muted text-foreground'} disabled:cursor-not-allowed disabled:opacity-40`} title={!area ? 'This placement needs a verified print-area configuration.' : ''}>{label}</button>;
          })}</div>
          <DesignCanvas document={document} setDocument={setDocument} printArea={activeArea} selectedIds={selectedIds} setSelectedIds={setSelectedIds} previewMode={previewMode} />
          <p className="text-center text-xs text-muted-foreground">Mockups are approximate visual previews and are never used as production artwork.</p>
        </div>
        <aside className="hidden space-y-4 lg:block"><Card><CardContent className="p-4">{sidePanels.layers}</CardContent></Card><EditorFields selected={selected} patchSelected={patchSelected} /></aside>
      </div>
      <section className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">{warnings.length ? warnings.map((warning, index) => <div key={`${warning.code}-${index}`} className={`flex gap-2 rounded-xl border p-3 text-sm ${warning.level === 'blocker' ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning.message}</div>) : <div className="flex gap-2 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" />Design checks pass for the configured placement data.</div>}</div>
        <Card className="min-w-[260px]"><CardContent className="p-4 text-sm"><p className="font-bold text-[#4b1236]">Preview pricing</p><div className="mt-2 flex justify-between"><span>Garment</span><span>${pricing.garmentRetail.toFixed(2)}</span></div><div className="flex justify-between"><span>Printing</span><span>{document.productionRoute === 'printify' ? 'Included in HC retail' : printingCharge ? `$${pricing.printingCharge.toFixed(2)}` : 'Not configured'}</span></div><div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Merchandise</span><span>${pricing.customerMerchandise.toFixed(2)}</span></div><p className="mt-2 text-xs text-amber-700">Shipping and customer tax remain separate. Incomplete internal costs are not treated as profit.</p></CardContent></Card>
      </section>
        <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={exportPackage} disabled={busy === 'export'}><Download className="mr-2 h-4 w-4" />Download production package</Button><Button variant="outline" onClick={attachPreviewCart}>Attach to preview cart</Button><Button className="bg-[#4f6b45] text-white hover:bg-[#40593a]" onClick={save}><Save className="mr-2 h-4 w-4" />Save version</Button></div>
    </main>}

    {tab === 'designs' && <main className="mx-auto max-w-6xl p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{designs.map(item => <Card key={item.id}><CardHeader><CardTitle className="text-base">{item.name}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{item.selected_color || 'No color'} · {item.selected_size || 'No size'} · Qty {item.quantity}</p><p className="text-xs text-muted-foreground">{new Date(item.updated_at).toLocaleString()}</p><div className="flex items-center justify-between"><span className="rounded-full bg-muted px-2 py-1 text-xs">{item.status}</span><Button size="sm" onClick={() => openDesign(item.id)} disabled={busy === 'load'}>Open</Button></div></CardContent></Card>)}{!designs.length && <p className="text-sm text-muted-foreground">No saved designs yet.</p>}</div></main>}

    {tab === 'review' && <main className="mx-auto max-w-6xl space-y-4 p-4"><Card><CardHeader><CardTitle>Production review</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Review saved designs, immutable versions, print warnings, variants, route, and costs here. A production job cannot be prepared while a blocker remains. Vendor submission additionally requires verified payment, artwork approval, and explicit admin confirmation.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Design</th><th>Route</th><th>Variant</th><th>Issues</th><th>Action</th></tr></thead><tbody>{designs.map(item => <tr key={item.id} className="border-b"><td className="p-2 font-semibold">{item.name}</td><td>{item.production_route}</td><td>{item.selected_color} / {item.selected_size}</td><td>{(item.validation || []).length || 'None'}</td><td><Button size="sm" variant="outline" onClick={() => openDesign(item.id)}>Review</Button></td></tr>)}</tbody></table></div></CardContent></Card></main>}

    {tab === 'areas' && <main className="mx-auto max-w-4xl p-4"><Card><CardHeader><CardTitle>Verified print-area configuration</CardTitle></CardHeader><CardContent><p className="mb-5 text-sm text-muted-foreground">No dimensions are invented. Enter a real product/size/provider/method/location measurement and record its source. Unsupported placements remain disabled.</p><form onSubmit={saveArea} className="grid gap-4 sm:grid-cols-2">
      <Field label="Product"><select value={areaForm.product_id} onChange={event => setAreaForm(value => ({ ...value, product_id: event.target.value }))} className="h-10 w-full rounded-md border bg-white px-3"><option value="">Select product</option>{products.map(item => <option key={item.id} value={item.id}>{getPublicProductName(item)} {item.supplier_sku ? `(${item.supplier_sku})` : ''}</option>)}</select></Field>
      <Field label="Size" hint="Use * only when the vendor confirms one area for every size."><Input value={areaForm.product_size} onChange={event => setAreaForm(value => ({ ...value, product_size: event.target.value }))} /></Field>
      <Field label="Route"><select value={areaForm.production_route} onChange={event => setAreaForm(value => ({ ...value, production_route: event.target.value, provider_key: event.target.value === 'printify' ? 'printify' : 'hc' }))} className="h-10 w-full rounded-md border bg-white px-3">{ACTIVE_PRODUCTION_ROUTES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="Placement"><select value={areaForm.placement} onChange={event => setAreaForm(value => ({ ...value, placement: event.target.value }))} className="h-10 w-full rounded-md border bg-white px-3">{DESIGN_PLACEMENTS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="Print method"><Input value={areaForm.print_method} onChange={event => setAreaForm(value => ({ ...value, print_method: event.target.value }))} /></Field>
      <Field label="Provider key"><Input value={areaForm.provider_key} onChange={event => setAreaForm(value => ({ ...value, provider_key: event.target.value }))} /></Field>
      <Field label="Width (inches)"><Input type="number" step=".01" min=".01" value={areaForm.width_in} onChange={event => setAreaForm(value => ({ ...value, width_in: event.target.value }))} /></Field>
      <Field label="Height (inches)"><Input type="number" step=".01" min=".01" value={areaForm.height_in} onChange={event => setAreaForm(value => ({ ...value, height_in: event.target.value }))} /></Field>
      <Field label="Minimum effective DPI"><Input type="number" min="72" max="1200" value={areaForm.min_dpi} onChange={event => setAreaForm(value => ({ ...value, min_dpi: event.target.value }))} /></Field>
      <Field label="Verification source note"><Input value={areaForm.source_note} onChange={event => setAreaForm(value => ({ ...value, source_note: event.target.value }))} placeholder="Vendor spec sheet / measured platen" /></Field>
      <div className="sm:col-span-2"><Button type="submit" className="bg-[#4f6b45] text-white">Save verified area</Button></div>
    </form></CardContent></Card></main>}

    {tab === 'vendors' && <main className="mx-auto max-w-6xl space-y-4 p-4"><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Cloud className="h-5 w-5" />Printify backup</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="font-semibold">Status: <span className={status?.printify?.verified ? 'text-green-700' : 'text-amber-700'}>{status?.printify?.verified ? 'Connected' : 'Not connected'}</span></p><p className="text-muted-foreground">{status?.printify?.verified ? `${status.printify.shop_count} API shop(s) visible. Catalog reads are available; submission remains disabled.` : 'Add a scoped Printify Personal Access Token as PRINTIFY_API_TOKEN in Supabase Edge Function secrets. Required read scopes: shops.read, catalog.read, products.read, print_providers.read. Add orders.read/orders.write only after submission QA.'}</p><p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">Printify is a backup route only. No HC garment, variant, print method, or placement is substituted without an explicit verified mapping.</p></CardContent></Card><Card><CardHeader><CardTitle>Cost models stay separate</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p><strong>HC blank + printing:</strong> website garment retail plus saved printing charges; internal blank, transfer, labor, packaging, fees, and shipping remain separate.</p><p><strong>Printify finished garment:</strong> HC-controlled retail; provider production already includes garment/printing, so no HC blank or transfer/press cost is added.</p><p className="text-muted-foreground">The October 3 screenshot amounts are stored as a dated, non-live reference only and are never used as pricing or quotes.</p></CardContent></Card></div></main>}

    {tab === 'settings' && <main className="mx-auto max-w-4xl p-4"><Card><CardHeader><CardTitle>Safe rollout settings</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="grid gap-3 sm:grid-cols-2"><p className="rounded-xl border p-4"><strong>Admin preview</strong><br /><span className="text-green-700">Enabled</span></p><p className="rounded-xl border p-4"><strong>Public Design Studio</strong><br /><span className="text-amber-700">Disabled</span></p><p className="rounded-xl border p-4"><strong>Custom-print checkout</strong><br /><span className="text-amber-700">Disabled</span></p><p className="rounded-xl border p-4"><strong>Vendor submission</strong><br /><span className="text-amber-700">Disabled</span></p></div><p className="text-muted-foreground">The previously hidden Custom Printing page remains hidden. Turning on public design and custom checkout requires a separate Super Admin approval after verified print areas, service prices, provider mappings, shipping, and QA are complete.</p></CardContent></Card></main>}

    {tab === 'studio' && <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-white px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_16px_rgba(0,0,0,.08)] lg:hidden">
      {[["variants", Shirt, 'Variants'], ['add', Plus, 'Add Design'], ['layers', Layers, 'Layers']].map(([key, Icon, label]) => <Sheet key={key} open={mobilePanel === key} onOpenChange={open => setMobilePanel(open ? key : '')}><SheetTrigger asChild><Button variant="ghost" className="h-auto flex-col gap-1 text-[11px]"><Icon className="h-5 w-5" />{label}</Button></SheetTrigger><SheetContent side="bottom" className="max-h-[82dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"><SheetHeader><SheetTitle className="sr-only">{label}</SheetTitle></SheetHeader>{sidePanels[key]}{key === 'layers' && <div className="mt-4"><EditorFields selected={selected} patchSelected={patchSelected} /></div>}</SheetContent></Sheet>)}
      <Button variant="ghost" className="h-auto flex-col gap-1 text-[11px]" onClick={save}><Save className="h-5 w-5" />Save</Button>
    </div>}
  </div>;
}
