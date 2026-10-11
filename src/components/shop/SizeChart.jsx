import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ruler } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const FRACTIONS = {
  '¼': '1/4', '½': '1/2', '¾': '3/4', '⅛': '1/8',
  '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

const compactNumber = (value) => Number(value.toFixed(1)).toString();

function parseNumericToken(token) {
  const parts = token.trim().split(/\s+/);
  let total = 0;
  for (const part of parts) {
    if (part.includes('/')) {
      const [numerator, denominator] = part.split('/').map(Number);
      if (!denominator) return null;
      total += numerator / denominator;
    } else {
      const numeric = Number(part);
      if (!Number.isFinite(numeric)) return null;
      total += numeric;
    }
  }
  return total;
}

export function convertMeasurementValue(value, fromUnit, toUnit) {
  if (value == null || fromUnit === toUnit || !['in', 'cm'].includes(fromUnit) || !['in', 'cm'].includes(toUnit)) {
    return String(value ?? '—');
  }
  let text = String(value);
  for (const [fraction, replacement] of Object.entries(FRACTIONS)) {
    text = text.replaceAll(fraction, ` ${replacement}`);
  }
  const factor = fromUnit === 'in' ? 2.54 : (1 / 2.54);
  text = text.replace(/\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?/g, (token) => {
    const numeric = parseNumericToken(token);
    return numeric == null ? token : compactNumber(numeric * factor);
  });
  return text
    .replace(/\binches\b|\bin\.?\b|"/gi, toUnit === 'cm' ? 'cm' : 'in')
    .replace(/\bcentimeters\b|\bcm\b/gi, toUnit === 'in' ? 'in' : 'cm')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalizedSize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');

function guideTypeLabel(type) {
  if (type === 'body') return 'Body measurements';
  if (type === 'fit_range') return 'Official fit range';
  if (type === 'garment') return 'Finished-garment measurements';
  return 'Product measurements';
}

export default function SizeChart({ productId, productTitle, selectedSize }) {
  const [open, setOpen] = useState(false);
  const [displayUnit, setDisplayUnit] = useState('in');
  const { data: guide, isLoading } = useQuery({
    queryKey: ['product-size-guide', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('storefront_product_size_guides')
        .select('*')
        .eq('product_id', productId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(productId),
    staleTime: 15 * 60 * 1000,
  });

  const sourceUnit = guide?.default_unit || 'in';
  const canConvert = ['in', 'cm'].includes(sourceUnit);
  const activeUnit = canConvert ? displayUnit : sourceUnit;
  const sizes = Array.isArray(guide?.sizes)
    ? guide.sizes.map((size, index) => (
      typeof size === 'string' ? { label: size, order: index } : size
    ))
    : [];
  const measurements = Array.isArray(guide?.measurements) ? guide.measurements : [];
  const instructions = Array.isArray(guide?.measuring_instructions) ? guide.measuring_instructions : [];
  const available = guide?.status === 'verified' && sizes.length > 0 && measurements.length > 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) setDisplayUnit(sourceUnit === 'cm' ? 'cm' : 'in');
    }}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          className="h-auto gap-1.5 p-0 text-sm font-semibold text-primary underline-offset-4"
          aria-label={`Open size guide for ${productTitle}`}
        >
          <Ruler className="h-4 w-4" aria-hidden="true" />
          Size Guide
        </Button>
      </DialogTrigger>
      <DialogContent
        className="!bottom-0 !left-0 !top-auto max-h-[88dvh] w-full !translate-x-0 !translate-y-0 overflow-y-auto rounded-t-3xl border-b-0 p-0 sm:!bottom-auto sm:!left-1/2 sm:!top-1/2 sm:max-h-[86vh] sm:max-w-4xl sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:rounded-2xl sm:border-b"
      >
        <DialogHeader className="border-b bg-[#f8f3e7] px-5 pb-4 pt-6 pr-14 text-left sm:px-7">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#7c6a28]">
            <Ruler className="h-4 w-4" aria-hidden="true" /> HC Apparel Size Guide
          </div>
          <DialogTitle className="font-serif text-xl leading-tight text-[#213417] sm:text-2xl">
            {productTitle}
          </DialogTitle>
          <DialogDescription>
            {available ? guideTypeLabel(guide.measurement_type) : 'Product-specific sizing information'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          {isLoading ? (
            <div className="rounded-xl border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground" role="status">
              Loading size measurements…
            </div>
          ) : !available ? (
            <div className="rounded-xl border border-[#d8ceb0] bg-[#fbf8ef] px-4 py-7 text-center">
              <p className="font-semibold text-[#213417]">Size measurements unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We do not have verified product-specific measurements for this item yet.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {guide.customer_note || guideTypeLabel(guide.measurement_type)}
                </p>
                {canConvert && (
                  <div className="inline-flex rounded-lg border bg-white p-1" role="group" aria-label="Measurement units">
                    {['in', 'cm'].map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => setDisplayUnit(unit)}
                        aria-pressed={activeUnit === unit}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                          activeUnit === unit ? 'bg-[#526b2d] text-white' : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        {unit === 'in' ? 'Inches' : 'Centimeters'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="max-w-full overflow-x-auto rounded-xl border" tabIndex={0} aria-label="Scrollable size measurements table">
                <table className="min-w-max w-full border-collapse text-sm">
                  <caption className="sr-only">
                    {productTitle} {guideTypeLabel(guide.measurement_type).toLowerCase()} in {activeUnit === 'cm' ? 'centimeters' : 'inches'}
                  </caption>
                  <thead>
                    <tr className="bg-[#213417] text-white">
                      <th scope="col" className="sticky left-0 z-10 min-w-40 bg-[#213417] px-4 py-3 text-left font-semibold">
                        Measurement
                      </th>
                      {sizes.map((size) => {
                        const selected = normalizedSize(size.label) === normalizedSize(selectedSize);
                        return (
                          <th
                            key={size.label}
                            scope="col"
                            className={`min-w-20 px-4 py-3 text-center font-bold ${selected ? 'bg-[#b58b18] text-white' : ''}`}
                            aria-current={selected ? 'true' : undefined}
                          >
                            {size.label}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.map((row, rowIndex) => (
                      <tr key={`${row.label}-${rowIndex}`} className={rowIndex % 2 ? 'bg-[#fbf8ef]' : 'bg-white'}>
                        <th scope="row" className={`sticky left-0 z-10 border-t px-4 py-3 text-left font-semibold ${rowIndex % 2 ? 'bg-[#fbf8ef]' : 'bg-white'}`}>
                          {row.label}
                        </th>
                        {sizes.map((size) => {
                          const selected = normalizedSize(size.label) === normalizedSize(selectedSize);
                          const rawValue = row.values?.[size.label] ?? '—';
                          return (
                            <td
                              key={size.label}
                              className={`border-t px-4 py-3 text-center tabular-nums ${selected ? 'bg-[#f2e5b7] font-bold text-[#213417]' : ''}`}
                            >
                              {convertMeasurementValue(rawValue, sourceUnit, activeUnit)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {guide.fit_notes && (
                <div className="rounded-xl bg-[#f8f3e7] p-4 text-sm">
                  <p className="font-semibold text-[#213417]">Fit notes</p>
                  <p className="mt-1 text-muted-foreground">{guide.fit_notes}</p>
                </div>
              )}
              {instructions.length > 0 && (
                <div className="text-sm">
                  <p className="font-semibold text-[#213417]">How to measure</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {instructions.map((instruction, index) => <li key={index}>{instruction}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
