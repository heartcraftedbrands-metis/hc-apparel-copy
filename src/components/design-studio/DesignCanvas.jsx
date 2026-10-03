import { useMemo, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Group, Lock, RotateCw, Trash2, Ungroup, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DESIGN_PLACEMENTS, updatePlacement } from '@/lib/designStudio';

const AREA = { x: 20, y: 17, width: 60, height: 68 };
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

function CanvasElement({ element, selected, onPointerDown }) {
  if (!element.visible) return null;
  const x = AREA.x + (element.x / 100) * AREA.width;
  const y = AREA.y + (element.y / 100) * AREA.height;
  const width = (element.width / 100) * AREA.width;
  const height = (element.height / 100) * AREA.height;
  const transform = `rotate(${element.rotation || 0} ${x + width / 2} ${y + height / 2})`;
  return (
    <g transform={transform} opacity={element.opacity ?? 1} onPointerDown={onPointerDown} className={element.locked ? 'cursor-not-allowed' : 'cursor-move'}>
      <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">
        {element.type === 'image' && <image href={element.previewUrl} width="100" height="100" preserveAspectRatio="xMidYMid meet" />}
        {element.type === 'shape' && <Shape element={element} />}
        {element.type === 'text' && (Number(element.curve)
          ? <>
              <defs><path id={`curve-${element.id}`} d={`M 4 ${50 + Number(element.curve) / 2} Q 50 ${50 - Number(element.curve)} 96 ${50 + Number(element.curve) / 2}`} /></defs>
              <text fill={element.fill} fontFamily={element.fontFamily} fontWeight={element.fontWeight} fontSize="18" textAnchor="middle"><textPath href={`#curve-${element.id}`} startOffset="50%">{element.text}</textPath></text>
            </>
          : <text x="50" y="58" fill={element.fill} fontFamily={element.fontFamily} fontWeight={element.fontWeight} fontSize="24" textAnchor="middle" lengthAdjust="spacingAndGlyphs" textLength="92">{element.text}</text>)}
      </svg>
      {selected && <rect x={x} y={y} width={width} height={height} fill="none" stroke="#b58d2a" strokeWidth=".7" strokeDasharray="2 1" vectorEffect="non-scaling-stroke" />}
    </g>
  );
}

