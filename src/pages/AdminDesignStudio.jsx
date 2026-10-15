import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle, Cloud, Download, Eye, Layers,
  LockKeyhole, Plus, Redo2, Save, Search, Shirt, ShoppingCart, Square, Star, Trash2, Type, Undo2, Upload, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import ArtworkSizeControls from '@/components/design-studio/ArtworkSizeControls';
import DesignCanvas from '@/components/design-studio/DesignCanvas';
import TextEditorPanel from '@/components/design-studio/TextEditorPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  ACTIVE_PRODUCTION_ROUTES, DECORATION_METHODS, DESIGN_PLACEMENTS,
  artworkQualityReport, calculatePrintingCharge, calculateStudioPricing, createHistory, createStudioDocument, historyReducer,
  ensureStudioFontLoaded, initialTextColorForGarment, initializeArtworkSizing, makeElement, recalculateTextBounds, updatePlacement, validateDesign,
} from '@/lib/designStudio';
import { getCustomizationSizes, findCustomizationVariant } from '@/lib/productCustomization';
import { getProductBrand, getPublicProductName } from '@/lib/productDisplayName';
import {
  STUDIO_BRANDS, STUDIO_GARMENT_CLASSIFICATIONS, STUDIO_GARMENT_TYPES, buildMockupViews, getApprovedStudioImageMap, getStudioCustomizationColors, getStudioGarmentLabel,
  getOfficialGarmentSource, getStudioProductPreviewImage, getStudioProductSummary, getVariantForColor, getVariantImage, isStudioEligibleProduct, placementAvailability,
  previewPhysicalScale, previewSurface, viewForPlacement,
} from '@/lib/designStudioCatalog';
import {
  DESIGN_LOCATION_GROUPS, designLocationIsCompatible, designLocationPreviewArea, designLocationSizingArea,
  getActiveDesignLocation, selectDesignLocation, upgradeStudioDocument,
} from '@/lib/designLocationRegistry';

const DEFAULT_ARTWORK_COLOR = '#4e602e';
const DEFAULT_ARTWORK_CONTRAST = '#f9f7f1';
const TABS = [['studio', 'Studio'], ['designs', 'Saved Designs'], ['cart', 'Preview Cart'], ['review', 'Production Review'], ['areas', 'Print Areas'], ['vendors', 'Pricing & Methods'], ['settings', 'Settings']];
const CUSTOMER_TABS = [['studio', 'Design'], ['designs', 'Saved Designs'], ['quotes', 'Quote Requests']];
const HC_METHOD_KEYS = new Set(['dtf', 'soft_vinyl', 'puff_vinyl', 'glitter_vinyl', 'flock_vinyl']);
const VINYL_METHOD_KEYS = ['soft_vinyl', 'puff_vinyl', 'glitter_vinyl', 'flock_vinyl'];
const QUOTE_REQUIRED_METHOD_KEYS = new Set(['dtf', 'dtg', 'embroidery', 'screen_print', 'screen_printing']);

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

const serializeFrontImageMap = value => Object.entries(value || {}).map(([color, url]) => `${color} | ${url}`).join('\n');
const parseFrontImageMap = value => Object.fromEntries(String(value || '').split(/\r?\n/).map(line => {
  const separator = line.indexOf('|');
  return separator < 0 ? ['', ''] : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
}).filter(([color, url]) => color && url));

function productPrice(product, variant) {
  const value = variant?.price ?? product?.price;
  return value == null || value === '' || Number(value) <= 0 ? null : Number(value);
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
  await Promise.all(elements.filter(item => item.type === 'text' && item.visible).map(ensureStudioFontLoaded));
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
      const text = await ensureStudioFontLoaded(element);
      const fontSize = Math.max(1, (text.fontSize / 72) * dpi);
      const letterSpacing = text.letterSpacing * fontSize;
      const lines = String(text.text ?? '').split(/\r?\n/);
      const lineAdvance = fontSize * text.lineSpacing;
      const measureLine = line => context.measureText(line).width + Math.max(0, [...line].length - 1) * letterSpacing;
      const drawLine = (line, startX, baselineY) => {
        if (!letterSpacing) { context.fillText(line, startX, baselineY); return; }
        let cursor = startX;
        for (const character of [...line]) { context.fillText(character, cursor, baselineY); cursor += context.measureText(character).width + letterSpacing; }
      };
      context.fillStyle = text.fill;
      context.font = `${text.fontStyle} ${text.fontWeight} ${fontSize}px "${text.fontFamily}"`;
      context.textAlign = 'left'; context.textBaseline = 'top';
      if (Number(text.curve) && lines.length === 1) {
        const characters = [...String(text.text || '')];
        const direction = Number(text.curve) > 0 ? -1 : 1;
        const arc = Math.min(Math.PI * .9, Math.abs(Number(text.curve)) / 50 * Math.PI * .75);
        const radius = Math.max(width, height) / Math.max(.2, arc);
        characters.forEach((character, index) => {
          const angle = direction * (-arc / 2 + (arc * (index + .5)) / Math.max(1, characters.length));
          context.save(); context.translate(width / 2 + Math.sin(angle) * radius, height / 2 + direction * (radius - Math.cos(angle) * radius)); context.rotate(direction * angle); context.fillText(character, 0, -fontSize / 2); context.restore();
        });
      } else {
        lines.forEach((line, index) => {
          const measured = measureLine(line);
          const lineX = text.textAlign === 'left' ? 0 : text.textAlign === 'right' ? width - measured : (width - measured) / 2;
          drawLine(line, lineX, index * lineAdvance);
        });
      }
    }
    context.restore();
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Production artwork could not be rendered.')), 'image/png'));
}

function Field({ label, children, hint }) {
  return <label className="block min-w-0 text-sm font-medium">{label}<div className="mt-1">{children}</div>{hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}</label>;
}

function PlacementDiagram({ location }) {
  const back = location.view_side === 'back';
  const surface = location.surface_key;
  const anchor = location.anchor_key || '';
  let box = { x: 35, y: 32, width: 30, height: 34 };
  if (surface === 'left_chest') box = { x: 29, y: 30, width: 17, height: 16 };
  if (surface === 'right_chest') box = { x: 54, y: 30, width: 17, height: 16 };
  if (surface?.includes('sleeve')) box = { x: surface === 'left_sleeve' ? 13 : 72, y: anchor === 'cuff' ? 62 : 32, width: 15, height: anchor === 'cuff' ? 10 : 29 };
  if (anchor.includes('upper')) box = { x: 31, y: 24, width: 38, height: 14 };
  if (anchor === 'lower_center') box = { x: 28, y: 65, width: 44, height: 13 };
  if (anchor.includes('left') && surface === 'back') box = { x: 27, y: 31, width: 22, height: 30 };
  if (anchor.includes('right') && surface === 'back') box = { x: 51, y: 31, width: 22, height: 30 };
  if (anchor === 'hood') box = { x: 40, y: 13, width: 20, height: 14 };
  if (anchor === 'hood_name_drop') box = { x: 31, y: 31, width: 38, height: 10 };
  return <svg viewBox="0 0 100 90" aria-hidden="true" className="h-20 w-full rounded-lg bg-muted/50">
    <path d="M31 15 18 25 8 43l13 7 8-12v42h42V38l8 12 13-7-10-18-13-10-11 7H42Z" fill="hsl(var(--card))" stroke="hsl(var(--primary)/.45)" strokeWidth="2" />
    {back && <path d="M42 16q8 8 16 0" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />}
    <rect {...box} rx="2" fill="hsl(var(--accent)/.55)" stroke="hsl(var(--primary))" strokeWidth="1.5" />
  </svg>;
}

function PlacementSelector({ locations, activeLocation, onSelect, product, method, customInstructions = '', onCustomInstructions }) {
  const [group, setGroup] = useState(activeLocation?.customer_group || 'Front');
  useEffect(() => { if (activeLocation?.customer_group) setGroup(activeLocation.customer_group); }, [activeLocation?.customer_group]);
  const visibleGroup = locations.some(item => item.customer_group === group)
    ? group
    : (locations[0]?.customer_group || 'Front');
  const grouped = locations.filter(item => item.customer_group === visibleGroup);
  return <section className="space-y-3 rounded-xl border bg-card p-3" aria-labelledby="placement-heading">
    <div><h2 id="placement-heading" className="font-bold text-primary">Choose a placement</h2><p className="text-xs text-muted-foreground">Only placements supported for this garment, view, and decoration method are shown. Left and right use the wearer&apos;s perspective.</p></div>
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Placement groups">{DESIGN_LOCATION_GROUPS.map(value => {
      const count = locations.filter(item => item.customer_group === value).length;
      if (!count) return null;
      return <button type="button" role="tab" aria-selected={visibleGroup === value} key={value} onClick={() => setGroup(value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${visibleGroup === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{value} <span aria-hidden="true">({count})</span></button>;
    })}</div>
    {!product ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Choose a garment first.</p> : !method ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Choose a decoration method.</p> : !locations.length ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No verified placement is compatible with this garment, its available photos, and the selected decoration method.</p> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{grouped.map(location => {
      const selected = activeLocation?.id === location.id;
      return <button key={location.id} type="button" onClick={() => onSelect(location)} aria-pressed={selected} className={`rounded-xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'}`}>
        <PlacementDiagram location={location} />
        <span className="mt-2 block text-sm font-bold text-primary">{location.customer_label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{location.dimension_mode === 'fixed' ? `${Number(location.width_in).toFixed(Number(location.width_in) % 1 ? 1 : 0)} × ${Number(location.height_in).toFixed(Number(location.height_in) % 1 ? 1 : 0)} in` : location.dimension_mode === 'custom' ? 'Custom instructions required' : 'Flexible dimensions · production review required'}</span>
      </button>;
    })}</div>}
    {activeLocation && <div className="rounded-lg bg-muted/60 p-3 text-xs"><p className="font-semibold text-primary">{activeLocation.customer_label}</p><p className="mt-1 text-muted-foreground">{activeLocation.placement_instructions}</p>{activeLocation.custom_instructions_required && <label className="mt-3 block font-semibold text-primary">Custom placement instructions<textarea value={customInstructions} onChange={event => onCustomInstructions?.(event.target.value)} rows={3} className="mt-1 w-full rounded-md border bg-card px-3 py-2 font-normal text-foreground" placeholder="Describe the requested position and alignment." /></label>}{activeLocation.proof_required && <p className="mt-1 font-semibold text-amber-800">A production proof is required for this placement.</p>}</div>}
  </section>;
}

function customerBlockerMessage(blocker) {
  if (blocker.code === 'printing_price_missing') return 'A printing price is not available for this selection.';
  if (blocker.code === 'fulfillment_not_configured') return 'This decoration method is not available for checkout yet.';
  if (blocker.code === 'print_area_unverified') return 'This placement needs a final production check before checkout.';
  if (blocker.code === 'location_definition_required' || blocker.code === 'legacy_placement_review') return 'Choose and review a verified placement for each artwork location. Your artwork has not been moved.';
  if (blocker.code === 'location_definition_incompatible' || blocker.code === 'location_definition_version_changed') return 'Review this placement for the selected garment and decoration method.';
  if (blocker.code === 'custom_location_review_required') return 'This flexible placement needs custom instructions and an approved production proof.';
  if (blocker.code === 'custom_location_instructions_required') return 'Add instructions for the custom placement.';
  if (blocker.code === 'garment_replacement_required') return 'Choose another available garment before checkout.';
  if (blocker.code === 'method_garment_incompatible' || blocker.code === 'method_placement_incompatible') return 'Choose a compatible garment, placement, or decoration method.';
  return blocker.message;
}

function AddPanel({ onText, onShape, onTemplate, onUpload, busy, customerMode = false }) {
  return <div className="space-y-4">
    <div><h3 className="font-bold text-primary">Add design</h3><p className="text-xs text-muted-foreground">Only HC-managed tools and your own files are available.</p></div>
    <Button variant="outline" className="h-12 w-full justify-start" onClick={onText}><Type className="mr-3 h-5 w-5" />Editable text</Button>
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" onClick={() => onShape('rectangle')}><Square className="mr-2 h-4 w-4" />Rectangle</Button>
      <Button variant="outline" onClick={() => onShape('circle')}><Circle className="mr-2 h-4 w-4" />Circle</Button>
      <Button variant="outline" onClick={() => onShape('star')}><Star className="mr-2 h-4 w-4" />Star</Button>
      <Button variant="outline" onClick={() => onShape('line')}>— Line</Button>
    </div>
    <Button variant="outline" className="h-12 w-full justify-start" onClick={onTemplate}><Star className="mr-3 h-5 w-5 text-accent" />HC Classic Badge template</Button>
    <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-accent/60 bg-background px-3 text-sm font-semibold text-primary transition-colors hover:bg-accent/10 focus-within:ring-2 focus-within:ring-ring">
      <Upload className="mr-2 h-4 w-4" />{busy ? 'Validating upload…' : 'Upload PNG, JPG, or SVG'}
      <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={onUpload} disabled={busy} />
    </label>
    <div className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">{customerMode
      ? 'Choose a PNG, JPG, or SVG from Photos or Files. For best print quality, use the original file rather than a screenshot. Unsupported or unsafe files show an error and are not added. Your original artwork stays private and separate from the garment preview.'
      : 'Files are validated server-side, stored privately, and preserved separately from garment mockups. SVG scripts, event handlers, embeds, and external references are rejected.'}</div>
  </div>;
}

