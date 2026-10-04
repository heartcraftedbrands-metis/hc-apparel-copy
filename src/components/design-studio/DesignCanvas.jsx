import { useMemo, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Group, Lock, RotateCw, Trash2, Ungroup, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ArtworkSizeControls from '@/components/design-studio/ArtworkSizeControls';
import { ARTWORK_OUTPUT_PPI, DESIGN_PLACEMENTS, artworkSizeInches, synchronizeArtworkResize, updatePlacement } from '@/lib/designStudio';

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

function CanvasElement({ area, element, selected, onInteract }) {
  if (!element.visible) return null;
  const x = area.x + (element.x / 100) * area.width;
  const y = area.y + (element.y / 100) * area.height;
  const width = (element.width / 100) * area.width;
  const height = (element.height / 100) * area.height;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const transform = `rotate(${element.rotation || 0} ${centerX} ${centerY})`;
  return <g transform={transform} opacity={element.opacity ?? 1} onPointerDown={event => onInteract(event, element, 'move')} className={element.locked ? 'cursor-not-allowed' : 'cursor-move'}>
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">
      {element.type === 'image' && <image href={element.previewUrl} width="100" height="100" preserveAspectRatio="xMidYMid meet" />}
      {element.type === 'shape' && <Shape element={element} />}
      {element.type === 'text' && (Number(element.curve)
        ? <><defs><path id={`curve-${element.id}`} d={`M 4 ${50 + Number(element.curve) / 2} Q 50 ${50 - Number(element.curve)} 96 ${50 + Number(element.curve) / 2}`} /></defs><text fill={element.fill} fontFamily={element.fontFamily} fontWeight={element.fontWeight} fontSize="18" textAnchor="middle"><textPath href={`#curve-${element.id}`} startOffset="50%">{element.text}</textPath></text></>
        : <text x="50" y="58" fill={element.fill} fontFamily={element.fontFamily} fontWeight={element.fontWeight} fontSize="24" textAnchor="middle" lengthAdjust="spacingAndGlyphs" textLength="92">{element.text}</text>)}
    </svg>
    {selected && <><rect x={x} y={y} width={width} height={height} fill="none" stroke="#b58d2a" strokeWidth=".8" strokeDasharray="2 1" vectorEffect="non-scaling-stroke" />{!element.locked && <><line x1={centerX} y1={y} x2={centerX} y2={y - 5} stroke="#b58d2a" strokeWidth=".65" vectorEffect="non-scaling-stroke" /><circle cx={centerX} cy={y - 6.5} r="2.2" fill="#fff" stroke="#4b1236" strokeWidth=".7" vectorEffect="non-scaling-stroke" className="cursor-grab" onPointerDown={event => onInteract(event, element, 'rotate')} /><circle cx={x + width} cy={y + height} r="2.5" fill="#b58d2a" stroke="#fff" strokeWidth=".7" vectorEffect="non-scaling-stroke" className="cursor-nwse-resize" onPointerDown={event => onInteract(event, element, 'resize')} /></>}</>}
  </g>;
}

export default function DesignCanvas({ document, setDocument, printArea, selectedIds, setSelectedIds, previewMode, mockup, previewArea = DEFAULT_AREA, unavailableReason = '', targetPpi = ARTWORK_OUTPUT_PPI }) {
  const svgRef = useRef(null);
  const interactionRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const placement = document.activePlacement;
  const elements = document.placements?.[placement] || [];
  const selected = elements.find(item => selectedIds.includes(item.id));
  const placementLabel = DESIGN_PLACEMENTS.find(([key]) => key === placement)?.[1] || placement;
  const physical = useMemo(() => selected ? artworkSizeInches(selected, printArea) : null, [printArea, selected]);

  const patchSelected = patch => setDocument(updatePlacement(document, placement, items => items.map(item => selectedIds.includes(item.id) ? { ...item, ...patch } : item)));
  const deleteSelected = () => { setDocument(updatePlacement(document, placement, items => items.filter(item => !selectedIds.includes(item.id)))); setSelectedIds([]); };
  const duplicate = () => {
    const copies = elements.filter(item => selectedIds.includes(item.id)).map(item => ({ ...item, id: crypto.randomUUID(), name: `${item.name} copy`, x: clamp(item.x + 4, 0, 95), y: clamp(item.y + 4, 0, 95) }));
    setDocument(updatePlacement(document, placement, items => [...items, ...copies])); setSelectedIds(copies.map(item => item.id));
  };
  const group = () => patchSelected({ groupId: crypto.randomUUID() });
  const ungroup = () => patchSelected({ groupId: null });

  const startInteraction = (event, element, mode) => {
    event.preventDefault(); event.stopPropagation();
    if (element.locked || previewMode || !mockup?.url) return;
    const svg = svgRef.current;
    const point = svgPoint(svg, event);
    const ids = element.groupId && mode === 'move' ? elements.filter(item => item.groupId === element.groupId).map(item => item.id) : [element.id];
    setSelectedIds(event.shiftKey ? [...new Set([...selectedIds, ...ids])] : ids);
    const originals = elements.filter(item => ids.includes(item.id)).map(item => ({ ...item }));
    const center = { x: previewArea.x + ((element.x + element.width / 2) / 100) * previewArea.width, y: previewArea.y + ((element.y + element.height / 2) / 100) * previewArea.height };
    interactionRef.current = { pointerId: event.pointerId, mode, start: point, originals, center, startAngle: Math.atan2(point.y - center.y, point.x - center.x) };
    svg.setPointerCapture(event.pointerId);
  };
  const moveInteraction = event => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const point = svgPoint(svgRef.current, event);
    const dx = ((point.x - interaction.start.x) / previewArea.width) * 100;
    const dy = ((point.y - interaction.start.y) / previewArea.height) * 100;
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
        return { ...item, ...synchronizeArtworkResize(original, nextWidth, nextHeight, printArea) };
      }
      const angle = Math.atan2(point.y - interaction.center.y, point.x - interaction.center.x);
      return { ...item, rotation: Math.round(original.rotation + ((angle - interaction.startAngle) * 180) / Math.PI) };
    })));
  };
  const endInteraction = event => { if (interactionRef.current?.pointerId === event.pointerId) interactionRef.current = null; };
  const keyboardMove = event => {
    if (!selected || selected.locked || previewMode) return;
    const delta = event.shiftKey ? 5 : 1;
    const movement = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }[event.key];
    if (!movement) return;
    event.preventDefault(); patchSelected({ x: clamp(selected.x + movement[0], -selected.width + 1, 99), y: clamp(selected.y + movement[1], -selected.height + 1, 99) });
  };

  return <section className="min-w-0 rounded-2xl border border-[#d8c9b7] bg-[#f7f3ea] shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d8c9b7] px-3 py-2 sm:px-4"><div><p className="text-xs font-bold uppercase tracking-wide text-[#4b1236]">{placementLabel}</p><p className="text-[11px] text-muted-foreground">Left and right use the wearer&apos;s perspective.</p></div><div className="flex items-center gap-1"><Button size="sm" variant="outline" onClick={() => setZoom(value => clamp(value - .1, .7, 1.5))} aria-label="Zoom out">−</Button><button type="button" className="w-12 text-center text-xs underline-offset-2 hover:underline" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><Button size="sm" variant="outline" onClick={() => setZoom(value => clamp(value + .1, .7, 1.5))} aria-label="Zoom in">+</Button></div></div>
    {!mockup?.url ? <div className="m-3 flex min-h-[360px] items-center justify-center rounded-xl border-2 border-dashed border-[#b58d2a]/50 bg-white p-6 text-center sm:min-h-[520px]"><div><p className="font-bold text-[#4b1236]">{document.productId ? `${placementLabel} photo unavailable` : 'Choose a garment to begin'}</p><p className="mt-2 max-w-md text-sm text-muted-foreground">{unavailableReason || 'Use Choose Garment above the canvas. The studio only shows real catalog or admin-mapped garment photographs.'}</p></div></div> : <div className="max-w-full overflow-auto p-2 [touch-action:pan-y] sm:p-4"><div className="mx-auto aspect-[4/5] w-full max-w-[660px] origin-top" style={{ transform: `scale(${zoom})`, marginBottom: `${Math.max(0, zoom - 1) * 80}%` }}><svg ref={svgRef} viewBox="0 0 100 120" tabIndex={0} aria-label={`${placementLabel} garment design canvas`} className="h-full w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-[#b58d2a]" style={{ touchAction: 'none' }} onKeyDown={keyboardMove} onPointerMove={moveInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} onPointerDown={event => { if (event.target === event.currentTarget) setSelectedIds([]); }}><rect width="100" height="120" rx="3" fill="#fcfaf5" /><image href={mockup.url} x="3" y="2" width="94" height="112" preserveAspectRatio="xMidYMid meet" opacity={previewMode ? 1 : .82} />{!previewMode && <><rect x={previewArea.x} y={previewArea.y} width={previewArea.width} height={previewArea.height} fill="rgba(75,18,54,.025)" stroke={printArea?.verified ? '#4f6b45' : '#b45309'} strokeWidth=".7" strokeDasharray="2 1" /><line x1={previewArea.x + previewArea.width / 2} y1={previewArea.y} x2={previewArea.x + previewArea.width / 2} y2={previewArea.y + previewArea.height} stroke="#b58d2a" strokeWidth=".25" strokeDasharray="1 1" /><line x1={previewArea.x} y1={previewArea.y + previewArea.height / 2} x2={previewArea.x + previewArea.width} y2={previewArea.y + previewArea.height / 2} stroke="#b58d2a" strokeWidth=".25" strokeDasharray="1 1" /></>}{elements.map(element => <CanvasElement key={element.id} area={previewArea} element={element} selected={selectedIds.includes(element.id) && !previewMode} onInteract={startInteraction} />)}{!previewMode && <text x="50" y="117" textAnchor="middle" fontSize="2.4" fill="#6b625b">{printArea?.verified ? `${printArea.width_in} × ${printArea.height_in} in · ${Math.max(ARTWORK_OUTPUT_PPI, Number(printArea.min_dpi || 0))} DPI minimum` : 'Uncalibrated preview · intended size is not yet verified garment fit'}</text>}</svg></div></div>}
    {selected && !previewMode && mockup?.url && <div className="sticky bottom-0 z-10 space-y-2 border-t border-[#d8c9b7] bg-white/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur"><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={duplicate}><Copy className="mr-1 h-3.5 w-3.5" />Duplicate</Button><Button size="sm" variant="outline" onClick={() => patchSelected({ locked: !selected.locked })}>{selected.locked ? <Unlock className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}{selected.locked ? 'Unlock' : 'Lock'}</Button><Button size="sm" variant="outline" onClick={selected.groupId ? ungroup : group}>{selected.groupId ? <Ungroup className="mr-1 h-3.5 w-3.5" /> : <Group className="mr-1 h-3.5 w-3.5" />}{selected.groupId ? 'Ungroup' : 'Group'}</Button><Button size="sm" variant="outline" onClick={() => patchSelected({ visible: !selected.visible })}>{selected.visible ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}Hide</Button><Button size="sm" variant="destructive" onClick={deleteSelected}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button></div><ArtworkSizeControls element={selected} patchElement={patchSelected} printArea={printArea} targetPpi={targetPpi} compact /><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><label className="text-[11px]">Rotation°<Input aria-label="Artwork rotation in degrees" type="number" value={Math.round(selected.rotation || 0)} onChange={event => patchSelected({ rotation: Number(event.target.value) || 0 })} className="h-8" /></label><Button size="sm" variant="outline" className="mt-auto h-8" onClick={() => patchSelected({ x: (100 - selected.width) / 2 })}>Center horizontal</Button><Button size="sm" variant="outline" className="mt-auto h-8" onClick={() => patchSelected({ y: (100 - selected.height) / 2 })}>Center vertical</Button></div>{physical?.width && physical?.height ? <p className="text-xs text-muted-foreground"><RotateCw className="mr-1 inline h-3 w-3" />Intended artwork size: {Number(physical.width).toFixed(2)} × {Number(physical.height).toFixed(2)} inches{physical.source === 'calibrated' ? ' · mapped from verified garment calibration' : ''}</p> : <p className="text-xs text-amber-700">Enter intended Width and Height to assess output size. Garment fit is checked separately when calibration is available.</p>}</div>}
  </section>;
}
