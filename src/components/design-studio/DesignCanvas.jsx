import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Copy, Eye, EyeOff, Group, Hand, Lock, Move, RotateCw, Trash2, Type, Ungroup, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ArtworkSizeControls from '@/components/design-studio/ArtworkSizeControls';
import { ARTWORK_OUTPUT_PPI, DESIGN_PLACEMENTS, artworkSizeInches, normalizeTextElement, synchronizeArtworkResize, updatePlacement } from '@/lib/designStudio';
import { rotatedElementBounds } from '@/lib/designLocationRegistry';

const DEFAULT_AREA = { x: 28, y: 22, width: 44, height: 58 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const svgPoint = (svg, event) => {
  const point = svg.createSVGPoint();
  point.x = event.clientX; point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
};

function Shape({ element }) {
  if (element.shape === 'circle') return <ellipse cx="50" cy="50" rx="48" ry="48" fill={element.fill} />;
  if (element.shape === 'triangle') return <polygon points="50,2 98,98 2,98" fill={element.fill} />;
  if (element.shape === 'star') return <polygon points="50,2 61,36 98,36 68,57 79,94 50,72 21,94 32,57 2,36 39,36" fill={element.fill} />;
  if (element.shape === 'line') return <line x1="2" y1="50" x2="98" y2="50" stroke={element.fill} strokeWidth="8" strokeLinecap="round" />;
  return <rect x="2" y="2" width="96" height="96" rx={element.shape === 'rounded' ? 15 : 0} fill={element.fill} />;
}

function TextElement({ area, element, sizingArea }) {
  const text = normalizeTextElement(element);
  const x = area.x + (text.x / 100) * area.width;
  const y = area.y + (text.y / 100) * area.height;
  const width = (text.width / 100) * area.width;
  const height = (text.height / 100) * area.height;
  const lines = String(text.text ?? '').split(/\r?\n/);
  const mappedHeight = Number(sizingArea?.height_in || 0);
  const fontSize = mappedHeight > 0
    ? ((text.fontSize / 72) / mappedHeight) * area.height
    : height / Math.max(1, lines.length * text.lineSpacing);
  const lineAdvance = fontSize * text.lineSpacing;
  const textX = text.textAlign === 'left' ? x : text.textAlign === 'right' ? x + width : x + width / 2;
  const anchor = text.textAlign === 'left' ? 'start' : text.textAlign === 'right' ? 'end' : 'middle';
  const style = { fontFamily: text.fontFamily, fontStyle: text.fontStyle, fontWeight: text.fontWeight, letterSpacing: `${text.letterSpacing}em` };
  if (Number(text.curve) && lines.length === 1) {
    const direction = Number(text.curve) > 0 ? -1 : 1;
    const pathId = `curve-${text.id}`;
    const middleY = y + height / 2;
    const controlY = middleY + direction * Math.min(height, Math.abs(Number(text.curve)) / 50 * height);
    return <><defs><path id={pathId} d={`M ${x} ${middleY} Q ${x + width / 2} ${controlY} ${x + width} ${middleY}`} /></defs><text fill={text.fill} fontSize={fontSize} textAnchor="middle" style={style}><textPath href={`#${pathId}`} startOffset="50%">{text.text}</textPath></text></>;
  }
  return <text fill={text.fill} fontSize={fontSize} textAnchor={anchor} dominantBaseline="hanging" style={style} aria-label={String(text.text || 'Editable text')}>
    {lines.map((line, index) => <tspan key={`${text.id}-${index}`} x={textX} y={y + index * lineAdvance}>{line || '\u00A0'}</tspan>)}
  </text>;
}

function CanvasElement({ area, element, selected, onInteract, sizingArea, invalid }) {
  if (!element.visible) return null;
  const x = area.x + (element.x / 100) * area.width;
  const y = area.y + (element.y / 100) * area.height;
  const width = (element.width / 100) * area.width;
  const height = (element.height / 100) * area.height;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const transform = `rotate(${element.rotation || 0} ${centerX} ${centerY})`;
  return <g transform={transform} opacity={element.opacity ?? 1} onPointerDown={event => onInteract(event, element, 'move')} className={element.locked ? 'cursor-not-allowed' : 'cursor-move'} role="button" aria-label={`${element.name || element.type} layer. Tap to select; enable Move artwork before dragging on touch screens.`}>
    {element.type !== 'text' && <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">
      {element.type === 'image' && <image href={element.previewUrl} width="100" height="100" preserveAspectRatio="xMidYMid meet" />}
      {element.type === 'shape' && <Shape element={element} />}
    </svg>}
    {element.type === 'text' && <TextElement area={area} element={element} sizingArea={sizingArea} />}
    {(selected || invalid) && <><rect x={x} y={y} width={width} height={height} fill="none" stroke={invalid ? '#B91C1C' : 'hsl(var(--accent))'} strokeWidth=".8" strokeDasharray="2 1" vectorEffect="non-scaling-stroke" />{selected && !element.locked && <><line x1={centerX} y1={y} x2={centerX} y2={y - 6} stroke="hsl(var(--accent))" strokeWidth=".65" vectorEffect="non-scaling-stroke" /><circle cx={centerX} cy={y - 8} r="3.6" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth=".8" vectorEffect="non-scaling-stroke" className="cursor-grab" onPointerDown={event => onInteract(event, element, 'rotate')} /><circle cx={x + width} cy={y + height} r="3.8" fill="hsl(var(--accent))" stroke="hsl(var(--card))" strokeWidth=".8" vectorEffect="non-scaling-stroke" className="cursor-nwse-resize" onPointerDown={event => onInteract(event, element, 'resize')} /></>}</>}
  </g>;
}

export default function DesignCanvas({ document, setDocument, beginDocumentInteraction, endDocumentInteraction, printArea, sizingArea = printArea, selectedIds, setSelectedIds, previewMode, mockup, previewArea = DEFAULT_AREA, unavailableReason = '', targetPpi = ARTWORK_OUTPUT_PPI, customerMode = false, locationLabel = '', onEditText }) {
  const svgRef = useRef(null);
  const interactionRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [touchEditMode, setTouchEditMode] = useState(false);
  const placement = document.activePlacement;
  const elements = document.placements?.[placement] || [];
  const selected = elements.find(item => selectedIds.includes(item.id));
  const placementLabel = locationLabel || DESIGN_PLACEMENTS.find(([key]) => key === placement)?.[1] || placement;
  const physical = useMemo(() => selected ? artworkSizeInches(selected, sizingArea) : null, [selected, sizingArea]);
  const selectedBounds = selected ? rotatedElementBounds(selected) : null;
  const selectedOutOfBounds = Boolean(selectedBounds && (selectedBounds.x < 0 || selectedBounds.y < 0 || selectedBounds.x + selectedBounds.width > 100 || selectedBounds.y + selectedBounds.height > 100));

  const patchSelected = patch => setDocument(updatePlacement(document, placement, items => items.map(item => selectedIds.includes(item.id) ? { ...item, ...patch } : item)));
  const deleteSelected = () => { setDocument(updatePlacement(document, placement, items => items.filter(item => !selectedIds.includes(item.id)))); setSelectedIds([]); };
  const duplicate = () => {
    const copies = elements.filter(item => selectedIds.includes(item.id)).map(item => ({ ...item, id: crypto.randomUUID(), name: `${item.name} copy`, x: clamp(item.x + 4, 0, 95), y: clamp(item.y + 4, 0, 95) }));
    setDocument(updatePlacement(document, placement, items => [...items, ...copies])); setSelectedIds(copies.map(item => item.id));
  };
  const group = () => patchSelected({ groupId: crypto.randomUUID() });
  const ungroup = () => patchSelected({ groupId: null });

  const startInteraction = (event, element, mode) => {
    if (event.pointerType === 'touch' && !touchEditMode) {
      setSelectedIds([element.id]);
      return;
    }
    window.document.activeElement?.blur?.();
    event.preventDefault(); event.stopPropagation();
    if (element.locked || previewMode || !mockup?.url) return;
    const svg = svgRef.current;
    const point = svgPoint(svg, event);
    const ids = element.groupId && mode === 'move' ? elements.filter(item => item.groupId === element.groupId).map(item => item.id) : [element.id];
    setSelectedIds(event.shiftKey ? [...new Set([...selectedIds, ...ids])] : ids);
    const originals = elements.filter(item => ids.includes(item.id)).map(item => ({ ...item }));
    const center = { x: previewArea.x + ((element.x + element.width / 2) / 100) * previewArea.width, y: previewArea.y + ((element.y + element.height / 2) / 100) * previewArea.height };
    interactionRef.current = { pointerId: event.pointerId, mode, start: point, originals, center, startAngle: Math.atan2(point.y - center.y, point.x - center.x), elementId: element.id, elementType: element.type, moved: false };
    beginDocumentInteraction?.();
    svg.setPointerCapture(event.pointerId);
  };
  const moveInteraction = event => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const point = svgPoint(svgRef.current, event);
    const dx = ((point.x - interaction.start.x) / previewArea.width) * 100;
    const dy = ((point.y - interaction.start.y) / previewArea.height) * 100;
    if (Math.hypot(dx, dy) > .35) interaction.moved = true;
    setDocument(updatePlacement(document, placement, items => items.map(item => {
      const original = interaction.originals.find(value => value.id === item.id);
      if (!original) return item;
      if (interaction.mode === 'move') return { ...item, x: clamp(original.x + dx, -item.width + 1, 99), y: clamp(original.y + dy, -item.height + 1, 99) };
      if (interaction.mode === 'resize') {
        let nextWidth;
        let nextHeight;
        if (original.aspectRatioLocked === false) {
          nextWidth = clamp(original.width + dx, 2, 100);
          nextHeight = clamp(original.height + dy, 2, 100);
        } else {
          const ratio = Math.max(.05, Math.max((original.width + dx) / original.width, (original.height + dy) / original.height));
          nextWidth = clamp(original.width * ratio, 2, 100);
          nextHeight = clamp(original.height * ratio, 2, 100);
        }
        return { ...item, ...synchronizeArtworkResize(original, nextWidth, nextHeight, sizingArea) };
      }
      const angle = Math.atan2(point.y - interaction.center.y, point.x - interaction.center.x);
      return { ...item, rotation: Math.round(original.rotation + ((angle - interaction.startAngle) * 180) / Math.PI) };
    })), { transient: true });
  };
  const endInteraction = event => {
    const interaction = interactionRef.current;
    if (interaction?.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    endDocumentInteraction?.();
    if (interaction.elementType === 'text' && interaction.mode === 'move' && !interaction.moved) onEditText?.(interaction.elementId);
  };
  const keyboardMove = event => {
    if (!selected || selected.locked || previewMode) return;
    const delta = event.shiftKey ? 5 : 1;
    const movement = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }[event.key];
    if (!movement) return;
    event.preventDefault(); patchSelected({ x: clamp(selected.x + movement[0], -selected.width + 1, 99), y: clamp(selected.y + movement[1], -selected.height + 1, 99) });
  };

  return <section className="min-w-0 rounded-2xl border border-border bg-background shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4"><div><p className="text-xs font-bold uppercase tracking-wide text-primary">{placementLabel}</p><p className="text-[11px] text-muted-foreground">Left and right use the wearer&apos;s perspective.</p></div><div className="flex items-center gap-1"><Button size="sm" variant="outline" onClick={() => setZoom(value => clamp(value - .1, .7, 1.5))} aria-label="Zoom out">−</Button><button type="button" className="w-12 rounded-md text-center text-xs underline-offset-2 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><Button size="sm" variant="outline" onClick={() => setZoom(value => clamp(value + .1, .7, 1.5))} aria-label="Zoom in">+</Button></div></div>
    {mockup?.url && !previewMode && <div className="border-b border-border bg-card px-3 py-2 sm:hidden"><Button type="button" size="sm" variant={touchEditMode ? 'default' : 'outline'} className="h-11 w-full" aria-pressed={touchEditMode} onClick={() => setTouchEditMode(value => !value)}>{touchEditMode ? <Hand className="mr-2 h-4 w-4" /> : <Move className="mr-2 h-4 w-4" />}{touchEditMode ? 'Done moving artwork' : 'Move or resize artwork'}</Button><p className="mt-1 text-center text-[11px] text-muted-foreground">{touchEditMode ? 'Drag the selected artwork or its larger corner handles. Two-finger page scrolling remains available outside the canvas.' : 'Scroll normally. Tap a layer to select it, then enable movement.'}</p></div>}
    {!mockup?.url ? <div className="m-3 flex min-h-[360px] items-center justify-center rounded-xl border-2 border-dashed border-primary/40 bg-card p-6 text-center sm:min-h-[520px]"><div><p className="font-bold text-primary">{document.productId ? `${placementLabel} photo unavailable` : 'Choose a garment to begin'}</p><p className="mt-2 max-w-md text-sm text-muted-foreground">{unavailableReason || 'Use Choose Garment above the canvas. The studio only shows real catalog or admin-mapped garment photographs.'}</p></div></div> : <div className="max-w-full overflow-auto p-2 sm:p-4" style={{ touchAction: touchEditMode ? 'none' : 'pan-y' }}><div className="mx-auto aspect-[4/5] w-full max-w-[660px] origin-top" style={{ transform: `scale(${zoom})`, marginBottom: `${Math.max(0, zoom - 1) * 80}%` }}><svg ref={svgRef} viewBox="0 0 100 120" tabIndex={0} aria-label={`${placementLabel} garment design canvas`} className="h-full w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ touchAction: touchEditMode ? 'none' : 'pan-y' }} onKeyDown={keyboardMove} onPointerMove={moveInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} onPointerDown={event => { if (event.target === event.currentTarget) setSelectedIds([]); }}><rect width="100" height="120" rx="3" fill="hsl(var(--card))" /><image href={mockup.url} x="3" y="2" width="94" height="112" preserveAspectRatio="xMidYMid meet" opacity={previewMode ? 1 : .82} />{!previewMode && <><rect x={previewArea.x} y={previewArea.y} width={previewArea.width} height={previewArea.height} fill="hsl(var(--primary) / .035)" stroke={printArea?.verified ? 'hsl(var(--primary))' : 'hsl(var(--accent))'} strokeWidth=".7" strokeDasharray="2 1" /><line x1={previewArea.x + previewArea.width / 2} y1={previewArea.y} x2={previewArea.x + previewArea.width / 2} y2={previewArea.y + previewArea.height} stroke="hsl(var(--accent))" strokeWidth=".25" strokeDasharray="1 1" /><line x1={previewArea.x} y1={previewArea.y + previewArea.height / 2} x2={previewArea.x + previewArea.width} y2={previewArea.y + previewArea.height} stroke="hsl(var(--accent))" strokeWidth=".25" strokeDasharray="1 1" /></>}{elements.map(element => { const bounds = rotatedElementBounds(element); const invalid = bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > 100 || bounds.y + bounds.height > 100; return <CanvasElement key={element.id} area={previewArea} element={element} selected={selectedIds.includes(element.id) && !previewMode} onInteract={startInteraction} sizingArea={sizingArea} invalid={invalid} />; })}{!previewMode && <text x="50" y="117" textAnchor="middle" fontSize="2.4" fill="hsl(var(--muted-foreground))">{printArea?.verified ? `${printArea.width_in} × ${printArea.height_in} in · ${Math.max(ARTWORK_OUTPUT_PPI, Number(printArea.min_dpi || 0))} DPI minimum` : customerMode ? 'Approximate placement preview' : 'Uncalibrated preview · intended size is not yet verified garment fit'}</text>}</svg></div></div>}
    {selected && !previewMode && mockup?.url && <div className="sticky bottom-0 z-10 space-y-2 border-t border-border bg-card/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur">{selectedOutOfBounds && <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />This layer extends beyond the selected print area. Reposition or resize it before production.</p>}<div className="flex flex-wrap gap-1">{selected.type === 'text' && <Button size="sm" onClick={() => onEditText?.(selected.id)}><Type className="mr-1 h-3.5 w-3.5" />Edit Text</Button>}<Button size="sm" variant="outline" onClick={duplicate}><Copy className="mr-1 h-3.5 w-3.5" />Duplicate</Button><Button size="sm" variant="outline" onClick={() => patchSelected({ locked: !selected.locked })}>{selected.locked ? <Unlock className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}{selected.locked ? 'Unlock' : 'Lock'}</Button><Button size="sm" variant="outline" onClick={selected.groupId ? ungroup : group}>{selected.groupId ? <Ungroup className="mr-1 h-3.5 w-3.5" /> : <Group className="mr-1 h-3.5 w-3.5" />}{selected.groupId ? 'Ungroup' : 'Group'}</Button><Button size="sm" variant="outline" onClick={() => patchSelected({ visible: !selected.visible })}>{selected.visible ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}Hide</Button><Button size="sm" variant="destructive" onClick={deleteSelected}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button></div><ArtworkSizeControls element={selected} patchElement={patchSelected} printArea={sizingArea} targetPpi={targetPpi} compact customerMode={customerMode} /><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><label className="text-[11px]">Rotation°<Input aria-label="Artwork rotation in degrees" type="number" value={Math.round(selected.rotation || 0)} onChange={event => patchSelected({ rotation: Number(event.target.value) || 0 })} className="h-8" /></label><Button size="sm" variant="outline" className="mt-auto h-8" onClick={() => patchSelected({ x: (100 - selected.width) / 2 })}>Center horizontal</Button><Button size="sm" variant="outline" className="mt-auto h-8" onClick={() => patchSelected({ y: (100 - selected.height) / 2 })}>Center vertical</Button></div>{physical?.width && physical?.height ? <p className="text-xs text-muted-foreground"><RotateCw className="mr-1 inline h-3 w-3" />Intended artwork size: {Number(physical.width).toFixed(2)} × {Number(physical.height).toFixed(2)} inches{physical.source === 'calibrated' ? ' · mapped from verified garment calibration' : ' · approximate placement preview'}</p> : <p className="text-xs text-amber-700">{customerMode ? 'Enter the print Width and Height to check artwork quality. Final garment fit is confirmed during review.' : 'Enter intended Width and Height to assess output size. Garment fit is checked separately when calibration is available.'}</p>}</div>}
  </section>;
}