export default function DesignCanvas({ document, setDocument, printArea, selectedIds, setSelectedIds, previewMode }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const placement = document.activePlacement;
  const elements = document.placements?.[placement] || [];
  const selected = elements.find(item => selectedIds.includes(item.id));
  const placementLabel = DESIGN_PLACEMENTS.find(([key]) => key === placement)?.[1] || placement;
  const physical = useMemo(() => selected && printArea?.width_in ? {
    width: ((selected.width / 100) * Number(printArea.width_in)).toFixed(2),
    height: ((selected.height / 100) * Number(printArea.height_in)).toFixed(2),
  } : null, [printArea, selected]);

  const patchSelected = patch => setDocument(updatePlacement(document, placement, items => items.map(item => selectedIds.includes(item.id) ? { ...item, ...patch } : item)));
  const deleteSelected = () => {
    setDocument(updatePlacement(document, placement, items => items.filter(item => !selectedIds.includes(item.id))));
    setSelectedIds([]);
  };
  const duplicate = () => {
    const copies = elements.filter(item => selectedIds.includes(item.id)).map(item => ({ ...item, id: crypto.randomUUID(), name: `${item.name} copy`, x: clamp(item.x + 4, 0, 95), y: clamp(item.y + 4, 0, 95) }));
    setDocument(updatePlacement(document, placement, items => [...items, ...copies]));
    setSelectedIds(copies.map(item => item.id));
  };
  const group = () => patchSelected({ groupId: crypto.randomUUID() });
  const ungroup = () => patchSelected({ groupId: null });

  const startDrag = (event, element) => {
    event.preventDefault();
    if (element.locked || previewMode) return;
    const svg = svgRef.current;
    const point = svgPoint(svg, event);
    const ids = element.groupId ? elements.filter(item => item.groupId === element.groupId).map(item => item.id) : [element.id];
    setSelectedIds(event.shiftKey ? [...new Set([...selectedIds, ...ids])] : ids);
    dragRef.current = { pointerId: event.pointerId, start: point, originals: elements.filter(item => ids.includes(item.id)).map(item => ({ id: item.id, x: item.x, y: item.y })) };
    svg.setPointerCapture(event.pointerId);
  };
  const moveDrag = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = svgPoint(svgRef.current, event);
    const dx = ((point.x - drag.start.x) / AREA.width) * 100;
    const dy = ((point.y - drag.start.y) / AREA.height) * 100;
    setDocument(updatePlacement(document, placement, items => items.map(item => {
      const original = drag.originals.find(value => value.id === item.id);
      if (!original) return item;
      return { ...item, x: clamp(original.x + dx, -item.width + 1, 99), y: clamp(original.y + dy, -item.height + 1, 99) };
    })));
  };
  const endDrag = event => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <section className="min-w-0 rounded-2xl border border-[#d8c9b7] bg-[#f7f3ea] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d8c9b7] px-3 py-2 sm:px-4">
        <div><p className="text-xs font-bold uppercase tracking-wide text-[#4b1236]">{placementLabel}</p><p className="text-[11px] text-muted-foreground">Left and right use the wearer&apos;s perspective.</p></div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setZoom(value => clamp(value - .1, .7, 1.6))} aria-label="Zoom out">−</Button>
          <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" onClick={() => setZoom(value => clamp(value + .1, .7, 1.6))} aria-label="Zoom in">+</Button>
        </div>
      </div>
      <div className="max-w-full overflow-auto p-2 [touch-action:none] sm:p-4">
        <div className="mx-auto aspect-[4/5] w-full max-w-[660px] origin-top" style={{ transform: `scale(${zoom})`, marginBottom: `${(zoom - 1) * 80}%` }}>
          <svg ref={svgRef} viewBox="0 0 100 120" className="h-full w-full select-none" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerDown={event => { if (event.target === event.currentTarget) setSelectedIds([]); }}>
            <rect width="100" height="120" rx="3" fill="#fcfaf5" />
            {document.productImage
              ? <image href={document.productImage} x="4" y="3" width="92" height="110" preserveAspectRatio="xMidYMid meet" opacity={previewMode ? 1 : .55} />
              : <path d="M23 20L38 12Q50 22 62 12L77 20L94 39L82 51L75 43V108H25V43L18 51L6 39Z" fill="#fff" stroke="#967e68" strokeWidth=".8" />}
            {!previewMode && <>
              <rect x={AREA.x} y={AREA.y} width={AREA.width} height={AREA.height} fill="rgba(75,18,54,.035)" stroke={printArea?.verified ? '#4f6b45' : '#b45309'} strokeWidth=".7" strokeDasharray="2 1" />
              <line x1="50" y1={AREA.y} x2="50" y2={AREA.y + AREA.height} stroke="#b58d2a" strokeWidth=".25" strokeDasharray="1 1" />
              <line x1={AREA.x} y1={AREA.y + AREA.height / 2} x2={AREA.x + AREA.width} y2={AREA.y + AREA.height / 2} stroke="#b58d2a" strokeWidth=".25" strokeDasharray="1 1" />
            </>}
            {elements.map(element => <CanvasElement key={element.id} element={element} selected={selectedIds.includes(element.id) && !previewMode} onPointerDown={event => startDrag(event, element)} />)}
            {!previewMode && <text x="50" y="116" textAnchor="middle" fontSize="2.4" fill="#6b625b">{printArea?.verified ? `${printArea.width_in} × ${printArea.height_in} in · ${printArea.min_dpi} DPI minimum` : 'Preview only · verified physical print area not configured'}</text>}
          </svg>
        </div>
      </div>
      {selected && !previewMode && (
        <div className="sticky bottom-0 z-10 space-y-2 border-t border-[#d8c9b7] bg-white/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={duplicate}><Copy className="mr-1 h-3.5 w-3.5" />Duplicate</Button>
            <Button size="sm" variant="outline" onClick={() => patchSelected({ locked: !selected.locked })}>{selected.locked ? <Unlock className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}{selected.locked ? 'Unlock' : 'Lock'}</Button>
            <Button size="sm" variant="outline" onClick={selected.groupId ? ungroup : group}>{selected.groupId ? <Ungroup className="mr-1 h-3.5 w-3.5" /> : <Group className="mr-1 h-3.5 w-3.5" />}{selected.groupId ? 'Ungroup' : 'Group'}</Button>
            <Button size="sm" variant="outline" onClick={() => patchSelected({ visible: !selected.visible })}>{selected.visible ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}Hide</Button>
            <Button size="sm" variant="destructive" onClick={deleteSelected}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <label className="text-[11px]">Width %<Input type="number" value={Math.round(selected.width)} min="1" max="100" onChange={event => { const width = clamp(Number(event.target.value), 1, 100); patchSelected({ width, height: clamp(width * (selected.height / selected.width), 1, 100) }); }} className="h-8" /></label>
            <label className="text-[11px]">Height %<Input type="number" value={Math.round(selected.height)} min="1" max="100" onChange={event => { const height = clamp(Number(event.target.value), 1, 100); patchSelected({ height, width: clamp(height * (selected.width / selected.height), 1, 100) }); }} className="h-8" /></label>
            <label className="text-[11px]">Rotation°<Input type="number" value={Math.round(selected.rotation || 0)} onChange={event => patchSelected({ rotation: Number(event.target.value) || 0 })} className="h-8" /></label>
            <Button size="sm" variant="outline" className="mt-auto h-8" onClick={() => patchSelected({ x: (100 - selected.width) / 2 })}>Center horizontal</Button>
            <Button size="sm" variant="outline" className="mt-auto h-8" onClick={() => patchSelected({ y: (100 - selected.height) / 2 })}>Center vertical</Button>
          </div>
          {physical && <p className="text-xs text-muted-foreground"><RotateCw className="mr-1 inline h-3 w-3" />Artwork size: {physical.width} × {physical.height} inches</p>}
        </div>
      )}
    </section>
  );
}
