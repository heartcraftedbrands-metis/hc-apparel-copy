import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle, Cloud, Download, Eye, Layers,
  LockKeyhole, Plus, Redo2, Save, Search, Shirt, ShoppingCart, Square, Star, Trash2, Type, Undo2, Upload, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import DesignCanvas from '@/components/design-studio/DesignCanvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  ACTIVE_PRODUCTION_ROUTES, DECORATION_METHODS, DESIGN_PLACEMENTS, STUDIO_FONTS,
  artworkQualityReport, calculatePrintingCharge, calculateStudioPricing, createHistory, createStudioDocument, historyReducer,
  makeElement, updatePlacement, validateDesign,
} from '@/lib/designStudio';
import { getCustomizationColors, getCustomizationSizes, findCustomizationVariant } from '@/lib/productCustomization';
import { getProductBrand, getPublicProductName } from '@/lib/productDisplayName';
import {
  STUDIO_GARMENT_TYPES, buildMockupViews, getStudioGarmentLabel,
  getOfficialGarmentSource, getStudioProductSummary, getVariantForColor, isStudioEligibleProduct, placementAvailability,
  previewSurface, viewForPlacement,
} from '@/lib/designStudioCatalog';

const BRAND = { plum: '#4b1236', gold: '#b58d2a', green: '#4f6b45', linen: '#f7f3ea' };
const TABS = [['studio', 'Studio'], ['designs', 'Saved Designs'], ['cart', 'Preview Cart'], ['review', 'Production Review'], ['areas', 'Print Areas'], ['vendors', 'Pricing & Methods'], ['settings', 'Settings']];