function VariantPanel({ products, product, document, methods, onProduct, onField, onMethod, loading, error, onRetry, onDone, customerMode = false, showCustomerPrices = false }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [brand, setBrand] = useState('all');
  const colors = getStudioCustomizationColors(product);
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
  const showVinylPrice = customerMode && showCustomerPrices && selectedMethod && VINYL_METHOD_KEYS.includes(selectedMethod.method_key);
  return <div className="space-y-4">
    <div><h3 className="font-bold text-primary">Choose Garment</h3><p className="text-xs text-muted-foreground">Choose a T-shirt, hoodie, or crewneck, then select its available options.</p></div>
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product, brand, or style" className="h-11 pl-9" /></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{STUDIO_GARMENT_TYPES.map(([value, label]) => <button type="button" key={value} onClick={() => setType(value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${type === value ? 'bg-primary text-primary-foreground' : 'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground'}`}>{label}</button>)}</div>
    <Field label="Brand"><select value={brand} onChange={event => setBrand(event.target.value)} className="h-11 w-full rounded-md border bg-card px-3 text-sm"><option value="all">All eligible brands</option>{brands.map(value => <option key={value}>{value}</option>)}</select></Field>
    {loading && <div className="rounded-xl border bg-card p-5 text-center text-sm"><span className="font-semibold text-primary">Loading live garments…</span><p className="mt-1 text-xs text-muted-foreground">Reading current products, variants, prices, images, and inventory.</p></div>}
    {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Garments could not be loaded.</p><p className="mt-1 text-xs">{error}</p><Button size="sm" variant="outline" className="mt-3 bg-card" onClick={onRetry}>Try again</Button></div>}
    {!loading && !error && <div className="max-h-[42dvh] space-y-2 overflow-y-auto pr-1 lg:max-h-[360px]">{filtered.map(item => {
      const itemSummary = getStudioProductSummary(item);
      return <button type="button" key={item.id} onClick={() => onProduct(item.id)} className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${document.productId === item.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:border-primary/50 hover:bg-muted/40'}`}><img src={displayImage(getStudioProductPreviewImage(item))} alt="" className="h-20 w-16 shrink-0 rounded-lg bg-card object-contain" /><span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-wide text-primary">{itemSummary.typeLabel} · {itemSummary.brand}</span><span className="mt-1 block text-sm font-semibold text-foreground">{itemSummary.name}</span><span className="mt-1 block text-xs text-muted-foreground">{itemSummary.style ? `Style ${itemSummary.style}` : 'Style unavailable'}</span><span className="mt-1 block text-xs"><strong>Stock:</strong> {Number(item.stock || 0).toLocaleString()} units across variants</span></span></button>;
    })}{!filtered.length && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No eligible in-stock garments match these filters. Try All eligible or another brand.</div>}</div>}
    {product && <div className="rounded-xl border border-primary/30 bg-primary/5 p-3"><div className="flex gap-3"><img src={document.productImage || displayImage(getStudioProductPreviewImage(product))} alt={summary.name} className="h-24 w-20 shrink-0 rounded-lg bg-card object-contain" /><div className="min-w-0"><p className="text-xs font-bold uppercase text-primary">Selected {summary.typeLabel}</p><p className="text-sm font-bold text-foreground">{summary.name}</p><p className="mt-1 text-xs text-muted-foreground">{summary.brand}{summary.style ? ` · ${summary.style}` : ''}</p>{chosenVariant && <div className="mt-2 space-y-1 text-xs"><p><strong>SKU:</strong> {chosenVariant.sku || 'Not provided'}</p>{showVinylPrice && productPrice(product, chosenVariant) != null && <p><strong>Price:</strong> ${productPrice(product, chosenVariant).toFixed(2)}</p>}<p><strong>Stock:</strong> {chosenVariant.inventory == null ? 'Catalog did not provide a variant quantity' : `${Number(chosenVariant.inventory).toLocaleString()} available`}</p></div>}</div></div></div>}
    <Field label="Color"><select value={document.color} onChange={event => onField('color', event.target.value)} disabled={!product} className="h-11 w-full rounded-md border bg-card px-3 text-sm disabled:opacity-50"><option value="">Choose color</option>{colors.map(value => <option key={value}>{value}</option>)}</select></Field>
    <Field label="Size"><select value={document.size} onChange={event => onField('size', event.target.value)} disabled={!document.color} className="h-11 w-full rounded-md border bg-card px-3 text-sm disabled:opacity-50"><option value="">Choose size</option>{sizes.map(value => <option key={value}>{value}</option>)}</select></Field>
    <Field label="Quantity"><Input type="number" min="1" value={document.quantity} onChange={event => onField('quantity', Math.max(1, Number(event.target.value) || 1))} /></Field>
    <Field label="Print / Decoration Method"><select value={document.decorationMethod || document.printMethod || ''} onChange={event => onMethod(event.target.value)} className="h-11 w-full rounded-md border bg-card px-3 text-sm"><option value="">Choose a method</option>{methods.map(item => <option key={item.method_key} value={item.method_key} disabled={item.draft_selectable === false}>{item.customer_label}</option>)}</select></Field>
    {selectedMethod && <p className={`rounded-xl border p-3 text-xs ${HC_METHOD_KEYS.has(selectedMethod.method_key) ? 'border-green-300 bg-green-50 text-green-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}><strong>{selectedMethod.customer_label}:</strong> {customerMode
      ? (QUOTE_REQUIRED_METHOD_KEYS.has(selectedMethod.method_key) ? 'Submit your design for a personalized quote. Once you accept your quote, we’ll send an invoice for payment.' : 'Available for this design when complete pricing is configured.')
      : (HC_METHOD_KEYS.has(selectedMethod.method_key) ? 'HC-operated design method. Drafts, saved versions, and preview-cart review are available.' : 'Draft design and preview-cart review are available. Production stays blocked until its provider is approved and configured.')} {selectedMethod.limits_note || ''}</p>}
    {onDone && <Button type="button" className="h-11 w-full" onClick={onDone} disabled={!document.productId}>{customerMode && selectedMethod && QUOTE_REQUIRED_METHOD_KEYS.has(selectedMethod.method_key) ? 'Continue to Request Quote' : customerMode ? 'Continue to Add Design' : 'Use selected garment'}</Button>}
  </div>;
}

function LayerPanel({ document, setDocument, selectedIds, setSelectedIds, onEditText, onReplaceImageWithText }) {
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
    <div><h3 className="font-bold text-primary">Layers</h3><p className="text-xs text-muted-foreground">Top rows print above lower rows.</p></div>
    {!layers.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No layers on this placement.</p>}
    {[...layers].reverse().map((layer, reverseIndex) => {
      const index = layers.length - reverseIndex - 1;
      return <div key={layer.id} className={`rounded-xl border p-3 ${selectedIds.includes(layer.id) ? 'border-primary bg-primary/5' : 'bg-card'}`}>
        <button type="button" className="w-full truncate text-left text-sm font-semibold" onClick={() => { setSelectedIds([layer.id]); if (layer.type === 'text') onEditText?.(layer.id); }}>{layer.name}</button>
        <p className="mt-1 text-[11px] text-muted-foreground">{layer.type === 'text' ? 'Editable text layer' : layer.type === 'image' ? 'Image artwork · its pixels are not editable text' : 'Shape layer'}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {layer.type === 'text' && <Button size="sm" variant="outline" className="min-h-11" onClick={() => onEditText?.(layer.id)}><Type className="mr-1 h-4 w-4" />Edit Text</Button>}
          {layer.type === 'image' && <Button size="sm" variant="outline" className="min-h-11" onClick={() => onReplaceImageWithText?.(layer)}><Type className="mr-1 h-4 w-4" />Replace with editable text</Button>}
          <Button size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} onClick={() => patch(layer.id, { visible: !layer.visible })}>{layer.visible ? <Eye className="h-4 w-4" /> : <X className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`} onClick={() => patch(layer.id, { locked: !layer.locked })}><LockKeyhole className={`h-4 w-4 ${layer.locked ? 'text-primary' : 'opacity-40'}`} /></Button>
          <Button size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label={`Move ${layer.name} forward`} onClick={() => move(index, 1)}>↑</Button><Button size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label={`Move ${layer.name} backward`} onClick={() => move(index, -1)}>↓</Button>
          <Button size="sm" variant="destructive" className="min-h-11 min-w-11" aria-label={`Delete ${layer.name}`} onClick={() => remove(layer)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>;
    })}
  </div>;
}

