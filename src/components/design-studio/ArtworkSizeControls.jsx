import { useEffect, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ARTWORK_OUTPUT_PPI, artworkSizeForUnit, normalizeArtworkUnit, updateArtworkDimension,
} from '@/lib/designStudio';

const displayNumber = (value, unit) => {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return '';
  return unit === 'pixels' ? Math.round(Number(value)) : Number(Number(value).toFixed(2));
};

export default function ArtworkSizeControls({ element, patchElement, printArea, targetPpi = ARTWORK_OUTPUT_PPI, compact = false, customerMode = false }) {
  const unit = normalizeArtworkUnit(element?.sizeUnit);
  const size = artworkSizeForUnit(element, printArea, targetPpi);
  const [widthInput, setWidthInput] = useState(String(displayNumber(size.width, unit)));
  const [heightInput, setHeightInput] = useState(String(displayNumber(size.height, unit)));
  const [editingAxis, setEditingAxis] = useState('');
  const [sizeError, setSizeError] = useState('');

  useEffect(() => {
    if (editingAxis !== 'width') setWidthInput(String(displayNumber(size.width, unit)));
    if (editingAxis !== 'height') setHeightInput(String(displayNumber(size.height, unit)));
  }, [editingAxis, element?.id, size.height, size.width, unit]);

  const changeDimension = (axis, value) => {
    if (axis === 'width') setWidthInput(value); else setHeightInput(value);
    const parsed = Number(value);
    if (value === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setSizeError('Enter a size greater than 0.');
      return;
    }
    setSizeError('');
    patchElement(updateArtworkDimension(element, axis, value, unit, printArea, targetPpi));
  };
  const finishDimension = axis => {
    const value = axis === 'width' ? widthInput : heightInput;
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
      if (axis === 'width') setWidthInput(String(displayNumber(size.width, unit)));
      else setHeightInput(String(displayNumber(size.height, unit)));
    }
    setEditingAxis('');
  };
  const changeUnit = nextUnit => { setEditingAxis(''); setSizeError(''); patchElement({ sizeUnit: normalizeArtworkUnit(nextUnit) }); };
  const suffix = unit === 'pixels' ? 'px @ 300 DPI' : 'in';
  if (!element) return null;

  return <div className="space-y-2">
    <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto]' : 'grid-cols-2'}`}>
      <label className="text-[11px] font-medium">Width ({suffix})
        <Input aria-label={`Artwork width (${suffix})`} type="number" min="0.01" step={unit === 'pixels' ? 1 : 0.01} value={widthInput} onFocus={() => setEditingAxis('width')} onBlur={() => finishDimension('width')} onChange={event => changeDimension('width', event.target.value)} className="mt-1 h-9" />
      </label>
      <label className="text-[11px] font-medium">Height ({suffix})
        <Input aria-label={`Artwork height (${suffix})`} type="number" min="0.01" step={unit === 'pixels' ? 1 : 0.01} value={heightInput} onFocus={() => setEditingAxis('height')} onBlur={() => finishDimension('height')} onChange={event => changeDimension('height', event.target.value)} className="mt-1 h-9" />
      </label>
      <label className="text-[11px] font-medium">Unit
        <select aria-label="Artwork size unit" value={unit} onChange={event => changeUnit(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-card px-2 text-sm">
          <option value="inches">Inches</option>
          <option value="pixels">Pixels</option>
        </select>
      </label>
      <div className="text-[11px] font-medium">Proportions
        <Button type="button" size="sm" variant="outline" aria-pressed={element.aspectRatioLocked !== false} onClick={() => patchElement({ aspectRatioLocked: element.aspectRatioLocked === false })} className="mt-1 h-9 w-full min-w-11 px-2">
          {element.aspectRatioLocked === false ? <Unlock className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}{element.aspectRatioLocked === false ? 'Unlocked' : 'Locked'}
        </Button>
      </div>
    </div>
    <p className="text-[11px] text-muted-foreground">{unit === 'pixels'
      ? `Output pixels use the ${targetPpi}-DPI production reference (${targetPpi} pixels = 1 inch). This does not add detail to the original upload.`
      : 'Dimensions are the intended printed size, independent of browser zoom.'}</p>
    {sizeError && <p role="alert" className="text-[11px] font-semibold text-red-700">{sizeError}</p>}
    {!printArea?.verified && <p className="text-[11px] text-amber-800">{customerMode ? 'You can set the print size now. Final garment fit is checked during review.' : 'Intended artwork size can be saved now. Garment fit remains unverified until this mockup has a calibrated print area.'}</p>}
  </div>;
}