async function invoke(action, payload = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (sessionError || !accessToken) throw new Error('Your HC Apparel session is not available to the Design Studio. Sign in again, then retry.');
  const { data, error } = await supabase.functions.invoke('design-studio', {
    body: { action, ...payload },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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

function AddPanel({ onText, onShape, onTemplate, onUpload, busy }) {
  return <div className="space-y-4">
    <div><h3 className="font-bold text-[#4b1236]">Add design</h3><p className="text-xs text-muted-foreground">Only HC-managed tools and your own files are available.</p></div>
    <Button variant="outline" className="h-12 w-full justify-start" onClick={onText}><Type className="mr-3 h-5 w-5" />Editable text</Button>
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" onClick={() => onShape('rectangle')}><Square className="mr-2 h-4 w-4" />Rectangle</Button>
      <Button variant="outline" onClick={() => onShape('circle')}><Circle className="mr-2 h-4 w-4" />Circle</Button>
      <Button variant="outline" onClick={() => onShape('star')}><Star className="mr-2 h-4 w-4" />Star</Button>
      <Button variant="outline" onClick={() => onShape('line')}>— Line</Button>
    </div>
    <Button variant="outline" className="h-12 w-full justify-start" onClick={onTemplate}><Star className="mr-3 h-5 w-5 text-[#b58d2a]" />HC Classic Badge template</Button>
    <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-[#b58d2a]/60 bg-[#f7f3ea] px-3 text-sm font-semibold text-[#4b1236]">
      <Upload className="mr-2 h-4 w-4" />{busy ? 'Validating upload…' : 'Upload PNG, JPG, or SVG'}
      <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={onUpload} disabled={busy} />
    </label>
    <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
      Files are validated server-side, stored privately, and preserved separately from garment mockups. SVG scripts, event handlers, embeds, and external references are rejected.
    </div>
  </div>;
}

function VariantPanel({ products, product, document, methods, onProduct, onField, onMethod, loading, error, onRetry, onDone }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [brand, setBrand] = useState('all');
  const colors = getCustomizationColors(product);
  const sizes = getCustomizationSizes(product, document.color);
  const brands = [...new Set(products.map(item => getProductBrand(item)).filter(Boolean))].sort();
  const filtered = products.filter(item => {
    const summary = getStudioProductSummary(item);
    const haystack = `${summary.name} ${summary.brand} ${summary.style}`.toLowerCase();
    return (type === 'all' || summary.type === type)
      && (brand === 'all' || summary.brand === brand)
      && (!search.trim() || haystack.includes(search.trim().toLowerCase()));
  });
  const chosenVariant = product ? findCustomizationVariant(product, document.color, document.size) : null;
  const summary = product ? getStudioProductSummary(product) : null;
  const selectedMethod = methods.find(item => item.method_key === (document.decorationMethod || document.printMethod)) || null;
  return <div className="space-y-4">
    <div><h3 className="font-bold text-[#4b1236]">Choose Garment</h3><p className="text-xs text-muted-foreground">Live published T-shirts, pullover hoodies, zip hoodies, and crewnecks. Restricted brands stay excluded.</p></div>
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product, brand, or style" className="h-11 pl-9" /></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{STUDIO_GARMENT_TYPES.map(([value, label]) => <button type="button" key={value} onClick={() => setType(value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${type === value ? 'bg-[#4b1236] text-white' : 'border bg-white text-[#4b1236]'}`}>{label}</button>)}</div>
    <Field label="Brand"><select value={brand} onChange={event => setBrand(event.target.value)} className="h-11 w-full rounded-md border bg-white px-3 text-sm"><option value="all">All eligible brands</option>{brands.map(value => <option key={value}>{value}</option>)}</select></Field>
    {loading && <div className="rounded-xl border bg-white p-5 text-center text-sm"><span className="font-semibold text-[#4b1236]">Loading live garments…</span><p className="mt-1 text-xs text-muted-foreground">Reading current products, variants, prices, images, and inventory.</p></div>}
    {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Garments could not be loaded.</p><p className="mt-1 text-xs">{error}</p><Button size="sm" variant="outline" className="mt-3 bg-white" onClick={onRetry}>Try again</Button></div>}
    {!loading && !error && <div className="max-h-[42dvh] space-y-2 overflow-y-auto pr-1 lg:max-h-[360px]">{filtered.map(item => {
      const itemSummary = getStudioProductSummary(item);
      return <button type="button" key={item.id} onClick={() => onProduct(item.id)} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${document.productId === item.id ? 'border-[#b58d2a] bg-[#f7f3ea] ring-1 ring-[#b58d2a]' : 'bg-white hover:border-[#b58d2a]/60'}`}><img src={displayImage(item.image_url)} alt="" className="h-20 w-16 shrink-0 rounded-lg bg-white object-contain" /><span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-wide text-[#4f6b45]">{itemSummary.typeLabel} · {itemSummary.brand}</span><span className="mt-1 block text-sm font-semibold text-[#4b1236]">{itemSummary.name}</span><span className="mt-1 block text-xs text-muted-foreground">{itemSummary.style ? `Style ${itemSummary.style}` : 'Style unavailable'}</span><span className="mt-1 block text-xs"><strong>Price:</strong> ${Number(item.price || 0).toFixed(2)} <span className="text-muted-foreground">·</span> <strong>Stock:</strong> {Number(item.stock || 0).toLocaleString()} units across variants</span></span></button>;
    })}{!filtered.length && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No eligible in-stock garments match these filters. Try All eligible or another brand.</div>}</div>}
    {product && <div className="rounded-xl border border-[#b58d2a]/40 bg-[#f7f3ea] p-3"><div className="flex gap-3"><img src={document.productImage || displayImage(product.image_url)} alt={summary.name} className="h-24 w-20 shrink-0 rounded-lg bg-white object-contain" /><div className="min-w-0"><p className="text-xs font-bold uppercase text-[#4f6b45]">Selected {summary.typeLabel}</p><p className="text-sm font-bold text-[#4b1236]">{summary.name}</p><p className="mt-1 text-xs text-muted-foreground">{summary.brand}{summary.style ? ` · ${summary.style}` : ''}</p>{chosenVariant && <div className="mt-2 space-y-1 text-xs"><p><strong>SKU:</strong> {chosenVariant.sku || 'Not provided'}</p><p><strong>Price:</strong> ${productPrice(product, chosenVariant).toFixed(2)}</p><p><strong>Stock:</strong> {chosenVariant.inventory == null ? 'Catalog did not provide a variant quantity' : `${Number(chosenVariant.inventory).toLocaleString()} available`}</p></div>}</div></div></div>}
    <Field label="Color"><select value={document.color} onChange={event => onField('color', event.target.value)} disabled={!product} className="h-11 w-full rounded-md border bg-white px-3 text-sm disabled:opacity-50"><option value="">Choose color</option>{colors.map(value => <option key={value}>{value}</option>)}</select></Field>
    <Field label="Size"><select value={document.size} onChange={event => onField('size', event.target.value)} disabled={!document.color} className="h-11 w-full rounded-md border bg-white px-3 text-sm disabled:opacity-50"><option value="">Choose size</option>{sizes.map(value => <option key={value}>{value}</option>)}</select></Field>
    <Field label="Quantity"><Input type="number" min="1" value={document.quantity} onChange={event => onField('quantity', Math.max(1, Number(event.target.value) || 1))} /></Field>
    <Field label="Print / Decoration Method"><select value={document.decorationMethod || document.printMethod || 'dtf'} onChange={event => onMethod(event.target.value)} className="h-11 w-full rounded-md border bg-white px-3 text-sm">{methods.map(item => <option key={item.method_key} value={item.method_key} disabled={!item.available}>{item.customer_label}{item.available ? '' : ` — ${item.availability_label}`}</option>)}</select></Field>
    {selectedMethod && <p className={`rounded-xl border p-3 text-xs ${selectedMethod.available ? 'border-green-300 bg-green-50 text-green-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}><strong>{selectedMethod.customer_label}:</strong> {selectedMethod.available ? 'Available for configured garments and placements.' : selectedMethod.availability_label}. {selectedMethod.limits_note || ''}</p>}
    {onDone && <Button type="button" className="h-11 w-full bg-[#4f6b45] text-white hover:bg-[#40593a]" onClick={onDone} disabled={!document.productId}>Use selected garment</Button>}
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
  const remove = layer => {
    const ids = layer.groupId ? layers.filter(item => item.groupId === layer.groupId).map(item => item.id) : [layer.id];
    setDocument(updatePlacement(document, placement, items => items.filter(item => !ids.includes(item.id))));
    setSelectedIds(current => current.filter(id => !ids.includes(id)));
  };
  return <div className="space-y-3">
    <div><h3 className="font-bold text-[#4b1236]">Layers</h3><p className="text-xs text-muted-foreground">Top rows print above lower rows.</p></div>
    {!layers.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No layers on this placement.</p>}
    {[...layers].reverse().map((layer, reverseIndex) => {
      const index = layers.length - reverseIndex - 1;
      return <div key={layer.id} className={`rounded-xl border p-3 ${selectedIds.includes(layer.id) ? 'border-[#b58d2a] bg-[#f7f3ea]' : 'bg-white'}`}>
        <button type="button" className="w-full truncate text-left text-sm font-semibold" onClick={() => setSelectedIds([layer.id])}>{layer.name}</button>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} onClick={() => patch(layer.id, { visible: !layer.visible })}>{layer.visible ? <Eye className="h-4 w-4" /> : <X className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`} onClick={() => patch(layer.id, { locked: !layer.locked })}><LockKeyhole className={`h-4 w-4 ${layer.locked ? 'text-[#4b1236]' : 'opacity-40'}`} /></Button>
          <Button size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label={`Move ${layer.name} forward`} onClick={() => move(index, 1)}>↑</Button><Button size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label={`Move ${layer.name} backward`} onClick={() => move(index, -1)}>↓</Button>
          <Button size="sm" variant="destructive" className="min-h-11 min-w-11" aria-label={`Delete ${layer.name}`} onClick={() => remove(layer)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>;
    })}
  </div>;
}

function EditorFields({ selected, patchSelected, printArea, targetPpi = 300 }) {
  if (!selected) return null;
  const quality = artworkQualityReport(selected, printArea, targetPpi);
  return <Card className="border-[#d8c9b7]"><CardHeader className="pb-2"><CardTitle className="text-base text-[#4b1236]">Selected layer</CardTitle></CardHeader><CardContent className="space-y-3">
    <Field label="Layer name"><Input value={selected.name} onChange={event => patchSelected({ name: event.target.value })} /></Field>
    {selected.type === 'text' && <>
      <Field label="Text"><Input value={selected.text} onChange={event => patchSelected({ text: event.target.value })} /></Field>
      <Field label="Font"><select value={selected.fontFamily} onChange={event => patchSelected({ fontFamily: event.target.value })} className="h-10 w-full rounded-md border bg-white px-3">{STUDIO_FONTS.map(font => <option key={font}>{font}</option>)}</select></Field>
      <Field label={`Curve: ${selected.curve || 0}`}><input type="range" min="-50" max="50" value={selected.curve || 0} onChange={event => patchSelected({ curve: Number(event.target.value) })} className="w-full" /></Field>
    </>}
    {(selected.type === 'text' || selected.type === 'shape') && <Field label="Color"><Input type="color" value={selected.fill || BRAND.plum} onChange={event => patchSelected({ fill: event.target.value })} className="h-10 p-1" /></Field>}
    {selected.type === 'image' && <div className="space-y-3 rounded-xl border border-[#b58d2a]/40 bg-[#f7f3ea] p-3 text-xs">
      <div><p className="font-bold text-[#4b1236]">Artwork quality</p><p>{(selected.fileKind || selected.mimeType || 'File').toString().toUpperCase()} · {Number(selected.pixelWidth || 0).toLocaleString()} × {Number(selected.pixelHeight || 0).toLocaleString()} px</p><p>Transparency: {selected.hasTransparency === true ? 'Yes' : selected.hasTransparency === false ? 'No' : 'Not reported'}{selected.resolutionX ? ` · File metadata: ${Math.round(selected.resolutionX)} PPI` : ' · Resolution metadata not present'}</p></div>
      {!printArea?.verified && <div className="grid grid-cols-2 gap-2"><Field label="Intended width (in)"><Input type="number" min="0.1" step="0.1" value={selected.intendedWidthIn || ''} onChange={event => patchSelected({ intendedWidthIn: Number(event.target.value) || null })} /></Field><Field label="Intended height (in)"><Input type="number" min="0.1" step="0.1" value={selected.intendedHeightIn || ''} onChange={event => patchSelected({ intendedHeightIn: Number(event.target.value) || null })} /></Field></div>}
      <div className={`rounded-lg p-3 font-semibold ${quality?.state === 'good' || quality?.state === 'vector' ? 'bg-green-100 text-green-900' : quality?.state === 'low' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}><p>{quality?.label}</p>{quality?.message && <p className="mt-1 font-normal">{quality.message}</p>}{quality?.maxWidth && <p className="mt-1 font-normal">Recommended maximum at {targetPpi} PPI: {quality.maxWidth.toFixed(2)} × {quality.maxHeight.toFixed(2)} in.</p>}</div>
      {selected.containsEmbeddedRaster && <p className="text-amber-800">This SVG contains raster imagery. Its embedded pixels need separate resolution review.</p>}
      <p className="text-muted-foreground">Resolution quality does not prove vinyl-cutting suitability or embroidery digitization readiness. The original upload is preserved.</p>
    </div>}
  </CardContent></Card>;
}

export default function AdminDesignStudio({ customerMode = false }) {
  const [tab, setTab] = useState('studio');
  const [history, dispatch] = useReducer(historyReducer, createStudioDocument(), createHistory);
  const document = history.present;
  const setDocument = useCallback(value => dispatch({ type: 'set', value }), []);
  const [selectedIds, setSelectedIds] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [printAreas, setPrintAreas] = useState([]);
  const [mockupMappings, setMockupMappings] = useState([]);
  const [designId, setDesignId] = useState('');
  const [version, setVersion] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [previewCart, setPreviewCart] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [saveState, setSaveState] = useState('Not saved');
  const [previewMode, setPreviewMode] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('');
  const [areaForm, setAreaForm] = useState({ product_id: '', product_size: '*', production_route: 'hc_transfer_press', provider_key: 'hc', print_method: 'dtf', placement: 'front', width_in: '', height_in: '', min_dpi: 150, enabled: true, verified: true, source_note: '' });
  const [mockupForm, setMockupForm] = useState({ product_id: '', color_key: '*', view: 'back', source_note: '', x: 28, y: 22, width: 44, height: 58 });
  const [pricingForm, setPricingForm] = useState({ product_id: '', production_route: 'hc_transfer_press', print_method: 'dtf', placement: 'front', service_price: '', transfer_cost: '', pressing_labor_cost: '', packaging_cost: '', other_fee: '', notes: '' });
  const savedJsonRef = useRef(JSON.stringify(document));

  const product = products.find(item => item.id === document.productId) || null;
  const variant = product ? findCustomizationVariant(product, document.color, document.size) : null;
  const methodKey = document.decorationMethod || document.printMethod || 'dtf';
  const methods = status?.decoration_methods?.length ? status.decoration_methods : DECORATION_METHODS.map(([method_key, customer_label], index) => ({ method_key, customer_label, available: index === 0, availability_label: index === 0 ? 'Available' : 'Coming soon', production_route: 'hc_transfer_press' }));
  const relevantAreas = printAreas.filter(item => item.production_route === document.productionRoute && item.print_method === methodKey && item.enabled && (item.product_size === '*' || item.product_size === document.size));
  const activeArea = [...relevantAreas].sort((a, b) => Number(b.product_size === document.size) - Number(a.product_size === document.size)).find(item => item.placement === document.activePlacement);
  const warnings = useMemo(() => validateDesign(document, relevantAreas), [document, relevantAreas]);
  const selected = (document.placements?.[document.activePlacement] || []).find(item => selectedIds.includes(item.id));
  const pricingConfigs = status?.pricing_configs || [];
  const printing = calculatePrintingCharge(document, pricingConfigs, status?.pricing_packages || []);
  const printingCharge = printing.configured ? printing.unit : 0;
  const pricing = calculateStudioPricing({ route: document.productionRoute, garmentRetail: productPrice(product, variant), printingCharge, quantity: document.quantity });
  const views = useMemo(() => buildMockupViews(product, document.color, document.size, mockupMappings), [product, document.color, document.size, mockupMappings]);
  const placementState = useMemo(() => placementAvailability(product, views), [product, views]);
  const activeView = viewForPlacement(document.activePlacement);
  const activeMockup = views[activeView] || null;
  const canvasArea = previewSurface(product, document.activePlacement, activeMockup?.previewArea);
  const areaProduct = products.find(item => item.id === areaForm.product_id) || null;
  const officialAreaSource = getOfficialGarmentSource(areaProduct);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true); setProductsError('');
    try {
      const { data, error } = await supabase.from('storefront_products').select('*').eq('product_type', 'physical').eq('is_active', true).eq('visibility', 'public').limit(1000);
      if (error) throw error;
      const garments = (data || []).filter(isStudioEligibleProduct);
      garments.sort((a, b) => (String(a.style_number).toUpperCase() === '5000' || /Gildan 5000/i.test(a.name) ? -1 : String(b.style_number).toUpperCase() === '5000' || /Gildan 5000/i.test(b.name) ? 1 : getPublicProductName(a).localeCompare(getPublicProductName(b))));
      setProducts(garments);
      if (!garments.length) setProductsError('No live in-stock T-shirts, hoodies, or crewnecks passed the eligibility rules. Check product classification and customization restrictions.');
    } catch (error) {
      setProductsError(error.message || 'The live catalog request failed.');
    } finally { setProductsLoading(false); }
  }, []);
  const loadDesigns = useCallback(async () => { const data = await invoke('list'); setDesigns(data.designs || []); }, []);
  const loadStatus = useCallback(async () => { const data = await invoke('status'); setStatus(data); }, []);
  const loadPreviewCart = useCallback(async () => { if (customerMode) return; const data = await invoke('list_preview_cart'); setPreviewCart(data.items || []); }, [customerMode]);
  useEffect(() => { Promise.all([loadProducts(), loadDesigns(), loadStatus(), loadPreviewCart()]).catch(error => { setSaveState(`Load failed · ${error.message}`); toast.error(error.message); }); }, [loadDesigns, loadPreviewCart, loadProducts, loadStatus]);
  useEffect(() => {
    if (!document.productId) { setPrintAreas([]); setMockupMappings([]); return; }
    Promise.all([
      supabase.from('design_print_areas').select('*').eq('product_id', document.productId),
      invoke('mockups', { product_id: document.productId, color: document.color || '' }).catch(() => ({ mockups: [] })),
    ]).then(([areas, mockups]) => { setPrintAreas(areas.data || []); setMockupMappings(mockups.mockups || []); });
  }, [document.productId]);

  useEffect(() => {
    const changed = JSON.stringify(document) !== savedJsonRef.current;
    if (!changed) return undefined;
    setVersion(null);
    setSaveState('Unsaved changes');
    const timer = setTimeout(async () => {
      if (JSON.stringify(document) === savedJsonRef.current) return;
      if (!designId) return;
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
    const summary = next ? getStudioProductSummary(next) : null;
    const nextViews = next ? buildMockupViews(next) : {};
    const nextAvailability = placementAvailability(next, nextViews);
    const nextPlacement = nextAvailability[document.activePlacement]?.enabled ? document.activePlacement : (nextAvailability.front?.enabled ? 'front' : nextAvailability.left_chest?.enabled ? 'left_chest' : 'front');
    setDocument({ ...document, productId: id, productName: summary?.name || '', productBrand: summary?.brand || '', productStyle: summary?.style || '', garmentType: summary?.type || '', productSku: next?.style_number || '', productImage: displayImage(next?.image_url || ''), mockupViews: nextViews, color: '', size: '', activePlacement: nextPlacement, updatedAt: new Date().toISOString() });
  };
  const onField = (key, value) => {
    const changes = { [key]: value };
    if (key === 'color') {
      const selectedVariant = getVariantForColor(product, value);
      changes.size = '';
      changes.productImage = displayImage(selectedVariant?.image_url || product?.image_url || '');
      changes.productSku = selectedVariant?.sku || product?.style_number || '';
      changes.variantId = selectedVariant?.variant_id || '';
      changes.mockupViews = buildMockupViews(product, value, '', mockupMappings);
    }
    if (key === 'size') {
      const selectedVariant = findCustomizationVariant(product, document.color, value);
      changes.productImage = displayImage(selectedVariant?.image_url || document.productImage || product?.image_url || '');
      changes.productSku = selectedVariant?.sku || product?.style_number || '';
      changes.variantId = selectedVariant?.variant_id || '';
      changes.mockupViews = buildMockupViews(product, document.color, value, mockupMappings);
    }
    setDocument({ ...document, ...changes, updatedAt: new Date().toISOString() });
  };
  const onMethod = value => {
    const method = methods.find(item => item.method_key === value);
    if (!method?.available) { setSaveState(`${method?.customer_label || value} is not available yet.`); return; }
    setDocument({ ...document, decorationMethod: value, printMethod: value, productionRoute: method.production_route || 'hc_transfer_press', updatedAt: new Date().toISOString() });
  };
  const addElement = element => {
    setDocument(updatePlacement(document, document.activePlacement, items => [...items, element]));
    setSelectedIds([element.id]); setMobilePanel('');
  };
  const addTemplate = () => {
    const groupId = crypto.randomUUID();
    const badge = makeElement('shape', { name: 'HC badge', shape: 'circle', groupId, x: 30, y: 22, width: 40, height: 40, fill: BRAND.plum });
    const text = makeElement('text', { name: 'HC badge text', text: 'HC APPAREL', groupId, x: 33, y: 34, width: 34, height: 12, fill: '#f7f3ea', fontFamily: 'Georgia', fontWeight: 700, curve: 26 });
    setDocument(updatePlacement(document, document.activePlacement, items => [...items, badge, text]));
    setSelectedIds([badge.id, text.id]); setMobilePanel('');
  };
  const patchSelected = values => setDocument(updatePlacement(document, document.activePlacement, items => items.map(item => selectedIds.includes(item.id) ? { ...item, ...values } : item)));
  const upload = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy('upload');
    try {
      const data = await invoke('upload', { filename: file.name, data: await readFile(file), design_id: designId || null });
      addElement(makeElement('image', { name: file.name, assetId: data.asset.id, storagePath: data.asset.storage_path, previewUrl: data.preview_url, pixelWidth: data.asset.pixel_width, pixelHeight: data.asset.pixel_height, fileKind: data.asset.file_kind, mimeType: data.asset.mime_type, hasTransparency: data.asset.has_transparency, resolutionX: data.asset.resolution_x_ppi, resolutionY: data.asset.resolution_y_ppi, containsEmbeddedRaster: data.asset.contains_embedded_raster, intendedWidthIn: null, intendedHeightIn: null }));
      toast.success('Artwork validated and stored privately.');
    } catch (error) { toast.error(error.message); } finally { setBusy(''); event.target.value = ''; }
  };
  const persistDesign = async ({ createVersion = false } = {}) => {
    setBusy(createVersion ? 'version' : 'save'); setSaveState(createVersion ? 'Saving a stable version…' : 'Saving draft…');
    try {
      const result = await invoke('save', { design_id: designId || null, document, explicit: true, create_version: createVersion });
      setDesignId(result.design.id); if (result.version) setVersion(result.version); savedJsonRef.current = JSON.stringify(document);
      setSaveState(result.version ? `Saved · stable version ${result.version.version_number}` : 'Draft saved to HC Apparel'); await loadDesigns();
      toast.success(result.version ? `Stable version ${result.version.version_number} saved.` : 'Design draft saved.');
      return result;
    } catch (error) {
      const message = error.message || 'Design Studio request failed.';
      setSaveState(`Save failed · ${message}`);
      toast.error(message);
      throw error;
    } finally { setBusy(''); }
  };
  const save = () => persistDesign({ createVersion: false }).catch(() => null);
  const saveVersion = () => persistDesign({ createVersion: true }).catch(() => null);
  const openDesign = async id => {
    if (JSON.stringify(document) !== savedJsonRef.current && !window.confirm('You have unsaved Design Studio changes. Open another design and discard them?')) return;
    setBusy('load'); try {
      const result = await invoke('load', { design_id: id });
      const savedProduct = products.find(item => item.id === result.design.document.productId);
      const hydrated = savedProduct ? { ...result.design.document, productImage: displayImage(getVariantForColor(savedProduct, result.design.document.color, result.design.document.size)?.image_url || savedProduct.image_url || ''), mockupViews: buildMockupViews(savedProduct, result.design.document.color, result.design.document.size) } : result.design.document;
      dispatch({ type: 'replace', value: hydrated }); setDesignId(result.design.id); setVersion(null); setSelectedIds([]); savedJsonRef.current = JSON.stringify(hydrated); setSaveState('Saved'); setTab('studio');
    } catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };
  const newDesign = () => {
    if (JSON.stringify(document) !== savedJsonRef.current && !window.confirm('Start a new design and discard the unsaved changes?')) return;
    const blank = createStudioDocument(); dispatch({ type: 'replace', value: blank }); savedJsonRef.current = JSON.stringify(blank); setDesignId(''); setVersion(null); setSelectedIds([]); setSaveState('Not saved');
  };
  const attachPreviewCart = async () => {
    setBusy('cart'); setSaveState('Saving a stable version for preview cart…');
    try {
      let savedVersion = version;
      if (!savedVersion || JSON.stringify(document) !== savedJsonRef.current) {
        const saved = await persistDesign({ createVersion: true });
        savedVersion = saved.version;
      }
      setBusy('cart'); setSaveState('Attaching to isolated preview cart…');
      const result = await invoke('attach_preview_cart', { design_version_id: savedVersion.id });
      await loadPreviewCart();
      setSaveState(result.item.checkout_ready ? 'Attached · checkout-ready preview' : 'Attached · preview needs configuration');
      toast.success(result.duplicate_prevented ? 'Preview cart entry refreshed; no duplicate was created.' : 'Attached to the isolated admin preview cart.');
      setTab('cart');
    } catch (error) {
      const message = error.message || 'The design could not be attached to the preview cart.';
      setSaveState(`Preview cart failed · ${message}`); toast.error(message);
    } finally { setBusy(''); }
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

  const uploadMockup = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.mockup_file?.files?.[0];
    if (!mockupForm.product_id || !file || !mockupForm.source_note.trim()) return toast.error('Product, photographic file, and authorized source note are required.');
    setBusy('mockup');
    try {
      const data = await invoke('upload_mockup', { ...mockupForm, preview_area: { x: Number(mockupForm.x), y: Number(mockupForm.y), width: Number(mockupForm.width), height: Number(mockupForm.height) }, filename: file.name, data: await readFile(file) });
      toast.success('Authorized garment view uploaded and mapped.');
      if (mockupForm.product_id === document.productId) setMockupMappings(items => [...items.filter(item => !(item.color_key === data.mockup.color_key && item.view === data.mockup.view)), data.mockup]);
      form.reset();
    } catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };

  const savePricing = async event => {
    event.preventDefault();
    if (!pricingForm.service_price || !pricingForm.placement) return toast.error('A real customer service price and placement are required.');
    const scope = { production_route: pricingForm.production_route, product_id: pricingForm.product_id || null, print_method: pricingForm.print_method || null, placement: pricingForm.placement };
    const values = { ...scope, service_price: Number(pricingForm.service_price), transfer_cost: pricingForm.transfer_cost === '' ? null : Number(pricingForm.transfer_cost), pressing_labor_cost: pricingForm.pressing_labor_cost === '' ? null : Number(pricingForm.pressing_labor_cost), packaging_cost: pricingForm.packaging_cost === '' ? null : Number(pricingForm.packaging_cost), other_fee: pricingForm.other_fee === '' ? null : Number(pricingForm.other_fee), notes: pricingForm.notes.trim() || null, active: true, effective_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    let query = supabase.from('design_pricing_config').select('id').eq('production_route', scope.production_route).eq('placement', scope.placement);
    query = scope.product_id ? query.eq('product_id', scope.product_id) : query.is('product_id', null);
    query = scope.print_method ? query.eq('print_method', scope.print_method) : query.is('print_method', null);
    const { data: existing, error: lookupError } = await query.maybeSingle();
    if (lookupError) return toast.error(lookupError.message);
    const result = existing ? await supabase.from('design_pricing_config').update(values).eq('id', existing.id) : await supabase.from('design_pricing_config').insert(values);
    if (result.error) return toast.error(result.error.message);
    await loadStatus(); toast.success('Secure Design Studio printing price saved. Existing invoices and historical orders were not changed.');
  };
  const saveDecorationMethod = async (event, methodKeyValue) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const { error } = await supabase.from('design_decoration_methods').update({
      available: values.available === 'true', availability_label: values.availability_label,
      production_route: values.production_route, limits_note: values.limits_note || null,
      compatible_garment_types: String(values.compatible_garment_types || '').split(',').map(value => value.trim()).filter(Boolean),
      compatible_placements: String(values.compatible_placements || '').split(',').map(value => value.trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    }).eq('method_key', methodKeyValue);
    if (error) return toast.error(error.message);
    await loadStatus(); toast.success(`${values.customer_label} method settings saved.`);
  };
  const saveRasterTarget = async event => {
    event.preventDefault();
    const target = Number(new FormData(event.currentTarget).get('default_raster_ppi'));
    if (target < 72 || target > 1200) return toast.error('Raster target must be between 72 and 1200 PPI.');
    const { error } = await supabase.from('design_studio_settings').update({ default_raster_ppi: target, updated_at: new Date().toISOString() }).eq('id', true);
    if (error) return toast.error(error.message);
    await loadStatus(); toast.success('Artwork quality target saved.');
  };

  const visibleTabs = customerMode ? TABS.filter(([key]) => ['studio', 'designs'].includes(key)) : TABS;
  const sidePanels = {
    add: <AddPanel onText={() => addElement(makeElement('text'))} onShape={shape => addElement(makeElement('shape', { shape, name: `${shape[0].toUpperCase()}${shape.slice(1)}` }))} onTemplate={addTemplate} onUpload={upload} busy={busy === 'upload'} />,
    variants: <VariantPanel products={products} product={product} document={document} methods={methods} onProduct={onProduct} onField={onField} onMethod={onMethod} loading={productsLoading} error={productsError} onRetry={loadProducts} onDone={() => setMobilePanel('')} />,
    layers: <LayerPanel document={document} setDocument={setDocument} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />,
  };

  return <div className="min-h-screen bg-[#f7f3ea]/60 pb-40 lg:pb-8">
    <header className="border-b border-[#b58d2a]/30 bg-[#4b1236] text-white"><div className="mx-auto max-w-[1500px] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Link to={customerMode ? '/ShopGarments' : '/AdminDashboard'}><Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white"><ArrowLeft /></Button></Link><div><h1 className="text-xl font-bold sm:text-2xl">HC Apparel Design Studio</h1><p className="text-xs text-white/70">{customerMode ? 'Create and save your apparel design' : 'Admin preview · custom checkout is not public'}</p></div></div><div className="flex items-center gap-2"><Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => setPreviewMode(value => !value)}><Eye className="mr-2 h-4 w-4" />{previewMode ? 'Edit' : 'Preview'}</Button><Button className="min-w-[104px] bg-[#b58d2a] text-white hover:bg-[#99761f]" onClick={save} disabled={Boolean(busy)}><Save className="mr-2 h-4 w-4" />{busy === 'save' ? 'Saving…' : 'Save'}</Button></div></div>
      <p role="status" aria-live="polite" className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${/failed|unavailable/i.test(saveState) ? 'bg-red-950/50 text-red-100' : /saving|attaching/i.test(saveState) ? 'bg-white/15 text-white' : 'bg-white/10 text-white/90'}`}>{saveState}</p>
      <nav className="mt-4 flex gap-1 overflow-x-auto pb-1" aria-label={customerMode ? 'Design Studio sections' : 'Design Studio admin sections'}>{visibleTabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === key ? 'bg-white text-[#4b1236]' : 'bg-white/10 text-white hover:bg-white/20'}`}>{label}</button>)}</nav>
    </div></header>

    {tab === 'studio' && <main className="mx-auto max-w-[1500px] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={document.name} onChange={event => onField('name', event.target.value)} aria-label="Design name" className="h-9 min-w-[180px] flex-1 bg-white sm:max-w-sm" />
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length}><Undo2 className="mr-1 h-4 w-4" />Undo</Button>
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length}><Redo2 className="mr-1 h-4 w-4" />Redo</Button>
        <Button size="sm" variant="outline" onClick={newDesign}><Plus className="mr-1 h-4 w-4" />New</Button>
      </div>
      <section className="mb-4 rounded-2xl border border-[#b58d2a]/45 bg-white p-3 shadow-sm sm:p-4" aria-label="Selected garment">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {product ? <img src={document.productImage || displayImage(product.image_url)} alt={document.productName} className="h-24 w-20 shrink-0 rounded-xl border bg-white object-contain" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[#f7f3ea]"><Shirt className="h-8 w-8 text-[#4b1236]" /></div>}
            <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.12em] text-[#4f6b45]">Garment comes first</p><h2 className="mt-1 text-base font-bold text-[#4b1236] sm:text-lg">{product ? document.productName : 'Choose a real live garment'}</h2><p className="mt-1 text-sm text-muted-foreground">{product ? `${getStudioGarmentLabel(product)} · ${document.color || 'Choose color'} · ${document.size || 'Choose size'} · ${variant?.sku ? `SKU ${variant.sku} · ` : ''}$${productPrice(product, variant).toFixed(2)}` : 'Search eligible T-shirts, pullover or zip hoodies, and crewneck sweatshirts before using the canvas.'}</p></div>
          </div>
          <Button type="button" className="h-12 shrink-0 bg-[#4b1236] text-white hover:bg-[#351026]" onClick={() => setMobilePanel('variants')}><Shirt className="mr-2 h-5 w-5" />{product ? 'Change Garment' : 'Choose Garment'}</Button>
        </div>
      </section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[270px_minmax(0,1fr)_280px]">
        <aside className="hidden space-y-4 lg:block"><Card><CardContent className="p-4">{sidePanels.variants}</CardContent></Card><Card><CardContent className="p-4">{sidePanels.add}</CardContent></Card></aside>
        <div className="min-w-0 space-y-3">
          <div className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2">{DESIGN_PLACEMENTS.map(([key, label]) => {
            const state = placementState[key] || { enabled: false, reason: 'Choose a garment first.' };
            return <button key={key} type="button" disabled={!state.enabled} onClick={() => { onField('activePlacement', key); setSelectedIds([]); }} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${document.activePlacement === key ? 'bg-[#4f6b45] text-white' : 'bg-muted text-foreground'} disabled:cursor-not-allowed disabled:opacity-40`} title={state.reason || (relevantAreas.some(item => item.placement === key) ? '' : 'Draft editing is available; production calibration is still required.')}>{label}</button>;
          })}</div>
          <DesignCanvas document={document} setDocument={setDocument} printArea={activeArea} selectedIds={selectedIds} setSelectedIds={setSelectedIds} previewMode={previewMode} mockup={activeMockup} previewArea={canvasArea} unavailableReason={placementState[document.activePlacement]?.reason} />
          <p className="text-center text-xs text-muted-foreground">The garment photo is the current live catalog variant or an admin-mapped authorized view. Artwork overlays are approximate previews and the garment photograph is never included in production artwork.</p>
        </div>
        <aside className="hidden space-y-4 lg:block"><Card><CardContent className="p-4">{sidePanels.layers}</CardContent></Card><EditorFields selected={selected} patchSelected={patchSelected} printArea={activeArea} targetPpi={status?.settings?.default_raster_ppi || 300} /></aside>
      </div>
      <section className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">{warnings.length ? warnings.map((warning, index) => <div key={`${warning.code}-${index}`} className={`flex gap-2 rounded-xl border p-3 text-sm ${warning.level === 'blocker' ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning.message}</div>) : <div className="flex gap-2 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" />Design checks pass for the configured placement data.</div>}</div>
        <Card className="min-w-0 md:min-w-[260px]"><CardContent className="p-4 text-sm"><p className="font-bold text-[#4b1236]">Preview pricing</p><div className="mt-2 flex justify-between gap-3"><span>Known garment amount × {document.quantity}</span><span>${pricing.garmentRetail.toFixed(2)}</span></div><div className="flex justify-between gap-3"><span>Printing × {document.quantity}</span><span>{printing.configured ? `$${pricing.printingCharge.toFixed(2)}` : 'Not configured'}</span></div><div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Merchandise estimate</span><span>{printing.configured ? `$${pricing.customerMerchandise.toFixed(2)}` : 'Incomplete'}</span></div><p className="mt-2 text-xs text-amber-700">Shipping and customer tax remain separate. When printing is unconfigured, the garment amount is not presented as a complete merchandise total. Saved package prices prevent double-counting front/back or both-sleeve combinations.</p></CardContent></Card>
      </section>
        <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:justify-end"><Button variant="outline" onClick={exportPackage} disabled={Boolean(busy)}><Download className="mr-2 h-4 w-4" />Download production package</Button><Button variant="outline" onClick={attachPreviewCart} disabled={Boolean(busy)}><ShoppingCart className="mr-2 h-4 w-4" />{busy === 'cart' ? 'Attaching…' : 'Attach to preview cart'}</Button><Button className="bg-[#4f6b45] text-white hover:bg-[#40593a]" onClick={saveVersion} disabled={Boolean(busy)}><Save className="mr-2 h-4 w-4" />{busy === 'version' ? 'Saving version…' : 'Save Version'}</Button></div>
    </main>}

    {tab === 'designs' && <main className="mx-auto max-w-6xl p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{designs.map(item => <Card key={item.id}><CardHeader><CardTitle className="text-base">{item.name}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{item.selected_color || 'No color'} · {item.selected_size || 'No size'} · Qty {item.quantity}</p><p className="text-xs text-muted-foreground">{new Date(item.updated_at).toLocaleString()}</p><div className="flex items-center justify-between"><span className="rounded-full bg-muted px-2 py-1 text-xs">{item.status}</span><Button size="sm" onClick={() => openDesign(item.id)} disabled={busy === 'load'}>Open</Button></div></CardContent></Card>)}{!designs.length && <p className="text-sm text-muted-foreground">No saved designs yet.</p>}</div></main>}

    {tab === 'cart' && <main className="mx-auto max-w-6xl space-y-4 p-4"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-[#4b1236]"><ShoppingCart className="h-5 w-5" />Isolated admin preview cart</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">These entries are durable server-side previews only. They cannot enter public checkout or production while required configuration is missing.</p></CardContent></Card><div className="grid gap-3 md:grid-cols-2">{previewCart.map(item => <Card key={item.id}><CardContent className="space-y-3 p-4"><div className="flex gap-3">{item.thumbnail_url && <img src={displayImage(item.thumbnail_url)} alt="" className="h-24 w-20 rounded-lg border bg-white object-contain" />}<div><p className="font-bold text-[#4b1236]">{item.product_name || 'Garment not selected'}</p><p className="text-xs text-muted-foreground">{item.selected_color || 'Color pending'} · {item.selected_size || 'Size pending'} · Qty {item.quantity}</p><p className="text-xs">Method: {(methods.find(value => value.method_key === item.decoration_method)?.customer_label) || item.decoration_method}</p></div></div><div className={`rounded-lg p-3 text-sm ${item.checkout_ready ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}><p className="flex items-center gap-2 font-bold">{item.checkout_ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{item.checkout_ready ? 'Checkout-ready preview' : 'Not checkout-ready'}</p>{!item.pricing_complete && <p className="mt-1">Known garment amount: {item.garment_unit_price == null ? 'pending' : `$${Number(item.garment_unit_price).toFixed(2)} each`}. Printing estimate is incomplete.</p>}{(item.blockers || []).length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{item.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blocker.message}</li>)}</ul>}</div><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Stable version · {item.design_checksum?.slice(0, 10)}</p><Button size="sm" onClick={() => openDesign(item.design_id)}>Open design</Button></div></CardContent></Card>)}{!previewCart.length && <p className="text-sm text-muted-foreground">No designs are attached yet.</p>}</div></main>}

    {tab === 'review' && <main className="mx-auto max-w-6xl space-y-4 p-4"><Card><CardHeader><CardTitle>Production review</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Review saved designs, immutable versions, print warnings, variants, route, and costs here. A production job cannot be prepared while a blocker remains. Vendor submission additionally requires verified payment, artwork approval, and explicit admin confirmation.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Design</th><th>Route</th><th>Variant</th><th>Issues</th><th>Action</th></tr></thead><tbody>{designs.map(item => <tr key={item.id} className="border-b"><td className="p-2 font-semibold">{item.name}</td><td>{item.production_route}</td><td>{item.selected_color} / {item.selected_size}</td><td>{(item.validation || []).length || 'None'}</td><td><Button size="sm" variant="outline" onClick={() => openDesign(item.id)}>Review</Button></td></tr>)}</tbody></table></div></CardContent></Card></main>}

    {tab === 'areas' && <main className="mx-auto max-w-4xl p-4"><Card><CardHeader><CardTitle>Verified print-area configuration</CardTitle></CardHeader><CardContent><p className="mb-5 text-sm text-muted-foreground">No dimensions are invented. Enter a real product/size/provider/method/location measurement and record its source. Unsupported placements remain disabled.</p><form onSubmit={saveArea} className="grid gap-4 sm:grid-cols-2">
      <Field label="Product"><select value={areaForm.product_id} onChange={event => setAreaForm(value => ({ ...value, product_id: event.target.value }))} className="h-10 w-full rounded-md border bg-white px-3"><option value="">Select product</option>{products.map(item => <option key={item.id} value={item.id}>{getPublicProductName(item)} {item.supplier_sku ? `(${item.supplier_sku})` : ''}</option>)}</select></Field>
      {officialAreaSource && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 sm:col-span-2"><a href={officialAreaSource.url} target="_blank" rel="noreferrer" className="font-bold underline">{officialAreaSource.label}</a><p className="mt-1">{officialAreaSource.note} Record a measured platen, approved transfer limit, or printer/provider specification before marking inches verified.</p></div>}
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
    </form></CardContent></Card>
    <Card className="mt-4"><CardHeader><CardTitle>Real garment view mapping</CardTitle></CardHeader><CardContent><p className="mb-5 text-sm text-muted-foreground">Catalog front photos are used automatically. Upload only an authorized real back or sleeve photograph when that exact product/view is available. The source and normalized preview surface are recorded; no view is fabricated.</p><form onSubmit={uploadMockup} className="grid gap-4 sm:grid-cols-2">
      <Field label="Product"><select value={mockupForm.product_id} onChange={event => setMockupForm(value => ({ ...value, product_id: event.target.value }))} className="h-10 w-full rounded-md border bg-white px-3"><option value="">Select product</option>{products.map(item => <option key={item.id} value={item.id}>{getPublicProductName(item)}</option>)}</select></Field>
      <Field label="Color" hint="Use * only for an asset verified to represent every color."><Input value={mockupForm.color_key} onChange={event => setMockupForm(value => ({ ...value, color_key: event.target.value }))} /></Field>
      <Field label="View"><select value={mockupForm.view} onChange={event => setMockupForm(value => ({ ...value, view: event.target.value }))} className="h-10 w-full rounded-md border bg-white px-3"><option value="front">Front</option><option value="back">Back</option><option value="left_sleeve">Wearer-left sleeve</option><option value="right_sleeve">Wearer-right sleeve</option></select></Field>
      <Field label="Authorized source note"><Input value={mockupForm.source_note} onChange={event => setMockupForm(value => ({ ...value, source_note: event.target.value }))} placeholder="S&S catalog / licensed photographer / vendor asset" /></Field>
      <Field label="PNG or JPG photograph"><Input name="mockup_file" type="file" accept="image/png,image/jpeg" /></Field>
      <div className="grid grid-cols-4 gap-2"><Field label="X"><Input type="number" min="0" max="100" value={mockupForm.x} onChange={event => setMockupForm(value => ({ ...value, x: event.target.value }))} /></Field><Field label="Y"><Input type="number" min="0" max="120" value={mockupForm.y} onChange={event => setMockupForm(value => ({ ...value, y: event.target.value }))} /></Field><Field label="Width"><Input type="number" min="1" max="100" value={mockupForm.width} onChange={event => setMockupForm(value => ({ ...value, width: event.target.value }))} /></Field><Field label="Height"><Input type="number" min="1" max="120" value={mockupForm.height} onChange={event => setMockupForm(value => ({ ...value, height: event.target.value }))} /></Field></div>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy === 'mockup'} className="bg-[#4f6b45] text-white"><Upload className="mr-2 h-4 w-4" />{busy === 'mockup' ? 'Validating and saving…' : 'Upload and map view'}</Button></div>
    </form></CardContent></Card></main>}

    {tab === 'vendors' && <main className="mx-auto max-w-6xl space-y-4 p-4"><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Cloud className="h-5 w-5" />Printify backup</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="font-semibold">Status: <span className={status?.printify?.verified ? 'text-green-700' : 'text-amber-700'}>{status?.printify?.verified ? 'Connected' : 'Deferred · not required'}</span></p><p className="text-muted-foreground">{status?.printify?.verified ? `${status.printify.shop_count} API shop(s) visible. Catalog reads are available; submission remains disabled.` : 'Printify API work is deferred. Missing credentials do not block garment selection, designing, saving, previewing, HC pricing, or vendor-neutral production exports.'}</p><p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">Printify remains a disabled backup route. No HC garment, variant, print method, placement, quote, or order is substituted or submitted.</p></CardContent></Card><Card><CardHeader><CardTitle>Cost models stay separate</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p><strong>HC blank + printing:</strong> website garment retail plus saved printing charges; internal blank, transfer, labor, packaging, fees, and shipping remain separate.</p><p><strong>Printify finished garment:</strong> HC-controlled retail; provider production already includes garment/printing, so no HC blank or transfer/press cost is added.</p><p className="text-muted-foreground">The October 3 screenshot amounts are stored as a dated, non-live reference only and are never used as pricing or quotes.</p></CardContent></Card></div>
      <Card><CardHeader><CardTitle>Print / decoration method availability</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Customers choose a method, never a fulfillment vendor. Availability, garment and placement limits, prices, and internal routing stay here in Super Admin.</p><div className="grid gap-3 lg:grid-cols-2">{methods.map(method => <form key={method.method_key} onSubmit={event => saveDecorationMethod(event, method.method_key)} className="space-y-3 rounded-xl border p-4"><input type="hidden" name="customer_label" value={method.customer_label} /><div className="flex items-center justify-between"><strong className="text-[#4b1236]">{method.customer_label}</strong><span className={`rounded-full px-2 py-1 text-xs ${method.available ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{method.available ? 'Available' : method.availability_label}</span></div><Field label="Customer availability"><select name="available" defaultValue={String(method.available)} className="h-10 w-full rounded-md border bg-white px-3"><option value="true">Available</option><option value="false">Unavailable</option></select></Field><Field label="Unavailable label"><Input name="availability_label" defaultValue={method.availability_label} /></Field><Field label="Internal production route"><select name="production_route" defaultValue={method.production_route} className="h-10 w-full rounded-md border bg-white px-3">{ACTIVE_PRODUCTION_ROUTES.map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></Field><Field label="Compatible garment types" hint="Comma-separated internal keys."><Input name="compatible_garment_types" defaultValue={(method.compatible_garment_types || []).join(', ')} /></Field><Field label="Compatible placements" hint="Comma-separated internal keys."><Input name="compatible_placements" defaultValue={(method.compatible_placements || []).join(', ')} /></Field><Field label="Method limits and setup note"><Input name="limits_note" defaultValue={method.limits_note || ''} /></Field><Button type="submit" variant="outline">Save method settings</Button></form>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Secure HC printing service prices</CardTitle></CardHeader><CardContent><p className="mb-5 text-sm text-muted-foreground">These server-side prices are separate from garment retail, shipping, and tax. Existing Heart Command Center DTF price points are shared here for studio pricing. Product-specific values override general values. Saving here never changes invoice-specific overrides or historical order prices.</p><form onSubmit={savePricing} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Product scope" hint="Leave as All eligible garments for a true universal service price."><select value={pricingForm.product_id} onChange={event => setPricingForm(value => ({ ...value, product_id: event.target.value }))} className="h-10 w-full rounded-md border bg-white px-3"><option value="">All eligible garments</option>{products.map(item => <option key={item.id} value={item.id}>{getPublicProductName(item)}</option>)}</select></Field>
        <Field label="Production route"><select value={pricingForm.production_route} onChange={event => setPricingForm(value => ({ ...value, production_route: event.target.value }))} className="h-10 w-full rounded-md border bg-white px-3">{ACTIVE_PRODUCTION_ROUTES.filter(([key]) => key !== 'printify').map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Placement"><select value={pricingForm.placement} onChange={event => setPricingForm(value => ({ ...value, placement: event.target.value }))} className="h-10 w-full rounded-md border bg-white px-3">{DESIGN_PLACEMENTS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Print method"><select value={pricingForm.print_method} onChange={event => setPricingForm(value => ({ ...value, print_method: event.target.value, production_route: methods.find(item => item.method_key === event.target.value)?.production_route || value.production_route }))} className="h-10 w-full rounded-md border bg-white px-3">{methods.map(method => <option key={method.method_key} value={method.method_key}>{method.customer_label}{method.available ? '' : ` — ${method.availability_label}`}</option>)}</select></Field>
        <Field label="Customer service price"><Input type="number" min="0" step=".01" value={pricingForm.service_price} onChange={event => setPricingForm(value => ({ ...value, service_price: event.target.value }))} /></Field>
        <Field label="Transfer cost"><Input type="number" min="0" step=".01" value={pricingForm.transfer_cost} onChange={event => setPricingForm(value => ({ ...value, transfer_cost: event.target.value }))} /></Field>
        <Field label="Pressing labor cost"><Input type="number" min="0" step=".01" value={pricingForm.pressing_labor_cost} onChange={event => setPricingForm(value => ({ ...value, pressing_labor_cost: event.target.value }))} /></Field>
        <Field label="Packaging cost"><Input type="number" min="0" step=".01" value={pricingForm.packaging_cost} onChange={event => setPricingForm(value => ({ ...value, packaging_cost: event.target.value }))} /></Field>
        <Field label="Other internal fee"><Input type="number" min="0" step=".01" value={pricingForm.other_fee} onChange={event => setPricingForm(value => ({ ...value, other_fee: event.target.value }))} /></Field>
        <div className="sm:col-span-2 lg:col-span-3"><Field label="Notes"><Input value={pricingForm.notes} onChange={event => setPricingForm(value => ({ ...value, notes: event.target.value }))} placeholder="Scope and source of the approved price" /></Field></div>
        <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" className="bg-[#4f6b45] text-white">Save active printing price</Button></div>
      </form></CardContent></Card>
    </main>}

    {tab === 'settings' && <main className="mx-auto max-w-4xl space-y-4 p-4"><Card><CardHeader><CardTitle>Safe rollout settings</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="grid gap-3 sm:grid-cols-2"><p className="rounded-xl border p-4"><strong>Admin preview</strong><br /><span className="text-green-700">Enabled</span></p><p className="rounded-xl border p-4"><strong>Public Design Studio</strong><br /><span className="text-amber-700">Disabled</span></p><p className="rounded-xl border p-4"><strong>Custom-print checkout</strong><br /><span className="text-amber-700">Disabled</span></p><p className="rounded-xl border p-4"><strong>Vendor submission</strong><br /><span className="text-amber-700">Disabled</span></p></div><p className="text-muted-foreground">The previously hidden Custom Printing page remains hidden. Turning on public design and custom checkout requires a separate Super Admin approval after verified print areas, service prices, provider mappings, shipping, and QA are complete.</p></CardContent></Card><Card><CardHeader><CardTitle>Artwork quality target</CardTitle></CardHeader><CardContent><form onSubmit={saveRasterTarget} className="flex flex-col gap-3 sm:flex-row sm:items-end"><Field label="Default raster target (PPI)" hint="Used for quality feedback; file metadata alone never proves sufficient resolution."><Input name="default_raster_ppi" type="number" min="72" max="1200" defaultValue={status?.settings?.default_raster_ppi || 300} /></Field><Button type="submit">Save target</Button></form></CardContent></Card></main>}

    {tab === 'studio' && <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 grid grid-cols-4 border-t bg-white px-2 pb-2 pt-2 shadow-[0_-4px_16px_rgba(0,0,0,.08)] lg:hidden">
      {[["variants", Shirt, 'Variants'], ['add', Plus, 'Add Design'], ['layers', Layers, 'Layers']].map(([key, Icon, label]) => <Sheet key={key} open={mobilePanel === key} onOpenChange={open => setMobilePanel(open ? key : '')}><SheetTrigger asChild><Button variant="ghost" className="h-auto flex-col gap-1 text-[11px]"><Icon className="h-5 w-5" />{label}</Button></SheetTrigger><SheetContent side="bottom" className="max-h-[82dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"><SheetHeader><SheetTitle className="sr-only">{label}</SheetTitle></SheetHeader>{sidePanels[key]}{key === 'layers' && <div className="mt-4"><EditorFields selected={selected} patchSelected={patchSelected} printArea={activeArea} targetPpi={status?.settings?.default_raster_ppi || 300} /></div>}</SheetContent></Sheet>)}
      <Button variant="ghost" className="h-auto flex-col gap-1 text-[11px]" onClick={save} disabled={Boolean(busy)}><Save className="h-5 w-5" />{busy === 'save' ? 'Saving…' : 'Save'}</Button>
    </div>}
  </div>;
}