function EditorFields({ selected, patchSelected, patchTextSelected, printArea, methodKey = 'dtf', targetPpi = 300, customerMode = false, onDone }) {
  if (!selected) return null;
  const enforcedTargetPpi = Math.max(300, Number(targetPpi || 300));
  const quality = artworkQualityReport(selected, printArea, enforcedTargetPpi);
  const isVector = selected.fileKind === 'svg' || selected.mimeType === 'image/svg+xml';
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base text-primary">{selected.type === 'text' ? 'Edit Text' : 'Selected layer'}</CardTitle></CardHeader><CardContent className="space-y-3">
    <Field label="Layer name"><Input value={selected.name} onChange={event => patchSelected({ name: event.target.value })} /></Field>
    {selected.type === 'text' && <TextEditorPanel element={selected} onChange={patchTextSelected || patchSelected} onDone={onDone} showTitle={false} />}
    {selected.type === 'shape' && <Field label="Color"><Input type="color" value={selected.fill || DEFAULT_ARTWORK_COLOR} onChange={event => patchSelected({ fill: event.target.value })} className="h-10 p-1" /></Field>}
    {selected.type !== 'image' && <ArtworkSizeControls element={selected} patchElement={patchSelected} printArea={printArea} targetPpi={enforcedTargetPpi} customerMode={customerMode} />}
    {selected.type === 'image' && <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
      <div><p className="text-sm font-black text-primary">Artwork Quality</p><p className="mt-1 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">Minimum artwork resolution: 300 DPI at the selected print size.</p><p className="mt-2">{isVector && !selected.containsEmbeddedRaster ? 'Original artwork: genuine vector paths' : `Original image: ${Number(selected.pixelWidth || 0).toLocaleString()} × ${Number(selected.pixelHeight || 0).toLocaleString()} pixels`}</p><p>Transparency: {selected.hasTransparency === true ? 'Yes' : selected.hasTransparency === false ? 'No' : 'Not reported'}</p><p>{selected.resolutionX ? `File metadata: ${Math.round(selected.resolutionX)} DPI (informational only; it does not determine quality).` : 'Resolution metadata: Not present. Quality is calculated from original pixels and selected print size.'}</p></div>
      <ArtworkSizeControls element={selected} patchElement={patchSelected} printArea={printArea} targetPpi={enforcedTargetPpi} customerMode={customerMode} />
      <div className="rounded-lg border bg-card p-3"><p>Selected print size: {quality?.intendedWidth && quality?.intendedHeight ? `${quality.intendedWidth.toFixed(2)} × ${quality.intendedHeight.toFixed(2)} inches` : 'Not entered'}</p>{quality?.effectivePpi != null && <p>Effective resolution: {quality.effectivePpiX} × {quality.effectivePpiY} DPI (minimum {quality.effectivePpi} DPI)</p>}{quality?.maxWidth && <p>Maximum recommended at 300 DPI: {quality.maxWidth.toFixed(2)} × {quality.maxHeight.toFixed(2)} inches</p>}</div>
      <div className={`rounded-lg p-3 font-semibold ${quality?.state === 'good' || quality?.state === 'vector' ? 'bg-green-100 text-green-900' : quality?.state === 'low' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}><p>{quality?.label}</p>{quality?.message && <p className="mt-1 font-normal">{quality.message}</p>}{quality?.state === 'low' && <p className="mt-1 font-normal">{customerMode ? 'You can save this draft. Reduce the print size or use a sharper image before ordering.' : 'This warning stays with saved drafts and Preview Cart records. Production remains blocked until the artwork meets the minimum or is replaced.'}</p>}</div>
      {selected.containsEmbeddedRaster && <p className="text-amber-800">This SVG contains raster imagery. Its embedded pixels need separate resolution review.</p>}
      <p className="text-muted-foreground">{customerMode ? (methodKey === 'embroidery'
        ? 'Image resolution and embroidery preparation are checked separately.'
        : ['soft_vinyl', 'puff_vinyl', 'glitter_vinyl', 'flock_vinyl'].includes(methodKey)
          ? 'Image quality and vinyl compatibility are checked separately.'
          : 'Artwork quality is checked for the selected decoration method.') : methodKey === 'embroidery'
        ? 'Raster resolution does not establish embroidery digitization readiness.'
        : ['soft_vinyl', 'puff_vinyl', 'glitter_vinyl', 'flock_vinyl'].includes(methodKey)
          ? 'Resolution quality is separate from the selected vinyl material, preparation method, and any cut-path review required by its actual production configuration.'
          : methodKey === 'dtg'
            ? 'Resolution is assessed here; DTG production still requires a configured fulfillment route and garment-compatible print area.'
            : 'Resolution quality is separate from production-method and garment-fit review.'} The original upload is preserved.</p>
    </div>}
  </CardContent></Card>;
}

function GarmentReviewPanel({ review, loading, error, onRefresh, onSave, busy }) {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('qualifying');
  const items = review?.items || [];
  const filtered = items.filter(item => {
    const text = `${item.brand || ''} ${item.name || ''} ${item.style_number || ''} ${item.supplier_sku || ''}`.toLowerCase();
    const matchesSearch = !search.trim() || text.includes(search.trim().toLowerCase());
    const matchesBrand = brandFilter === 'all' || String(item.brand || '').toLowerCase() === brandFilter;
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'qualifying' && item.coverage_status !== 'excluded')
      || item.coverage_status === statusFilter;
    return matchesSearch && matchesBrand && matchesStatus;
  });
  return <Card><CardHeader><CardTitle>Garment eligibility &amp; image review</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">This report scans the complete product table in server-side pages. New mockups are limited to the eight approved brands and explicitly classified T-shirts, pullover hoodies, zip hoodies, and crewneck sweatshirts. An approved color is bound to the exact photograph shown in the picker and on the canvas.</p>
    <div className="grid gap-3 sm:grid-cols-3"><p className="rounded-xl border p-3 text-sm"><strong>Qualifying live styles</strong><br />{review?.qualifying_count ?? '—'}</p><p className="rounded-xl border p-3 text-sm"><strong>Approved photographs</strong><br />{review?.approved_count ?? '—'}</p><p className="rounded-xl border p-3 text-sm"><strong>Need a photograph</strong><br />{review?.needs_image_review_count ?? '—'}</p></div>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-background text-primary"><tr><th className="p-2">Brand</th><th>Qualifying</th><th>T-shirts</th><th>Pullovers</th><th>Zip hoodies</th><th>Crewnecks</th><th>Approved</th><th>Needs image</th><th>Other exclusions</th></tr></thead><tbody>{(review?.coverage || []).map(row => <tr key={row.brand} className="border-t"><td className="p-2 font-bold">{row.brand}</td><td>{row.qualifying_found}</td><td>{row.t_shirts}</td><td>{row.pullover_hoodies}</td><td>{row.zip_hoodies}</td><td>{row.crewnecks}</td><td className="text-green-700">{row.approved}</td><td className="text-amber-700">{row.needs_image}</td><td>{row.excluded}</td></tr>)}</tbody></table></div>
    <p className="text-xs text-muted-foreground">Catalog rows scanned: {review?.catalog_rows_scanned ?? '—'}. Products outside this Studio scope remain untouched in the regular storefront.</p>
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px_auto]"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by brand, product, or style" /><select value={brandFilter} onChange={event => setBrandFilter(event.target.value)} className="h-10 rounded-md border bg-card px-3 text-sm"><option value="all">All requested brands</option>{STUDIO_BRANDS.map(brand => <option key={brand} value={brand.toLowerCase()}>{brand}</option>)}</select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-md border bg-card px-3 text-sm"><option value="qualifying">Qualifying styles</option><option value="approved">Approved</option><option value="needs_image">Needs photograph</option><option value="excluded">Excluded with reason</option><option value="all">All reviewed catalog rows</option></select><Button type="button" variant="outline" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh report'}</Button></div>
    {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!loading && !error && <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1">{filtered.map(item => {
      const outsideScope = item.coverage_status === 'excluded';
      const assignedImages = getApprovedStudioImageMap(item);
      return <form key={`${item.id}-${item.design_studio_reviewed_at || 'unreviewed'}`} onSubmit={event => onSave(event, item.id)} className="rounded-xl border bg-card p-3">
        <div className="flex flex-col gap-3 sm:flex-row"><div className="flex shrink-0 gap-2 overflow-x-auto sm:max-w-md">{(item.candidate_images || []).slice(0, 8).map(candidate => <button key={`${candidate.color}-${candidate.image_url}`} type="button" className="w-24 shrink-0 rounded-lg border bg-card p-1 text-left text-[10px]" title={`Assign ${candidate.color} as the approved front photograph`} onClick={event => { const field = event.currentTarget.closest('form')?.elements?.namedItem('design_studio_front_images'); if (field) field.value = `${candidate.color} | ${candidate.image_url}`; }}><img src={displayImage(candidate.image_url)} alt={`${item.name} in ${candidate.color}`} className="h-24 w-full object-contain" /><span className="mt-1 block truncate">{candidate.color}</span></button>)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-primary">{item.brand} · {item.name}</p><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.coverage_status === 'approved' ? 'bg-green-100 text-green-800' : item.coverage_status === 'needs_image' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{item.coverage_status === 'approved' ? 'Approved' : item.coverage_status === 'needs_image' ? 'Needs photograph' : 'Excluded'}</span></div><p className="text-xs text-muted-foreground">Style {item.style_number || item.supplier_sku || 'not provided'} · Storefront classification: {item.primary_garment_type || 'not classified'}</p><p className="mt-2 rounded-md bg-background p-2 text-xs"><strong>Coverage reason:</strong> {item.coverage_reason}</p>{Object.entries(assignedImages).map(([color, url]) => <p key={color} className="mt-1 truncate text-xs text-green-800"><strong>{color}:</strong> {url}</p>)}</div></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Studio availability"><select name="design_studio_eligible" defaultValue={String(item.design_studio_eligible === true)} className="h-10 w-full rounded-md border bg-card px-3"><option value="false">Not selectable / review needed</option><option value="true" disabled={outsideScope}>Eligible for new designs</option></select></Field><Field label="Explicit Studio garment type"><select name="design_studio_garment_type" defaultValue={item.design_studio_garment_type || ''} className="h-10 w-full rounded-md border bg-card px-3"><option value="">Not assigned</option>{STUDIO_GARMENT_CLASSIFICATIONS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Photograph review"><select name="design_studio_image_status" defaultValue={item.design_studio_image_status || 'needs_review'} className="h-10 w-full rounded-md border bg-card px-3"><option value="needs_review">Needs review</option><option value="approved">Approved exact-color images</option><option value="rejected">Images unsuitable</option></select></Field><Field label="Review note"><Input name="design_studio_image_note" defaultValue={item.design_studio_image_note || ''} placeholder="Source and suitability decision" /></Field><div className="sm:col-span-2 lg:col-span-4"><Field label="Approved exact-color front photographs" hint="One per line: Color | exact supplier image URL. Tap a candidate above to assign it."><textarea name="design_studio_front_images" defaultValue={serializeFrontImageMap(assignedImages)} rows={3} className="w-full rounded-md border bg-card px-3 py-2 text-xs" placeholder="Black | https://www.ssactivewear.com/Images/Color/example.jpg" /></Field></div></div>
        <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{item.design_studio_reviewed_at ? `Last reviewed ${new Date(item.design_studio_reviewed_at).toLocaleString()}` : 'Not reviewed yet'}</p><Button type="submit" size="sm" disabled={busy === `catalog-${item.id}`}>{busy === `catalog-${item.id}` ? 'Saving…' : 'Save review'}</Button></div>
      </form>;
    })}{!filtered.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No catalog products match this review search.</p>}</div>}
  </CardContent></Card>;
}

export default function AdminDesignStudio({ customerMode = false, privatePreview = false }) {
  const [tab, setTab] = useState('studio');
  const [history, dispatch] = useReducer(historyReducer, createStudioDocument(), createHistory);
  const document = history.present;
  const setDocument = useCallback((value, options = {}) => dispatch({ type: options.transient ? 'transient' : 'set', value }), []);
  const normalizeDocument = useCallback(value => dispatch({ type: 'normalize', value }), []);
  const beginDocumentInteraction = useCallback(() => dispatch({ type: 'begin_interaction' }), []);
  const endDocumentInteraction = useCallback(() => dispatch({ type: 'commit_interaction' }), []);
  const [selectedIds, setSelectedIds] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [printAreas, setPrintAreas] = useState([]);
  const [mockupMappings, setMockupMappings] = useState([]);
  const [designId, setDesignId] = useState('');
  const [version, setVersion] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [designsLoading, setDesignsLoading] = useState(false);
  const [designsError, setDesignsError] = useState('');
  const [previewCart, setPreviewCart] = useState([]);
  const [previewCartLoading, setPreviewCartLoading] = useState(false);
  const [previewCartError, setPreviewCartError] = useState('');
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [quoteFormOpen, setQuoteFormOpen] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ full_name: '', email: '', phone: '', notes: '' });
  const [quoteReceipt, setQuoteReceipt] = useState(null);
  const [quoteSubmitError, setQuoteSubmitError] = useState('');
  const quoteNameRef = useRef(null);
  const quoteEmailRef = useRef(null);
  const [catalogReview, setCatalogReview] = useState({ items: [], coverage: [], qualifying_count: 0, approved_count: 0, needs_image_review_count: 0 });
  const [catalogReviewLoading, setCatalogReviewLoading] = useState(false);
  const [catalogReviewError, setCatalogReviewError] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [saveState, setSaveState] = useState('Not saved');
  const [previewMode, setPreviewMode] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('');
  const [areaForm, setAreaForm] = useState({ product_id: '', product_size: '*', production_route: 'hc_transfer_press', provider_key: 'hc', print_method: 'dtf', placement: 'front', width_in: '', height_in: '', min_dpi: 300, enabled: true, verified: true, source_note: '' });
  const [mockupForm, setMockupForm] = useState({ product_id: '', color_key: '*', view: 'back', source_note: '', x: 28, y: 22, width: 44, height: 58 });
  const [pricingForm, setPricingForm] = useState({ product_id: '', production_route: 'hc_transfer_press', print_method: 'dtf', placement: 'front', service_price: '', transfer_cost: '', preparation_labor_cost: '', pressing_labor_cost: '', packaging_cost: '', other_fee: '', notes: '' });
  const savedJsonRef = useRef(JSON.stringify(document));

  const product = products.find(item => item.id === document.productId) || null;
  const preservedGarmentNeedsReplacement = Boolean(document.productId && !product && !productsLoading);
  const variant = product ? findCustomizationVariant(product, document.color, document.size) : null;
  const methodKey = document.decorationMethod || document.printMethod || '';
  const targetPpi = Math.max(300, Number(status?.settings?.default_raster_ppi || 300));
  const methods = status?.decoration_methods?.length ? status.decoration_methods : DECORATION_METHODS.map(([method_key, customer_label]) => ({
    method_key, customer_label, draft_selectable: true,
    available: HC_METHOD_KEYS.has(method_key),
    production_route: HC_METHOD_KEYS.has(method_key) ? 'hc_transfer_press' : 'outside_print_vendor',
    provider_key: HC_METHOD_KEYS.has(method_key) ? 'hc' : 'ss_fast',
  }));
  const selectedMethod = methods.find(item => item.method_key === methodKey) || null;
  const designLocations = status?.design_locations || [];
  const relevantAreas = printAreas.filter(item => item.production_route === document.productionRoute && item.print_method === methodKey && item.enabled && (item.product_size === '*' || item.product_size === document.size));
  const activeArea = [...relevantAreas].sort((a, b) => Number(b.product_size === document.size) - Number(a.product_size === document.size)).find(item => item.placement === document.activePlacement);
  const selected = (document.placements?.[document.activePlacement] || []).find(item => selectedIds.includes(item.id));
  const pricingConfigs = status?.pricing_configs || [];
  const vinylPricingGaps = useMemo(() => VINYL_METHOD_KEYS.map(methodKeyValue => {
    const method = methods.find(item => item.method_key === methodKeyValue);
    const placements = Array.isArray(method?.compatible_placements) && method.compatible_placements.length
      ? method.compatible_placements : DESIGN_PLACEMENTS.map(([key]) => key);
    const configured = new Set(pricingConfigs.filter(item => item.active && item.production_route === 'hc_transfer_press'
      && item.print_method === methodKeyValue && !item.product_id && item.service_price != null).map(item => item.placement));
    return { method, missing: placements.filter(placement => !configured.has(placement)) };
  }), [methods, pricingConfigs]);
  const printing = calculatePrintingCharge(document, pricingConfigs, status?.pricing_packages || []);
  const printingCharge = printing.configured ? printing.unit : 0;
  const pricing = calculateStudioPricing({ route: document.productionRoute, garmentRetail: productPrice(product, variant), printingCharge, quantity: document.quantity });
  const quoteRequired = Boolean(methodKey && (QUOTE_REQUIRED_METHOD_KEYS.has(methodKey) || (document.decorationMethods || []).some(value => QUOTE_REQUIRED_METHOD_KEYS.has(value))));
  const vinylPriceReady = Boolean(methodKey && VINYL_METHOD_KEYS.includes(methodKey) && productPrice(product, variant) != null && printing.configured);
  const views = useMemo(() => buildMockupViews(product, document.color, document.size, mockupMappings), [product, document.color, document.size, mockupMappings]);
  const placementState = useMemo(() => placementAvailability(product, views), [product, views]);
  const compatibleLocations = useMemo(() => designLocations.filter(location => designLocationIsCompatible(location, { product, method: selectedMethod, placementState })), [designLocations, placementState, product, selectedMethod]);
  const activeLocation = useMemo(() => getActiveDesignLocation(document, designLocations), [designLocations, document]);
  const warnings = useMemo(() => {
    const next = validateDesign(document, relevantAreas);
    const compatibleIds = new Set(compatibleLocations.map(item => item.id));
    for (const [surface, elements] of Object.entries(document.placements || {})) {
      if (!elements?.some(element => element.visible !== false)) continue;
      const definitionId = document.placementSelections?.[surface]?.definitionId;
      if (designLocations.length && definitionId && !compatibleIds.has(definitionId)) next.push({ code: 'location_definition_incompatible', level: 'blocker', placement: surface, message: 'The saved placement is not compatible with the current garment, view, or decoration method.' });
    }
    return next;
  }, [compatibleLocations, designLocations.length, document, relevantAreas]);
  const activeView = viewForPlacement(document.activePlacement);
  const activeMockup = views[activeView] || null;
  const canvasArea = activeLocation ? designLocationPreviewArea(product, activeLocation, activeMockup?.previewArea) : previewSurface(product, document.activePlacement, activeMockup?.previewArea);
  const sizingArea = useMemo(() => designLocationSizingArea(activeLocation, activeArea) || previewPhysicalScale(activeArea, document.activePlacement, canvasArea), [activeArea, activeLocation, canvasArea, document.activePlacement]);
  const areaProduct = products.find(item => item.id === areaForm.product_id) || null;
  const officialAreaSource = getOfficialGarmentSource(areaProduct);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true); setProductsError('');
    try {
      const result = await invoke('catalog');
      const rows = result.products || [];
      const garments = rows.filter(isStudioEligibleProduct);
      garments.sort((a, b) => (String(a.style_number).toUpperCase() === '5000' || /Gildan 5000/i.test(a.name) ? -1 : String(b.style_number).toUpperCase() === '5000' || /Gildan 5000/i.test(b.name) ? 1 : getPublicProductName(a).localeCompare(getPublicProductName(b))));
      setProducts(garments);
      if (!garments.length) setProductsError('No live in-stock T-shirts, hoodies, or crewnecks passed the eligibility rules. Check product classification and customization restrictions.');
    } catch (error) {
      setProductsError(error.message || 'The live catalog request failed.');
    } finally { setProductsLoading(false); }
  }, []);
  const loadDesigns = useCallback(async () => {
    setDesignsLoading(true); setDesignsError('');
    try {
      const data = await invoke('list', { owner_only: customerMode });
      setDesigns(data.designs || []);
    } catch (error) {
      setDesignsError(error.message || 'Saved designs could not be loaded.');
      throw error;
    } finally { setDesignsLoading(false); }
  }, [customerMode]);
  const loadStatus = useCallback(async () => { const data = await invoke('status'); setStatus(data); }, []);
  const loadCatalogReview = useCallback(async () => {
    if (customerMode) return;
    setCatalogReviewLoading(true); setCatalogReviewError('');
    try { setCatalogReview(await invoke('catalog_review')); }
    catch (error) { setCatalogReviewError(error.message || 'The garment review list could not be loaded.'); }
    finally { setCatalogReviewLoading(false); }
  }, [customerMode]);
  const loadPreviewCart = useCallback(async () => {
    if (customerMode && !privatePreview) return;
    setPreviewCartLoading(true); setPreviewCartError('');
    try {
      const data = await invoke('list_preview_cart');
      setPreviewCart(data.items || []);
    } catch (error) {
      setPreviewCartError(error.message || 'The preview cart could not be loaded.');
      throw error;
    } finally { setPreviewCartLoading(false); }
  }, [customerMode, privatePreview]);
  const loadQuoteRequests = useCallback(async () => {
    if (!customerMode) return;
    const data = await invoke('list_quote_requests');
    const quotes = data.quotes || [];
    setQuoteRequests(quotes);
    return quotes;
  }, [customerMode]);
  useEffect(() => { Promise.all([loadProducts(), loadDesigns(), loadStatus(), loadPreviewCart()]).catch(error => { setSaveState(`Load failed · ${error.message}`); toast.error(error.message); }); }, [loadDesigns, loadPreviewCart, loadProducts, loadStatus]);
  useEffect(() => {
    if (tab !== 'designs') return;
    loadDesigns().catch(error => { setSaveState(`Load failed · ${error.message}`); });
  }, [loadDesigns, tab]);
  useEffect(() => {
    if (tab !== 'cart' || (customerMode && !privatePreview)) return;
    loadPreviewCart().catch(error => { setSaveState(`Load failed · ${error.message}`); });
  }, [customerMode, loadPreviewCart, privatePreview, tab]);
  useEffect(() => { if (tab === 'quotes') loadQuoteRequests().catch(error => toast.error(error.message)); }, [loadQuoteRequests, tab]);
  useEffect(() => {
    if (!['settings', 'areas'].includes(tab) || customerMode) return;
    loadCatalogReview();
  }, [customerMode, loadCatalogReview, tab]);
  useEffect(() => {
    if (!document.productId) { setPrintAreas([]); setMockupMappings([]); return; }
    Promise.all([
      supabase.from('design_print_areas').select('*').eq('product_id', document.productId),
      invoke('mockups', { product_id: document.productId, color: document.color || '' }).catch(() => ({ mockups: [] })),
    ]).then(([areas, mockups]) => { setPrintAreas(areas.data || []); setMockupMappings(mockups.mockups || []); });
  }, [document.productId]);

  useEffect(() => {
    const elements = document.placements?.[document.activePlacement] || [];
    if (!elements.length) return;
    const normalized = elements.map(element => initializeArtworkSizing(element, sizingArea));
    if (JSON.stringify(normalized) === JSON.stringify(elements)) return;
    normalizeDocument(updatePlacement(document, document.activePlacement, () => normalized));
  }, [document, normalizeDocument, sizingArea]);

  useEffect(() => {
    const changed = JSON.stringify(document) !== savedJsonRef.current;
    if (!changed) return undefined;
    if (!document.decorationMethod && !document.printMethod) { setSaveState('Choose a decoration method before saving'); return undefined; }
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
    const hasArtwork = Object.values(document.placements || {}).some(items => items?.length);
    setDocument({ ...document, productId: id, productName: summary?.name || '', productBrand: summary?.brand || '', productStyle: summary?.style || '', garmentType: summary?.type || '', productSku: next?.style_number || '', productImage: displayImage(getStudioProductPreviewImage(next)), mockupViews: nextViews, color: '', size: '', activePlacement: nextPlacement, placementSelections: {}, placementDefinitionVersion: null, legacyPlacementReviewRequired: hasArtwork, updatedAt: new Date().toISOString() });
  };
  const onField = (key, value) => {
    const changes = { [key]: value };
    if (key === 'color') {
      const selectedVariant = getVariantForColor(product, value);
      changes.size = '';
      changes.productImage = displayImage(getVariantImage(product, value, '') || '');
      changes.productSku = selectedVariant?.sku || product?.style_number || '';
      changes.variantId = selectedVariant?.variant_id || '';
      changes.mockupViews = buildMockupViews(product, value, '', mockupMappings);
    }
    if (key === 'size') {
      const selectedVariant = findCustomizationVariant(product, document.color, value);
      changes.productImage = displayImage(getVariantImage(product, document.color, value) || '');
      changes.productSku = selectedVariant?.sku || product?.style_number || '';
      changes.variantId = selectedVariant?.variant_id || '';
      changes.mockupViews = buildMockupViews(product, document.color, value, mockupMappings);
    }
    setDocument({ ...document, ...changes, updatedAt: new Date().toISOString() });
  };
  const onMethod = value => {
    const method = methods.find(item => item.method_key === value);
    if (!method || method.draft_selectable === false) { setSaveState(`${method?.customer_label || value} cannot be selected for a draft.`); return; }
    setDocument({ ...document, decorationMethod: value, printMethod: value, productionRoute: method.production_route || 'hc_transfer_press', updatedAt: new Date().toISOString() });
  };
  const onLocation = location => {
    setDocument(selectDesignLocation(document, location));
    setSelectedIds([]);
  };
  const onCustomLocationInstructions = value => {
    const surface = document.activePlacement;
    const selection = document.placementSelections?.[surface];
    if (!selection) return;
    setDocument({ ...document, placementSelections: { ...document.placementSelections, [surface]: { ...selection, customInstructions: value } }, updatedAt: new Date().toISOString() });
  };
  const openTextEditor = id => {
    setSelectedIds([id]);
    if (window.matchMedia('(max-width: 1023px)').matches) setMobilePanel('text');
  };
  const addElement = element => {
    const normalized = initializeArtworkSizing(element, sizingArea);
    setDocument(updatePlacement(document, document.activePlacement, items => [...items, normalized]));
    setSelectedIds([normalized.id]);
    if (normalized.type === 'text') openTextEditor(normalized.id); else setMobilePanel('');
  };
  const addText = () => {
    const element = recalculateTextBounds(makeElement('text', { fill: initialTextColorForGarment(document.color) }), {}, sizingArea);
    void ensureStudioFontLoaded(element);
    addElement(element);
  };
  const addTemplate = () => {
    const groupId = crypto.randomUUID();
    const badge = makeElement('shape', { name: 'HC badge', shape: 'circle', groupId, x: 30, y: 22, width: 40, height: 40, fill: DEFAULT_ARTWORK_COLOR });
    const text = recalculateTextBounds(makeElement('text', { name: 'HC badge text', text: 'HC APPAREL', groupId, x: 33, y: 34, width: 34, height: 12, fill: DEFAULT_ARTWORK_CONTRAST, fontId: 'lora', fontFamily: 'Lora', fontWeight: 700, curve: 26 }), {}, sizingArea);
    setDocument(updatePlacement(document, document.activePlacement, items => [...items, initializeArtworkSizing(badge, sizingArea), initializeArtworkSizing(text, sizingArea)]));
    setSelectedIds([badge.id, text.id]); setMobilePanel('');
  };
  const patchSelected = values => setDocument(updatePlacement(document, document.activePlacement, items => items.map(item => selectedIds.includes(item.id) ? { ...item, ...values } : item)));
  const patchTextSelected = values => {
    const updated = updatePlacement(document, document.activePlacement, items => items.map(item => {
      if (!selectedIds.includes(item.id) || item.type !== 'text') return item;
      const next = recalculateTextBounds(item, values, sizingArea);
      void ensureStudioFontLoaded(next);
      return next;
    }));
    setDocument(updated);
  };
  const replaceImageWithText = layer => {
    const replacement = recalculateTextBounds(makeElement('text', {
      name: `${layer.name || 'Artwork'} replacement text`,
      fill: initialTextColorForGarment(document.color),
      x: Number(layer.x || 25), y: Number(layer.y || 25), rotation: Number(layer.rotation || 0), groupId: layer.groupId || null,
    }), {}, sizingArea);
    void ensureStudioFontLoaded(replacement);
    setDocument(updatePlacement(document, document.activePlacement, items => items.map(item => item.id === layer.id ? replacement : item)));
    openTextEditor(replacement.id);
  };
  const upload = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);
    if (!supportedTypes.has(file.type)) {
      toast.error('Choose a PNG, JPG, or SVG artwork file. This file was not uploaded.');
      event.target.value = '';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Artwork files must be 20 MB or smaller. This file was not uploaded.');
      event.target.value = '';
      return;
    }
    setBusy('upload');
    try {
      const data = await invoke('upload', { filename: file.name, data: await readFile(file), design_id: designId || null });
      addElement(makeElement('image', { name: file.name, assetId: data.asset.id, storagePath: data.asset.storage_path, previewUrl: data.preview_url, pixelWidth: data.asset.pixel_width, pixelHeight: data.asset.pixel_height, fileKind: data.asset.file_kind, mimeType: data.asset.mime_type, hasTransparency: data.asset.has_transparency, resolutionX: data.asset.resolution_x_ppi, resolutionY: data.asset.resolution_y_ppi, containsEmbeddedRaster: data.asset.contains_embedded_raster }));
      toast.success('Artwork validated and stored privately.');
    } catch (error) { toast.error(error.message); } finally { setBusy(''); event.target.value = ''; }
  };
  const persistDesign = async ({ createVersion = false, busyKey = createVersion ? 'version' : 'save', announce = true } = {}) => {
    setBusy(busyKey); setSaveState(customerMode ? 'Saving…' : (createVersion ? 'Saving a stable version…' : 'Saving draft…'));
    try {
      const result = await invoke('save', { design_id: designId || null, document, explicit: true, create_version: createVersion });
      setDesignId(result.design.id); if (result.version) setVersion(result.version); savedJsonRef.current = JSON.stringify(document);
      setSaveState(customerMode ? 'Saved' : (result.version ? `Saved · stable version ${result.version.version_number}` : 'Draft saved to HC Apparel')); await loadDesigns();
      if (announce) toast.success(customerMode ? 'Design saved.' : (result.version ? `Stable version ${result.version.version_number} saved.` : 'Design draft saved.'));
      return result;
    } catch (error) {
      const message = error.message || 'Design Studio request failed.';
      setSaveState(`Save failed · ${message}`);
      toast.error(message);
      throw error;
    } finally { setBusy(''); }
  };
  const save = () => persistDesign({ createVersion: customerMode, busyKey: 'save' }).catch(() => null);
  const saveVersion = () => persistDesign({ createVersion: true }).catch(() => null);
  const openDesign = async id => {
    if (JSON.stringify(document) !== savedJsonRef.current && !window.confirm('You have unsaved Design Studio changes. Open another design and discard them?')) return;
    setBusy('load'); try {
      const result = await invoke('load', { design_id: id });
      const savedProduct = products.find(item => item.id === result.design.document.productId);
      const upgraded = upgradeStudioDocument(result.design.document);
      const base = savedProduct ? { ...upgraded, productImage: displayImage(getVariantImage(savedProduct, upgraded.color, upgraded.size) || ''), mockupViews: buildMockupViews(savedProduct, upgraded.color, upgraded.size) } : upgraded;
      const hydrated = { ...base, placements: Object.fromEntries(Object.entries(base.placements || {}).map(([placement, elements]) => [placement, (elements || []).map(element => initializeArtworkSizing(element, previewPhysicalScale(null, placement, previewSurface(savedProduct, placement))))])) };
      dispatch({ type: 'replace', value: hydrated }); setDesignId(result.design.id); setVersion(null); setSelectedIds([]); savedJsonRef.current = JSON.stringify(hydrated); setSaveState('Saved'); setTab('studio');
    } catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };
  const archiveTestDesign = async item => {
    if (!/^AUTH QA\b/i.test(item?.name || '')) return;
    if (!window.confirm(`Archive the confirmed QA design “${item.name}” and its preview-cart entry for six-month retention?`)) return;
    setBusy(`archive-${item.id}`);
    try {
      await invoke('archive_test_design', { design_id: item.id });
      await Promise.all([loadDesigns(), loadPreviewCart()]);
      if (designId === item.id) {
        const blank = createStudioDocument();
        dispatch({ type: 'replace', value: blank });
        savedJsonRef.current = JSON.stringify(blank);
        setDesignId(''); setVersion(null); setSelectedIds([]); setSaveState('Not saved');
      }
      toast.success('QA design and its preview-cart entry were archived under the retention policy.');
    } catch (error) {
      toast.error(error.message || 'The QA design could not be archived.');
    } finally { setBusy(''); }
  };
  const newDesign = () => {
    if (JSON.stringify(document) !== savedJsonRef.current && !window.confirm('Start a new design and discard the unsaved changes?')) return;
    const blank = createStudioDocument(); dispatch({ type: 'replace', value: blank }); savedJsonRef.current = JSON.stringify(blank); setDesignId(''); setVersion(null); setSelectedIds([]); setSaveState('Not saved');
  };
  const attachPreviewCart = async () => {
    if (customerMode && !privatePreview) {
      setSaveState('Add to Cart is not available until the Design Studio is approved for public release.');
      toast.error('Custom design checkout is not available yet.');
      return;
    }
    setBusy('cart'); setSaveState('Saving a stable version for preview cart…');
    try {
      let savedVersion = version;
      if (!savedVersion || JSON.stringify(document) !== savedJsonRef.current) {
        const saved = await persistDesign({ createVersion: true, busyKey: 'cart', announce: false });
        savedVersion = saved.version;
      }
      setBusy('cart'); setSaveState('Attaching to isolated preview cart…');
      const result = await invoke('attach_preview_cart', { design_version_id: savedVersion.id });
      await loadPreviewCart();
      setSaveState(customerMode ? 'Added to Cart' : (result.item.checkout_ready ? 'Attached · checkout-ready preview' : 'Attached · preview needs configuration'));
      toast.success(result.duplicate_prevented ? 'Cart updated; a duplicate was not created.' : 'Design added to the private preview cart.');
      setTab('cart');
    } catch (error) {
      const message = error.message || 'The design could not be attached to the preview cart.';
      setSaveState(`Preview cart failed · ${message}`); toast.error(message);
    } finally { setBusy(''); }
  };
  const openQuoteForm = async () => {
    const { data } = await supabase.auth.getUser();
    setQuoteForm(value => ({ ...value, full_name: value.full_name || data.user?.user_metadata?.full_name || '', email: value.email || data.user?.email || '' }));
    setQuoteSubmitError('');
    const existing = quoteRequests.find(item => item.design_id === designId && (!version?.id || item.design_version_id === version.id));
    setQuoteReceipt(existing || null);
    setQuoteFormOpen(true);
  };
  const submitQuoteRequest = async event => {
    event.preventDefault();
    setQuoteSubmitError('');
    if (!quoteForm.full_name.trim()) {
      setQuoteSubmitError('Enter your full name so HC Apparel can review your request.');
      quoteNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); quoteNameRef.current?.focus(); return;
    }
    if (!/^\S+@\S+\.\S+$/.test(quoteForm.email.trim())) {
      setQuoteSubmitError('Enter a valid email address for your quote.');
      quoteEmailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); quoteEmailRef.current?.focus(); return;
    }
    setBusy('quote');
    let savedVersion = version;
    try {
      if (!savedVersion || JSON.stringify(document) !== savedJsonRef.current) savedVersion = (await persistDesign({ createVersion: true, busyKey: 'quote', announce: false })).version;
      const result = await invoke('submit_quote_request', { design_version_id: savedVersion.id, ...quoteForm });
      setQuoteReceipt(result.quote);
      await loadQuoteRequests();
    } catch (error) {
      let recovered = null;
      if (savedVersion?.id) {
        try { recovered = (await loadQuoteRequests())?.find(item => item.design_version_id === savedVersion.id); } catch { /* Preserve the original submission error. */ }
      }
      if (recovered) {
        setQuoteReceipt(recovered);
      } else {
        const message = error.message || 'Your quote request could not be confirmed. Your design and contact information are still here; check your connection and retry.';
        setQuoteSubmitError(message);
      }
    } finally { setBusy(''); }
  };
  const acceptQuote = async item => {
    if (!window.confirm(`Accept quote version ${item.quote_version} for $${Number(item.customer_quote_price).toFixed(2)} and create your invoice?`)) return;
    setBusy(`accept-${item.id}`);
    try {
      const result = await invoke('accept_quote', { quote_request_id: item.id, quote_version: item.quote_version });
      await loadQuoteRequests();
      toast.success(result.duplicate_prevented ? 'Your existing invoice is shown; no duplicate was created.' : 'Quote accepted. Your invoice is being prepared through HC Apparel billing.');
    } catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };
  const exportPackage = async () => {
    if (!version) return toast.error('Save an immutable version first.');
    if (warnings.some(item => item.level === 'blocker')) return toast.error('Production export is blocked until artwork and print-area issues are resolved.');
    setBusy('export');
    try {
      const manifest = await invoke('production_manifest', { design_version_id: version.id });
      for (const [placement, elements] of Object.entries(document.placements || {})) {
        if (!elements?.length) continue;
        const area = printAreas.find(item => item.placement === placement && item.production_route === document.productionRoute && item.enabled && item.verified);
        if (!area) throw new Error(`Verified dimensions are missing for ${placement}.`);
        const blob = await renderProductionPng(elements, area);
        const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = `hc-design-${designId}-${placement}-${area.width_in}x${area.height_in}in-300dpi.png`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      download(`hc-design-${designId}-job.json`, JSON.stringify({ generated_at: new Date().toISOString(), mockup_is_approximate: true, production_files: 'Separate transparent 300 DPI PNG files downloaded for each configured location.', design_id: designId, version: manifest.version, garment: { product_id: document.productId, name: document.productName, sku: document.productSku, color: document.color, size: document.size, quantity: document.quantity }, production_route: document.productionRoute, print_method: document.printMethod, print_areas: printAreas, placements: document.placements, warnings }, null, 2));
      toast.success('Production artwork and job manifest downloaded separately.');
    } catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };

  const saveArea = async event => {
    event.preventDefault();
    if (!areaForm.product_id || !areaForm.width_in || !areaForm.height_in || !areaForm.source_note.trim()) return toast.error('Product, real dimensions, and a source note are required.');
    const { error } = await supabase.from('design_print_areas').upsert({ ...areaForm, width_in: Number(areaForm.width_in), height_in: Number(areaForm.height_in), min_dpi: Math.max(300, Number(areaForm.min_dpi || 300)), source_effective_at: new Date().toISOString() }, { onConflict: 'product_id,product_size,production_route,provider_key,print_method,placement' });
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
    const values = { ...scope, service_price: Number(pricingForm.service_price), transfer_cost: pricingForm.transfer_cost === '' ? null : Number(pricingForm.transfer_cost), preparation_labor_cost: pricingForm.preparation_labor_cost === '' ? null : Number(pricingForm.preparation_labor_cost), pressing_labor_cost: pricingForm.pressing_labor_cost === '' ? null : Number(pricingForm.pressing_labor_cost), packaging_cost: pricingForm.packaging_cost === '' ? null : Number(pricingForm.packaging_cost), other_fee: pricingForm.other_fee === '' ? null : Number(pricingForm.other_fee), notes: pricingForm.notes.trim() || null, active: true, effective_at: new Date().toISOString(), updated_at: new Date().toISOString() };
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
      draft_selectable: values.draft_selectable === 'true', available: values.available === 'true', availability_label: null,
      production_route: values.production_route, provider_key: values.provider_key || null,
      backup_production_route: values.backup_production_route || null, backup_provider_key: values.backup_provider_key || null,
      limits_note: values.limits_note || null,
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
    if (target < 300 || target > 1200) return toast.error('Raster target must be between 300 and 1200 DPI.');
    const { error } = await supabase.from('design_studio_settings').update({ default_raster_ppi: target, updated_at: new Date().toISOString() }).eq('id', true);
    if (error) return toast.error(error.message);
    await loadStatus(); toast.success('Artwork quality target saved.');
  };
  const saveCatalogReview = async (event, productId) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const frontImages = parseFrontImageMap(values.design_studio_front_images);
    setBusy(`catalog-${productId}`);
    try {
      await invoke('save_catalog_review', {
        product_id: productId,
        design_studio_eligible: values.design_studio_eligible === 'true',
        design_studio_garment_type: values.design_studio_garment_type || null,
        design_studio_image_status: values.design_studio_image_status,
        design_studio_approved_colors: Object.keys(frontImages),
        design_studio_front_images: frontImages,
        design_studio_image_note: values.design_studio_image_note || '',
      });
      await Promise.all([loadCatalogReview(), loadProducts()]);
      toast.success('Design Studio garment and image review saved. The regular storefront product was not changed.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  };

  const visibleTabs = customerMode ? CUSTOMER_TABS : TABS;
  const hasArtwork = Object.values(document.placements || {}).some(elements => elements?.length);
  const customerWarnings = warnings.filter(warning => !['product_missing', 'artwork_missing', 'resolution_size_missing'].includes(warning.code)
    && !(warning.code === 'variant_missing' && !document.productId)
    && !(warning.code === 'artwork_missing' && (!document.productId || !document.color || !document.size)));
  const customerSaveState = /failed|unavailable/i.test(saveState)
    ? saveState
    : (/saving|autosaving|attaching/i.test(saveState) || ['save', 'cart'].includes(busy))
      ? 'Saving…'
      : (designId && JSON.stringify(document) === savedJsonRef.current) ? 'Saved' : 'Changes not saved';
  const currentCartItem = designId ? previewCart.find(item => item.design_id === designId) : null;
  const sidePanels = {
    add: <AddPanel onText={addText} onShape={shape => addElement(makeElement('shape', { shape, name: `${shape[0].toUpperCase()}${shape.slice(1)}` }))} onTemplate={addTemplate} onUpload={upload} busy={busy === 'upload'} customerMode={customerMode} />,
    variants: <VariantPanel products={products} product={product} document={document} methods={methods} onProduct={onProduct} onField={onField} onMethod={onMethod} loading={productsLoading} error={productsError} onRetry={loadProducts} onDone={() => setMobilePanel(customerMode ? 'add' : '')} customerMode={customerMode} showCustomerPrices={vinylPriceReady} />,
    layers: <LayerPanel document={document} setDocument={setDocument} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onEditText={openTextEditor} onReplaceImageWithText={replaceImageWithText} />,
  };

  return <div className="min-h-screen bg-background pb-40 lg:pb-8">
    <header className="border-b border-primary/20 bg-primary text-primary-foreground"><div className="mx-auto max-w-[1500px] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Link to={customerMode && !privatePreview ? '/ShopGarments' : '/AdminDashboard'}><Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><ArrowLeft /></Button></Link><div><h1 className="text-xl font-bold sm:text-2xl">HC Apparel Design Studio</h1><p className="text-xs text-primary-foreground/70">{customerMode ? (privatePreview ? 'Private customer-experience preview' : 'Create your custom apparel design') : 'Design Studio administration'}</p></div></div>{tab === 'studio' && <div className="flex items-center gap-2"><Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={() => setPreviewMode(value => !value)}><Eye className="mr-2 h-4 w-4" />{previewMode ? 'Edit' : 'Preview'}</Button><Button className={`min-w-[124px] bg-accent text-accent-foreground hover:bg-accent/90 ${customerMode ? 'hidden sm:inline-flex' : ''}`} onClick={save} disabled={Boolean(busy)}><Save className="mr-2 h-4 w-4" />{busy === 'save' ? 'Saving…' : customerMode ? 'Save Design' : 'Save'}</Button></div>}</div>
      <p role="status" aria-live="polite" className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${/failed|unavailable/i.test(customerMode ? customerSaveState : saveState) ? 'bg-destructive/20 text-primary-foreground' : /saving|attaching/i.test(customerMode ? customerSaveState : saveState) ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-primary-foreground/10 text-primary-foreground/90'}`}>{customerMode ? customerSaveState : saveState}</p>
      <nav className="mt-4 flex gap-1 overflow-x-auto pb-1" aria-label={customerMode ? 'Design Studio sections' : 'Design Studio admin sections'}>{visibleTabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary ${tab === key ? 'bg-background text-primary' : 'bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20'}`}>{label}</button>)}</nav>
    </div></header>

    {tab === 'studio' && <main className="mx-auto max-w-[1500px] p-3 sm:p-4">
      {customerMode && <ol className="mb-4 grid grid-cols-4 gap-1 rounded-2xl border border-border bg-card p-2 text-center text-[10px] font-bold text-primary shadow-sm sm:gap-2 sm:p-3 sm:text-sm" aria-label="Design steps">
        {[['Choose Garment', Boolean(product)], ['Add Design', hasArtwork], ['Review', previewMode], [quoteRequired ? 'Request Quote' : 'Add to Cart', quoteRequired ? quoteRequests.some(item => item.design_id === designId) : Boolean(currentCartItem)]].map(([label, complete], index) => <li key={label} className={`rounded-xl px-1 py-2 sm:px-3 ${complete ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}><span className="mr-1 hidden sm:inline">{index + 1}.</span>{label}</li>)}
      </ol>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={document.name} onChange={event => onField('name', event.target.value)} aria-label="Design name" className="h-9 min-w-[180px] flex-1 bg-card sm:max-w-sm" />
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length}><Undo2 className="mr-1 h-4 w-4" />Undo</Button>
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length}><Redo2 className="mr-1 h-4 w-4" />Redo</Button>
        <Button size="sm" variant="outline" onClick={newDesign}><Plus className="mr-1 h-4 w-4" />New</Button>
      </div>
      <section className="mb-4 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4" aria-label="Selected garment">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {product || preservedGarmentNeedsReplacement ? <img src={document.productImage || displayImage(getStudioProductPreviewImage(product))} alt={document.productName} className="h-24 w-20 shrink-0 rounded-xl border bg-card object-contain" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted"><Shirt className="h-8 w-8 text-primary" /></div>}
            <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.12em] text-primary">Choose Garment</p><h2 className="mt-1 text-base font-bold text-primary sm:text-lg">{product || preservedGarmentNeedsReplacement ? document.productName : 'Start with a garment'}</h2><p className="mt-1 text-sm text-muted-foreground">{product ? `${getStudioGarmentLabel(product)} · ${document.color || 'Choose color'} · ${document.size || 'Choose size'}${variant?.sku ? ` · SKU ${variant.sku}` : ''}${vinylPriceReady ? ` · $${productPrice(product, variant).toFixed(2)}` : ''}` : preservedGarmentNeedsReplacement ? `${document.color || 'Color preserved'} · ${document.size || 'Size preserved'} · Choose a replacement to continue` : 'Choose a T-shirt, hoodie, or crewneck, then select its color, size, and quantity.'}</p></div>
          </div>
          <Button type="button" className="h-12 shrink-0" onClick={() => setMobilePanel('variants')}><Shirt className="mr-2 h-5 w-5" />{product || preservedGarmentNeedsReplacement ? 'Change Garment' : 'Choose Garment'}</Button>
        </div>
        {preservedGarmentNeedsReplacement && <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">This saved design is preserved, but its previous garment is no longer eligible for new Design Studio work. Choose an approved replacement before production. Nothing was silently switched or deleted.</p>}
      </section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[270px_minmax(0,1fr)_280px]">
        <aside className="hidden space-y-4 lg:block"><Card><CardContent className="p-4">{sidePanels.variants}</CardContent></Card><Card><CardContent className="p-4">{sidePanels.add}</CardContent></Card></aside>
        <div className="min-w-0 space-y-3">
          <PlacementSelector locations={compatibleLocations} activeLocation={activeLocation} onSelect={onLocation} product={product} method={selectedMethod} customInstructions={document.placementSelections?.[document.activePlacement]?.customInstructions || ''} onCustomInstructions={onCustomLocationInstructions} />
          <DesignCanvas document={document} setDocument={setDocument} beginDocumentInteraction={beginDocumentInteraction} endDocumentInteraction={endDocumentInteraction} printArea={activeArea} sizingArea={sizingArea} selectedIds={selectedIds} setSelectedIds={setSelectedIds} previewMode={previewMode} mockup={activeMockup} previewArea={canvasArea} unavailableReason={placementState[document.activePlacement]?.reason} targetPpi={targetPpi} customerMode={customerMode} locationLabel={activeLocation?.customer_label || ''} onEditText={openTextEditor} />
          <p className="text-center text-xs text-muted-foreground">{customerMode ? 'Your preview uses the selected garment and color. Placement shown is approximate until the design is reviewed.' : 'The garment photo is the current live catalog variant or an admin-mapped authorized view. Artwork overlays are approximate previews and the garment photograph is never included in production artwork.'}</p>
        </div>
        <aside className="hidden space-y-4 lg:block"><Card><CardContent className="p-4">{sidePanels.layers}</CardContent></Card><EditorFields selected={selected} patchSelected={patchSelected} patchTextSelected={patchTextSelected} printArea={sizingArea} methodKey={methodKey} targetPpi={targetPpi} customerMode={customerMode} /></aside>
      </div>
      <section className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">{customerMode ? <>
          {!product && <div className="rounded-xl border border-border bg-card p-3 text-sm text-primary">Choose a garment to begin designing and see pricing.</div>}
          {product && (!document.color || !document.size) && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Choose an available color and size to continue.</div>}
          {product && document.color && document.size && !hasArtwork && <div className="rounded-xl border border-border bg-card p-3 text-sm text-primary">Add artwork, text, a shape, or a template when you&apos;re ready.</div>}
          {customerWarnings.map((warning, index) => <div key={`${warning.code}-${index}`} className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{customerBlockerMessage(warning)}</div>)}
          {product && document.color && document.size && hasArtwork && !customerWarnings.length && <div className="flex gap-2 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" />Your design is ready to preview and save.</div>}
        </> : warnings.length ? warnings.map((warning, index) => <div key={`${warning.code}-${index}`} className={`flex gap-2 rounded-xl border p-3 text-sm ${warning.level === 'blocker' ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning.message}</div>) : <div className="flex gap-2 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" />Design checks pass for the configured placement data.</div>}</div>
        <Card className="min-w-0 md:min-w-[280px]"><CardContent className="p-4 text-sm">{customerMode ? (!methodKey ? <><p className="font-bold text-primary">Pricing</p><p className="mt-2 text-muted-foreground">Choose a decoration method to continue.</p></> : quoteRequired ? <><p className="font-bold text-primary">Quote Required</p><p className="mt-2 text-muted-foreground">Submit your design for a personalized quote. Once you accept your quote, we’ll send an invoice for payment.</p></> : vinylPriceReady ? <><p className="font-bold text-primary">Pricing</p><div className="mt-2 flex justify-between gap-3"><span>Decorated garment</span><span>${(pricing.customerMerchandise / Math.max(1, Number(document.quantity))).toFixed(2)} each</span></div><div className="flex justify-between gap-3"><span>Quantity</span><span>{document.quantity}</span></div><div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Subtotal</span><span>${pricing.customerMerchandise.toFixed(2)}</span></div><p className="mt-2 text-xs text-muted-foreground">Shipping and applicable tax calculated at checkout.</p></> : <><p className="font-bold text-primary">Pricing unavailable</p><p className="mt-2 text-muted-foreground">This vinyl selection cannot be purchased until valid customer pricing is configured.</p></>) : <><p className="font-bold text-primary">Internal pricing review</p><p className="mt-2 text-muted-foreground">Customer prices are shown only for fully configured vinyl. Quote-required methods never expose automatic amounts.</p></>}</CardContent></Card>
      </section>
        {customerMode ? <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end"><Button className="h-12 bg-primary px-6 text-primary-foreground hover:bg-primary/90" onClick={quoteRequired ? openQuoteForm : attachPreviewCart} disabled={Boolean(busy) || !document.productId || (!quoteRequired && !vinylPriceReady)}>{quoteRequired ? <Save className="mr-2 h-4 w-4" /> : <ShoppingCart className="mr-2 h-4 w-4" />}{busy === 'quote' ? 'Submitting…' : quoteRequired ? 'Request Quote' : busy === 'cart' ? 'Adding…' : 'Add to Cart'}</Button></div> : <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:justify-end"><Button variant="outline" onClick={exportPackage} disabled={Boolean(busy)}><Download className="mr-2 h-4 w-4" />Download Production Artwork &amp; Job Sheet</Button><Button variant="outline" onClick={attachPreviewCart} disabled={Boolean(busy) || quoteRequired}><ShoppingCart className="mr-2 h-4 w-4" />{quoteRequired ? 'Quote required' : busy === 'cart' ? 'Attaching…' : 'Attach to preview cart'}</Button><Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={saveVersion} disabled={Boolean(busy)}><Save className="mr-2 h-4 w-4" />{busy === 'version' ? 'Saving version…' : 'Save Version'}</Button></div>}
    </main>}

    {tab === 'designs' && <main className="mx-auto max-w-6xl p-4"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Saved designs are loaded from HC Apparel, not this browser.</p><Button size="sm" variant="outline" onClick={() => loadDesigns().catch(error => setSaveState(`Load failed · ${error.message}`))} disabled={designsLoading}>{designsLoading ? 'Refreshing…' : 'Refresh'}</Button></div>{designsError && <div role="alert" className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{designsError} Retry with Refresh. If it continues, sign in again.</div>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{designs.map(item => <Card key={item.id}><CardHeader><CardTitle className="text-base">{item.name}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{item.selected_color || 'No color'} · {item.selected_size || 'No size'} · Qty {item.quantity}</p><p className="text-xs text-muted-foreground">{new Date(item.updated_at).toLocaleString()}</p><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-muted px-2 py-1 text-xs">{item.status}</span><div className="flex gap-2">{/^AUTH QA\b/i.test(item.name || '') && <Button size="sm" variant="outline" className="text-red-700" onClick={() => archiveTestDesign(item)} disabled={busy === `archive-${item.id}`}><Trash2 className="mr-1 h-3.5 w-3.5" />{busy === `archive-${item.id}` ? 'Archiving…' : 'Archive QA'}</Button>}<Button size="sm" onClick={() => openDesign(item.id)} disabled={busy === 'load'}>Open</Button></div></div></CardContent></Card>)}{!designsLoading && !designsError && !designs.length && <p className="text-sm text-muted-foreground">No saved designs yet.</p>}</div></main>}

    {tab === 'cart' && <main className="mx-auto max-w-6xl space-y-4 p-4"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-primary"><ShoppingCart className="h-5 w-5" />{customerMode ? 'Cart Preview' : 'Isolated admin preview cart'}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{customerMode ? 'This private preview lets you test saved cart designs. Checkout remains disabled until the Design Studio is approved for release.' : 'These entries are durable server-side previews only. They cannot enter public checkout or production while required configuration is missing.'}</p><Button size="sm" variant="outline" onClick={() => loadPreviewCart().catch(error => setSaveState(`Load failed · ${error.message}`))} disabled={previewCartLoading}>{previewCartLoading ? 'Refreshing…' : customerMode ? 'Refresh Cart' : 'Refresh preview cart'}</Button></CardContent></Card>{previewCartError && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{previewCartError} Retry the cart. If it continues, sign in again.</div>}<div className="grid gap-3 md:grid-cols-2">{previewCart.map(item => <Card key={item.id}><CardContent className="space-y-3 p-4"><div className="flex gap-3">{item.thumbnail_url && <img src={displayImage(item.thumbnail_url)} alt="" className="h-24 w-20 rounded-lg border bg-card object-contain" />}<div><p className="font-bold text-primary">{item.product_name || 'Garment not selected'}</p><p className="text-xs text-muted-foreground">{item.selected_color || 'Color pending'} · {item.selected_size || 'Size pending'} · Qty {item.quantity}</p><p className="text-xs">Method: {(methods.find(value => value.method_key === item.decoration_method)?.customer_label) || item.decoration_method}</p></div></div><div className={`rounded-lg p-3 text-sm ${item.checkout_ready ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}><p className="flex items-center gap-2 font-bold">{item.checkout_ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{item.checkout_ready ? (customerMode ? 'Ready for checkout review' : 'Checkout-ready preview') : (customerMode ? 'Needs attention before checkout' : 'Not checkout-ready')}</p>{!item.pricing_complete && <p className="mt-1">{customerMode ? 'The printing price is not available for this selection yet.' : <>Known garment amount: {item.garment_unit_price == null ? 'pending' : `$${Number(item.garment_unit_price).toFixed(2)} each`}. Printing estimate is incomplete.</>}</p>}{(item.blockers || []).length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{item.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{customerMode ? customerBlockerMessage(blocker) : blocker.message}</li>)}</ul>}</div><div className="flex items-center justify-between gap-2">{!customerMode && <p className="text-xs text-muted-foreground">Stable version · {item.design_checksum?.slice(0, 10)}</p>}<Button size="sm" onClick={() => openDesign(item.design_id)}>Open Design</Button></div></CardContent></Card>)}{!previewCartLoading && !previewCartError && !previewCart.length && <p className="text-sm text-muted-foreground">Your cart preview is empty.</p>}</div></main>}

    {tab === 'review' && <main className="mx-auto max-w-6xl space-y-4 p-4"><Card><CardHeader><CardTitle>Production review</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Review saved designs, immutable versions, print warnings, variants, method readiness, routing, and costs here. The admin-only <strong>Download Production Artwork &amp; Job Sheet</strong> action exports one transparent 300-DPI PNG for each fully configured placement plus a JSON job sheet. Garment photographs are never included in print artwork.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Design</th><th>Method</th><th>Internal route</th><th>Variant</th><th>Issues</th><th>Action</th></tr></thead><tbody>{designs.map(item => { const method = methods.find(value => value.method_key === item.print_method); return <tr key={item.id} className="border-b"><td className="p-2 font-semibold">{item.name}</td><td><span className="block">{method?.customer_label || item.print_method || 'Not selected'}</span><span className={`text-xs ${method?.available ? 'text-green-700' : 'text-amber-700'}`}>{method?.available ? 'Production route ready' : 'Fulfillment configuration required'}</span></td><td>{item.production_route}</td><td>{item.selected_color} / {item.selected_size}</td><td>{(item.validation || []).length || 'None'}</td><td><Button size="sm" variant="outline" onClick={() => openDesign(item.id)}>Review</Button></td></tr>; })}</tbody></table></div></CardContent></Card></main>}

    {tab === 'areas' && <main className="mx-auto max-w-4xl p-4"><Card><CardHeader><CardTitle>Verified print-area configuration</CardTitle></CardHeader><CardContent><p className="mb-5 text-sm text-muted-foreground">No dimensions are invented. Enter a real product/size/provider/method/location measurement and record its source. Unsupported placements remain disabled.</p><form onSubmit={saveArea} className="grid gap-4 sm:grid-cols-2">
      <Field label="Product"><select value={areaForm.product_id} onChange={event => setAreaForm(value => ({ ...value, product_id: event.target.value }))} className="h-10 w-full rounded-md border bg-card px-3"><option value="">Select product</option>{products.map(item => <option key={item.id} value={item.id}>{getPublicProductName(item)} {item.supplier_sku ? `(${item.supplier_sku})` : ''}</option>)}</select></Field>
      {officialAreaSource && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 sm:col-span-2"><a href={officialAreaSource.url} target="_blank" rel="noreferrer" className="font-bold underline">{officialAreaSource.label}</a><p className="mt-1">{officialAreaSource.note} Record a measured platen, approved transfer limit, or printer/provider specification before marking inches verified.</p></div>}
      <Field label="Size" hint="Use * only when the vendor confirms one area for every size."><Input value={areaForm.product_size} onChange={event => setAreaForm(value => ({ ...value, product_size: event.target.value }))} /></Field>
      <Field label="Route"><select value={areaForm.production_route} onChange={event => setAreaForm(value => ({ ...value, production_route: event.target.value, provider_key: event.target.value === 'printify' ? 'printify' : 'hc' }))} className="h-10 w-full rounded-md border bg-card px-3">{ACTIVE_PRODUCTION_ROUTES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="Placement"><select value={areaForm.placement} onChange={event => setAreaForm(value => ({ ...value, placement: event.target.value }))} className="h-10 w-full rounded-md border bg-card px-3">{DESIGN_PLACEMENTS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="Print method"><Input value={areaForm.print_method} onChange={event => setAreaForm(value => ({ ...value, print_method: event.target.value }))} /></Field>
      <Field label="Provider key"><Input value={areaForm.provider_key} onChange={event => setAreaForm(value => ({ ...value, provider_key: event.target.value }))} /></Field>
      <Field label="Width (inches)"><Input type="number" step=".01" min=".01" value={areaForm.width_in} onChange={event => setAreaForm(value => ({ ...value, width_in: event.target.value }))} /></Field>
      <Field label="Height (inches)"><Input type="number" step=".01" min=".01" value={areaForm.height_in} onChange={event => setAreaForm(value => ({ ...value, height_in: event.target.value }))} /></Field>
      <Field label="Minimum effective DPI"><Input type="number" min="300" max="1200" value={areaForm.min_dpi} onChange={event => setAreaForm(value => ({ ...value, min_dpi: event.target.value }))} /></Field>
      <Field label="Verification source note"><Input value={areaForm.source_note} onChange={event => setAreaForm(value => ({ ...value, source_note: event.target.value }))} placeholder="Vendor spec sheet / measured platen" /></Field>
      <div className="sm:col-span-2"><Button type="submit" className="bg-primary text-primary-foreground">Save verified area</Button></div>
    </form></CardContent></Card>
    <Card className="mt-4"><CardHeader><CardTitle>Real garment view mapping</CardTitle></CardHeader><CardContent><p className="mb-5 text-sm text-muted-foreground">An exact-color catalog front photograph is used only after explicit image approval. Upload an authorized straight-on front, back, or sleeve photograph when the catalog view is unsuitable or missing. The source and normalized preview surface are recorded; no view is fabricated, mirrored, or borrowed from another style.</p><form onSubmit={uploadMockup} className="grid gap-4 sm:grid-cols-2">
      <Field label="Product"><select value={mockupForm.product_id} onChange={event => setMockupForm(value => ({ ...value, product_id: event.target.value }))} className="h-10 w-full rounded-md border bg-card px-3"><option value="">Select product</option>{(catalogReview.items?.length ? catalogReview.items : products).map(item => <option key={item.id} value={item.id}>{getPublicProductName(item)}</option>)}</select></Field>
      <Field label="Color" hint="Use * only for an asset verified to represent every color."><Input value={mockupForm.color_key} onChange={event => setMockupForm(value => ({ ...value, color_key: event.target.value }))} /></Field>
      <Field label="View"><select value={mockupForm.view} onChange={event => setMockupForm(value => ({ ...value, view: event.target.value }))} className="h-10 w-full rounded-md border bg-card px-3"><option value="front">Front</option><option value="back">Back</option><option value="left_sleeve">Wearer-left sleeve</option><option value="right_sleeve">Wearer-right sleeve</option></select></Field>
      <Field label="Authorized source note"><Input value={mockupForm.source_note} onChange={event => setMockupForm(value => ({ ...value, source_note: event.target.value }))} placeholder="S&S catalog / licensed photographer / vendor asset" /></Field>
      <Field label="PNG or JPG photograph"><Input name="mockup_file" type="file" accept="image/png,image/jpeg" /></Field>
      <div className="grid grid-cols-4 gap-2"><Field label="X"><Input type="number" min="0" max="100" value={mockupForm.x} onChange={event => setMockupForm(value => ({ ...value, x: event.target.value }))} /></Field><Field label="Y"><Input type="number" min="0" max="120" value={mockupForm.y} onChange={event => setMockupForm(value => ({ ...value, y: event.target.value }))} /></Field><Field label="Width"><Input type="number" min="1" max="100" value={mockupForm.width} onChange={event => setMockupForm(value => ({ ...value, width: event.target.value }))} /></Field><Field label="Height"><Input type="number" min="1" max="120" value={mockupForm.height} onChange={event => setMockupForm(value => ({ ...value, height: event.target.value }))} /></Field></div>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy === 'mockup'} className="bg-primary text-primary-foreground"><Upload className="mr-2 h-4 w-4" />{busy === 'mockup' ? 'Validating and saving…' : 'Upload and map view'}</Button></div>
    </form></CardContent></Card></main>}

    {tab === 'vendors' && <main className="mx-auto max-w-6xl space-y-4 p-4"><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Cloud className="h-5 w-5" />Printify backup</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="font-semibold">Status: <span className={status?.printify?.verified ? 'text-green-700' : 'text-amber-700'}>{status?.printify?.verified ? 'Connected' : 'Deferred · not required'}</span></p><p className="text-muted-foreground">{status?.printify?.verified ? `${status.printify.shop_count} API shop(s) visible. Catalog reads are available; submission remains disabled.` : 'Printify API work is deferred. Missing credentials do not block garment selection, designing, saving, previewing, HC pricing, or vendor-neutral production exports.'}</p><p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">Printify remains a disabled backup route. No HC garment, variant, print method, placement, quote, or order is substituted or submitted.</p></CardContent></Card><Card><CardHeader><CardTitle>Cost models stay separate</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p><strong>HC blank + printing:</strong> website garment retail plus saved printing charges; internal blank, transfer, labor, packaging, fees, and shipping remain separate.</p><p><strong>Printify finished garment:</strong> HC-controlled retail; provider production already includes garment/printing, so no HC blank or transfer/press cost is added.</p><p className="text-muted-foreground">The October 3 screenshot amounts are stored as a dated, non-live reference only and are never used as pricing or quotes.</p></CardContent></Card></div>
      <Card><CardHeader><CardTitle>Print / decoration method routing</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Customers choose a decoration method, never a vendor. Draft selection and production readiness are separate: an incomplete draft may be saved and reviewed even while pricing, print areas, or an outside provider still need configuration.</p><div className="grid gap-3 lg:grid-cols-2">{methods.map(method => <form key={method.method_key} onSubmit={event => saveDecorationMethod(event, method.method_key)} className="space-y-3 rounded-xl border p-4"><input type="hidden" name="customer_label" value={method.customer_label} /><div className="flex items-center justify-between gap-3"><strong className="text-primary">{method.customer_label}</strong><span className={`rounded-full px-2 py-1 text-xs ${method.available ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{method.available ? 'Production route ready' : 'Fulfillment configuration required'}</span></div><Field label="Draft selection"><select name="draft_selectable" defaultValue={String(method.draft_selectable !== false)} className="h-10 w-full rounded-md border bg-card px-3"><option value="true">Selectable for design drafts</option><option value="false">Not selectable</option></select></Field><Field label="Production readiness" hint="Server-enforced. This is not the same as draft selection."><select name="available" defaultValue={String(method.available)} className="h-10 w-full rounded-md border bg-card px-3"><option value="true">Production route configured</option><option value="false">Production route not configured</option></select></Field><Field label="Primary internal production route"><select name="production_route" defaultValue={method.production_route} className="h-10 w-full rounded-md border bg-card px-3">{ACTIVE_PRODUCTION_ROUTES.map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></Field><Field label="Primary provider key"><Input name="provider_key" defaultValue={method.provider_key || ''} placeholder="hc or ss_fast" /></Field><Field label="Optional backup route"><select name="backup_production_route" defaultValue={method.backup_production_route || ''} className="h-10 w-full rounded-md border bg-card px-3"><option value="">No backup</option>{ACTIVE_PRODUCTION_ROUTES.map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></Field><Field label="Optional backup provider key"><Input name="backup_provider_key" defaultValue={method.backup_provider_key || ''} placeholder="printify" /></Field><Field label="Compatible garment types" hint="Comma-separated internal keys."><Input name="compatible_garment_types" defaultValue={(method.compatible_garment_types || []).join(', ')} /></Field><Field label="Compatible placements" hint="Comma-separated internal keys."><Input name="compatible_placements" defaultValue={(method.compatible_placements || []).join(', ')} /></Field><Field label="Method limits and setup note"><Input name="limits_note" defaultValue={method.limits_note || ''} /></Field><Button type="submit" variant="outline">Save method settings</Button></form>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Vinyl pricing still needs approval</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">No DTF amount is copied to vinyl. Add an approved customer service price for each supported method and placement. The price should cover material, preparation or weeding where applicable, and pressing; internal costs remain separate.</p><div className="grid gap-3 md:grid-cols-2">{vinylPricingGaps.map(({ method, missing }) => <div key={method?.method_key} className={`rounded-xl border p-3 text-sm ${missing.length ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}><p className="font-bold text-primary">{method?.customer_label}</p><p className="mt-1">{missing.length ? `Missing base prices: ${missing.map(key => DESIGN_PLACEMENTS.find(([value]) => value === key)?.[1] || key).join(', ')}.` : 'All supported base placement prices are configured.'}</p></div>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Secure decoration configuration</CardTitle></CardHeader><CardContent><p className="mb-5 text-sm text-muted-foreground">Customer-facing automatic pricing applies only to fully configured vinyl. DTF, DTG, screen printing, and embroidery always require a personalized quote. Internal costs remain private and separate from garment retail, shipping, tax, historical orders, and invoice-specific overrides.</p><form onSubmit={savePricing} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Product scope" hint="Leave as All eligible garments for a true universal service price."><select value={pricingForm.product_id} onChange={event => setPricingForm(value => ({ ...value, product_id: event.target.value }))} className="h-10 w-full rounded-md border bg-card px-3"><option value="">All eligible garments</option>{products.map(item => <option key={item.id} value={item.id}>{getPublicProductName(item)}</option>)}</select></Field>
        <Field label="Production route"><select value={pricingForm.production_route} onChange={event => setPricingForm(value => ({ ...value, production_route: event.target.value }))} className="h-10 w-full rounded-md border bg-card px-3">{ACTIVE_PRODUCTION_ROUTES.filter(([key]) => key !== 'printify').map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Placement"><select value={pricingForm.placement} onChange={event => setPricingForm(value => ({ ...value, placement: event.target.value }))} className="h-10 w-full rounded-md border bg-card px-3">{DESIGN_PLACEMENTS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Print method"><select value={pricingForm.print_method} onChange={event => setPricingForm(value => ({ ...value, print_method: event.target.value, production_route: methods.find(item => item.method_key === event.target.value)?.production_route || value.production_route }))} className="h-10 w-full rounded-md border bg-card px-3">{methods.map(method => <option key={method.method_key} value={method.method_key}>{method.customer_label}</option>)}</select></Field>
        <Field label="Customer service price"><Input type="number" min="0" step=".01" value={pricingForm.service_price} onChange={event => setPricingForm(value => ({ ...value, service_price: event.target.value }))} /></Field>
        <Field label="Material / transfer cost"><Input type="number" min="0" step=".01" value={pricingForm.transfer_cost} onChange={event => setPricingForm(value => ({ ...value, transfer_cost: event.target.value }))} /></Field>
        <Field label="Preparation / weeding labor"><Input type="number" min="0" step=".01" value={pricingForm.preparation_labor_cost} onChange={event => setPricingForm(value => ({ ...value, preparation_labor_cost: event.target.value }))} /></Field>
        <Field label="Pressing labor cost"><Input type="number" min="0" step=".01" value={pricingForm.pressing_labor_cost} onChange={event => setPricingForm(value => ({ ...value, pressing_labor_cost: event.target.value }))} /></Field>
        <Field label="Packaging cost"><Input type="number" min="0" step=".01" value={pricingForm.packaging_cost} onChange={event => setPricingForm(value => ({ ...value, packaging_cost: event.target.value }))} /></Field>
        <Field label="Other internal fee"><Input type="number" min="0" step=".01" value={pricingForm.other_fee} onChange={event => setPricingForm(value => ({ ...value, other_fee: event.target.value }))} /></Field>
        <div className="sm:col-span-2 lg:col-span-3"><Field label="Notes"><Input value={pricingForm.notes} onChange={event => setPricingForm(value => ({ ...value, notes: event.target.value }))} placeholder="Scope and source of the approved price" /></Field></div>
        <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" className="bg-primary text-primary-foreground">Save active printing price</Button></div>
      </form></CardContent></Card>
    </main>}

    {tab === 'settings' && <main className="mx-auto max-w-6xl space-y-4 p-4"><Card><CardHeader><CardTitle>Safe rollout settings</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="grid gap-3 sm:grid-cols-2"><p className="rounded-xl border p-4"><strong>Admin preview</strong><br /><span className="text-green-700">Enabled</span></p><p className="rounded-xl border p-4"><strong>Public Design Studio</strong><br /><span className="text-amber-700">Disabled</span></p><p className="rounded-xl border p-4"><strong>Custom-print checkout</strong><br /><span className="text-amber-700">Disabled</span></p><p className="rounded-xl border p-4"><strong>Vendor submission</strong><br /><span className="text-amber-700">Disabled</span></p></div><p className="text-muted-foreground">The previously hidden Custom Printing page remains hidden. Turning on public design and custom checkout requires a separate Super Admin approval after verified print areas, service prices, provider mappings, shipping, and QA are complete.</p></CardContent></Card><Card><CardHeader><CardTitle>Artwork quality target</CardTitle></CardHeader><CardContent><form onSubmit={saveRasterTarget} className="flex flex-col gap-3 sm:flex-row sm:items-end"><Field label="Default raster target (DPI)" hint="The production-readiness minimum is 300 DPI. File metadata alone never proves sufficient resolution."><Input name="default_raster_ppi" type="number" min="300" max="1200" defaultValue={targetPpi} /></Field><Button type="submit">Save target</Button></form></CardContent></Card><GarmentReviewPanel review={catalogReview} loading={catalogReviewLoading} error={catalogReviewError} onRefresh={loadCatalogReview} onSave={saveCatalogReview} busy={busy} /></main>}

    {tab === 'quotes' && <main className="mx-auto max-w-6xl space-y-4 p-4"><Card><CardHeader><CardTitle>Quote Requests</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Submitted designs are reviewed by HC Apparel. Customer pricing appears only after a personalized quote is sent.</p></CardContent></Card><div className="grid gap-3 md:grid-cols-2">{quoteRequests.map(item => <Card key={item.id}><CardContent className="space-y-2 p-4"><p className="font-bold text-primary">{item.product_type?.replaceAll('_', ' ') || 'Custom apparel'} · Qty {item.quantity}</p><p className="text-sm">{(item.decoration_methods || [item.print_method]).join(', ')}</p><p className="text-xs text-muted-foreground">Submitted {new Date(item.created_date).toLocaleString()}</p>{item.status === 'quote_sent' && <div className="rounded-xl border border-[#c9a47a] bg-[#f8f4ee] p-3"><p className="text-lg font-bold text-[#4a5e2a]">${Number(item.customer_quote_price).toFixed(2)}</p><p className="mt-1 whitespace-pre-wrap text-sm">{item.quote_terms}</p><Button className="mt-3 w-full" onClick={() => acceptQuote(item)} disabled={busy === `accept-${item.id}`}>{busy === `accept-${item.id}` ? 'Accepting…' : 'Accept Quote & Create Invoice'}</Button></div>}<span className="inline-block rounded-full bg-muted px-2 py-1 text-xs">{item.invoice_status || item.status}</span></CardContent></Card>)}{!quoteRequests.length && <p className="text-sm text-muted-foreground">No quote requests yet.</p>}</div></main>}

    <Sheet open={quoteFormOpen} onOpenChange={open => { setQuoteFormOpen(open); if (!open) setQuoteSubmitError(''); }}><SheetContent side="bottom" className="mx-auto max-h-[calc(100dvh-env(safe-area-inset-top)-.5rem)] overflow-y-auto overscroll-contain rounded-t-2xl pb-[max(2rem,env(safe-area-inset-bottom))] sm:max-w-xl"><SheetHeader><SheetTitle>{quoteReceipt ? 'Quote Request Received' : 'Request Quote'}</SheetTitle></SheetHeader>{quoteReceipt ? <section className="mt-4 space-y-4" aria-live="polite"><div className="rounded-2xl border border-[#c9a47a] bg-[#f8f4ee] p-5 text-[#202018]"><CheckCircle2 className="h-9 w-9 text-[#4a5e2a]" /><h3 className="mt-3 text-xl font-black text-[#4a5e2a]">Your quote request has been received!</h3><p className="mt-2 text-sm">HC Apparel will review your design and email you a personalized quote. No payment is due yet.</p></div><dl className="grid gap-3 rounded-xl border bg-card p-4 text-sm"><div><dt className="text-xs font-bold uppercase text-muted-foreground">Reference</dt><dd className="break-all font-mono font-semibold">{quoteReceipt.id}</dd></div><div><dt className="text-xs font-bold uppercase text-muted-foreground">Design and garment</dt><dd>{quoteReceipt.garment_selections?.product_name || document.productName || 'Custom apparel'} · {quoteReceipt.garment_selections?.color || document.color || 'Color pending'} · {quoteReceipt.garment_selections?.size || document.size || 'Size pending'} · Qty {quoteReceipt.quantity || document.quantity || 1}<br />{(quoteReceipt.decoration_methods || [quoteReceipt.print_method]).filter(Boolean).join(', ')} · {(quoteReceipt.placements || []).join(', ') || 'Placement to review'}</dd></div><div><dt className="text-xs font-bold uppercase text-muted-foreground">Submitted email</dt><dd className="break-all">{quoteReceipt.email || quoteForm.email}</dd></div><div><dt className="text-xs font-bold uppercase text-muted-foreground">Status</dt><dd><span className="inline-block rounded-full bg-[#4a5e2a] px-3 py-1 font-bold text-white">Awaiting review</span></dd></div></dl><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="h-12" onClick={() => setQuoteFormOpen(false)}>Done</Button><Button type="button" className="h-12" onClick={() => { setQuoteFormOpen(false); setTab('quotes'); }}>View Request</Button></div></section> : <form noValidate onSubmit={submitQuoteRequest} className="mt-4 space-y-4"><p className="rounded-xl bg-primary/5 p-3 text-sm text-primary">Submit your design for a personalized quote. Once you accept your quote, we’ll send an invoice for payment.</p>{warnings.some(item => item.level === 'blocker') && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Production review notes do not block this quote request.</p><p className="mt-1">HC Apparel will verify placement, print area, and artwork quality before production. You can request pricing now.</p></div>}{quoteSubmitError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive">{quoteSubmitError}</p>}<Field label="Full name"><Input ref={quoteNameRef} className={`h-12 ${quoteSubmitError && !quoteForm.full_name.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} autoComplete="name" value={quoteForm.full_name} onChange={event => setQuoteForm(value => ({ ...value, full_name: event.target.value }))} /></Field><Field label="Email"><Input ref={quoteEmailRef} className={`h-12 ${quoteSubmitError && !/^\S+@\S+\.\S+$/.test(quoteForm.email.trim()) ? 'border-destructive ring-1 ring-destructive' : ''}`} autoComplete="email" inputMode="email" type="email" value={quoteForm.email} onChange={event => setQuoteForm(value => ({ ...value, email: event.target.value }))} /></Field><Field label="Phone (optional)"><Input className="h-12" autoComplete="tel" inputMode="tel" type="tel" value={quoteForm.phone} onChange={event => setQuoteForm(value => ({ ...value, phone: event.target.value }))} /></Field><Field label="Notes (optional)"><textarea className="min-h-28 w-full rounded-md border bg-card p-3 text-base" value={quoteForm.notes} onChange={event => setQuoteForm(value => ({ ...value, notes: event.target.value }))} /></Field><Button type="submit" className="sticky bottom-0 h-12 w-full shadow-lg" disabled={busy === 'quote'}>{busy === 'quote' ? 'Submitting…' : 'Request Quote'}</Button></form>}</SheetContent></Sheet>

    {tab === 'studio' && <>{[['variants', Shirt, customerMode ? 'Choose Garment' : 'Variants'], ['add', Plus, 'Add Design'], ['layers', Layers, 'Layers']].map(([key, Icon, label]) => <Sheet key={key} open={mobilePanel === key} onOpenChange={open => setMobilePanel(open ? key : '')}><SheetContent side="bottom" className="max-h-[calc(100dvh_-_4.75rem_-_env(safe-area-inset-bottom))] overflow-y-auto rounded-t-2xl pb-[max(5.5rem,calc(1rem_+_env(safe-area-inset-bottom)))] sm:mx-auto sm:max-w-2xl"><SheetHeader><SheetTitle className="flex items-center gap-2 text-primary"><Icon className="h-5 w-5" />{label}</SheetTitle></SheetHeader>{sidePanels[key]}</SheetContent></Sheet>)}
      <Sheet open={mobilePanel === 'text'} onOpenChange={open => setMobilePanel(open ? 'text' : '')}><SheetContent side="bottom" className="max-h-[calc(100dvh_-_4.75rem_-_env(safe-area-inset-bottom))] overflow-y-auto rounded-t-2xl pb-[max(6rem,calc(1rem_+_env(safe-area-inset-bottom)))] sm:mx-auto sm:max-w-2xl"><SheetHeader><SheetTitle className="flex items-center gap-2 text-primary"><Type className="h-5 w-5" />Edit Text</SheetTitle></SheetHeader><div className="mt-3"><EditorFields selected={selected} patchSelected={patchSelected} patchTextSelected={patchTextSelected} printArea={sizingArea} methodKey={methodKey} targetPpi={targetPpi} customerMode={customerMode} onDone={() => setMobilePanel('')} /></div></SheetContent></Sheet>
      <div className={`fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t bg-card px-2 pb-2 pt-2 shadow-[0_-4px_16px_rgba(0,0,0,.12)] ${customerMode ? 'sm:hidden' : 'lg:hidden'}`}>
        {customerMode && <Button className="mb-2 h-12 w-full bg-primary text-sm text-primary-foreground hover:bg-primary/90" onClick={quoteRequired ? openQuoteForm : attachPreviewCart} disabled={Boolean(busy) || !document.productId || (!quoteRequired && !vinylPriceReady)}>{quoteRequired ? <Save className="mr-2 h-4 w-4" /> : <ShoppingCart className="mr-2 h-4 w-4" />}{busy === 'quote' ? 'Submitting…' : quoteRequired ? 'Review & Request Quote' : busy === 'cart' ? 'Adding…' : vinylPriceReady ? 'Review & Add to Cart' : 'Complete design to continue'}</Button>}
        <div className="grid grid-cols-4 gap-1">{[["variants", Shirt, customerMode ? 'Garment' : 'Variants'], ['add', Plus, 'Artwork'], ['layers', Layers, 'Layers']].map(([key, Icon, label]) => <Button key={key} type="button" variant="ghost" className="h-auto min-h-12 flex-col gap-1 text-[11px]" onClick={() => setMobilePanel(key)}><Icon className="h-5 w-5" />{label}</Button>)}
        <Button className="h-auto min-h-12 flex-col gap-1 bg-accent text-[11px] text-accent-foreground hover:bg-accent/90" onClick={save} disabled={Boolean(busy)}><Save className="h-5 w-5" />{busy === 'save' ? 'Saving…' : customerMode ? 'Save' : 'Save'}</Button></div>
      </div>
    </>}
  </div>;
}
