import { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Check, Italic, Palette, Type } from 'lucide-react';
import '@fontsource/inter/400.css';
import '@fontsource/inter/400-italic.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/700-italic.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/400-italic.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/700-italic.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import '@fontsource/lora/700.css';
import '@fontsource/lora/700-italic.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { STUDIO_FONT_OPTIONS, TEXT_COLOR_SWATCHES, normalizeHexColor, normalizeTextElement } from '@/lib/designStudio';

function NumberField({ label, value, min, max, step, onChange }) {
  return <label className="block text-xs font-semibold text-primary">{label}<Input aria-label={label} type="number" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className="mt-1 h-10 bg-card" /></label>;
}

export default function TextEditorPanel({ element, onChange, onDone, showTitle = true }) {
  const text = normalizeTextElement(element || {});
  const [hex, setHex] = useState(text.fill || '#4E602E');
  useEffect(() => setHex(text.fill || '#4E602E'), [text.fill]);
  if (!element || element.type !== 'text') return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Select an editable text layer to change its wording and color.</p>;
  const commitHex = value => {
    const normalized = normalizeHexColor(value);
    if (normalized) onChange({ fill: normalized });
  };
  return <section className="space-y-4" aria-labelledby={showTitle ? 'edit-text-heading' : undefined}>
    {showTitle && <div><h3 id="edit-text-heading" className="flex items-center gap-2 font-black text-primary"><Type className="h-5 w-5" />Edit Text</h3><p className="mt-1 text-xs text-muted-foreground">Changes appear on the garment immediately.</p></div>}
    <label className="block text-sm font-semibold text-primary">Text content<textarea aria-label="Text content" rows={3} value={text.text ?? ''} onChange={event => onChange({ text: event.target.value })} className="mt-1 min-h-24 w-full resize-y rounded-md border bg-card px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Enter your text" /></label>
    <fieldset><legend className="text-sm font-semibold text-primary">Font</legend><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">{STUDIO_FONT_OPTIONS.map(font => <button key={font.id} type="button" onClick={() => onChange({ fontId: font.id, fontFamily: font.family })} aria-pressed={text.fontId === font.id} className={`rounded-xl border px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${text.fontId === font.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'bg-card hover:border-primary/50'}`} style={{ fontFamily: font.family }}><span className="block text-lg font-bold">Aa</span><span className="block text-xs">{font.label}</span></button>)}</div><p className="mt-1 text-[11px] text-muted-foreground">Commercial-use fonts are included under the SIL Open Font License.</p></fieldset>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><NumberField label="Font size (pt)" min={6} max={300} step={1} value={text.fontSize} onChange={value => onChange({ fontSize: value })} /><NumberField label="Letter spacing (em)" min={-.1} max={1} step={.01} value={text.letterSpacing} onChange={value => onChange({ letterSpacing: value })} /><NumberField label="Line spacing" min={.8} max={3} step={.05} value={text.lineSpacing} onChange={value => onChange({ lineSpacing: value })} /></div>
    <fieldset><legend className="flex items-center gap-2 text-sm font-semibold text-primary"><Palette className="h-4 w-4" />Text color</legend><div className="mt-2 flex flex-wrap gap-2">{TEXT_COLOR_SWATCHES.map(color => <button key={color} type="button" aria-label={`Set text color to ${color}`} aria-pressed={String(text.fill).toUpperCase() === color} onClick={() => onChange({ fill: color })} className={`relative h-10 w-10 rounded-full border-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${String(text.fill).toUpperCase() === color ? 'border-accent ring-2 ring-primary' : 'border-border'}`} style={{ backgroundColor: color }}>{String(text.fill).toUpperCase() === color && <Check className={`absolute inset-0 m-auto h-5 w-5 ${color === '#111111' || color === '#14213D' || color === '#184E9E' ? 'text-white' : 'text-primary'}`} />}</button>)}</div><div className="mt-3 grid grid-cols-[44px_minmax(0,1fr)] gap-2"><input aria-label="Custom text color picker" type="color" value={normalizeHexColor(text.fill) || '#4E602E'} onChange={event => onChange({ fill: event.target.value.toUpperCase() })} className="h-10 w-11 cursor-pointer rounded-md border bg-card p-1" /><Input aria-label="Custom text color HEX" value={hex} onChange={event => { setHex(event.target.value); commitHex(event.target.value); }} onBlur={() => { const normalized = normalizeHexColor(hex); setHex(normalized || text.fill || '#4E602E'); }} placeholder="#4E602E" className="h-10 font-mono uppercase" /></div></fieldset>
    <div className="grid grid-cols-2 gap-3"><fieldset><legend className="text-sm font-semibold text-primary">Alignment</legend><div className="mt-2 flex gap-1">{[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([value, Icon]) => <Button key={value} type="button" size="icon" variant={text.textAlign === value ? 'default' : 'outline'} aria-label={`Align text ${value}`} aria-pressed={text.textAlign === value} onClick={() => onChange({ textAlign: value })}><Icon className="h-4 w-4" /></Button>)}</div></fieldset><fieldset><legend className="text-sm font-semibold text-primary">Style</legend><div className="mt-2 flex gap-1"><Button type="button" size="icon" variant={text.fontWeight === 700 ? 'default' : 'outline'} aria-label="Bold" aria-pressed={text.fontWeight === 700} onClick={() => onChange({ fontWeight: text.fontWeight === 700 ? 400 : 700 })}><Bold className="h-4 w-4" /></Button><Button type="button" size="icon" variant={text.fontStyle === 'italic' ? 'default' : 'outline'} aria-label="Italic" aria-pressed={text.fontStyle === 'italic'} onClick={() => onChange({ fontStyle: text.fontStyle === 'italic' ? 'normal' : 'italic' })}><Italic className="h-4 w-4" /></Button></div></fieldset></div>
    <label className="block text-sm font-semibold text-primary">Curve: {Number(text.curve || 0)}<input aria-label="Text curve" type="range" min="-50" max="50" value={text.curve || 0} onChange={event => onChange({ curve: Number(event.target.value) })} className="mt-2 w-full accent-primary" /></label>
    {onDone && <Button type="button" className="h-12 w-full" onClick={onDone}>Done editing text</Button>}
  </section>;
}
