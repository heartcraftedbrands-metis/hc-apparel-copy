import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck2, FileUp, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { base44 } from '@/api/base44Client';
import { useCart } from '@/components/shop/CartContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ARTWORK_ACCEPT,
  BULK_QUOTE_MESSAGE,
  DECORATION_METHODS,
  PRINT_PLACEMENTS,
  PRINT_SIZE_OPTIONS,
  buildCustomizedCartItem,
  findCustomizationVariant,
  getCustomizationColors,
  getCustomizationSizes,
  getSmallOrderCartQuantity,
  isAcceptedArtworkFile,
  validateCustomization,
} from '@/lib/productCustomization';
import { getProductPriceRange } from '@/lib/shopGarmentFilters';

const emptyCustomization = {
  selectedColor: '',
  selectedSize: '',
  quantity: 1,
  customization_requested: true,
  artwork_file_url: '',
  artwork_file_name: '',
  decoration_method: '',
  print_placement: '',
  print_size_option: '',
  print_notes: '',
};

export default function ProductCustomizationDialog({
  product,
  trigger,
  initialColor = '',
  initialSize = '',
  initialQuantity = 1,
  blankFirst = false,
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCustomization);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [signInRequired, setSignInRequired] = useState(false);
  const { cart, addToCart } = useCart();

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyCustomization,
      selectedColor: initialColor || '',
      selectedSize: initialSize || '',
      quantity: Math.max(1, Number(initialQuantity) || 1),
      customization_requested: !blankFirst,
    });
    setErrors([]);
    setSignInRequired(false);
  }, [blankFirst, initialColor, initialQuantity, initialSize, open, product?.id]);

  const colors = useMemo(() => getCustomizationColors(product), [product]);
  const sizes = useMemo(
    () => getCustomizationSizes(product, form.selectedColor),
    [form.selectedColor, product],
  );
  const variant = useMemo(
    () => findCustomizationVariant(product, form.selectedColor, form.selectedSize),
    [form.selectedColor, form.selectedSize, product],
  );
  const priceRange = useMemo(() => getProductPriceRange(product), [product]);
  const displayedPrice = variant?.price ?? priceRange.minimum;
  const existingCartQuantity = getSmallOrderCartQuantity(cart);
  const bulkQuoteRequired = (
    Number(form.quantity) >= 50
    || existingCartQuantity + (Number(form.quantity) || 0) >= 50
  );

  const setField = (key) => (event) => {
    const value = event?.target?.value ?? event;
    setForm(current => ({ ...current, [key]: value }));
    setErrors([]);
  };

  const uploadArtwork = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrors([]);
    setSignInRequired(false);

    if (!isAcceptedArtworkFile(file)) {
      setErrors(['Use a PNG, JPG, JPEG, PDF, SVG, AI, EPS, or PSD artwork file.']);
      event.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({
        file,
        bucket: 'customer-files',
      });
      setForm(current => ({
        ...current,
        artwork_file_url: file_url,
        artwork_file_name: file.name,
      }));
    } catch (error) {
      if (error?.status === 401) {
        setSignInRequired(true);
        setErrors(['Please sign in before uploading artwork securely.']);
      } else {
        setErrors(['Artwork upload failed. Please try again.']);
      }
      event.target.value = '';
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const validationErrors = validateCustomization(form, {
      existingCartQuantity,
      inventory: variant?.inventory ?? product?.stock,
    });
    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }

    const cartItem = buildCustomizedCartItem(product, form);
    addToCart(cartItem);
    toast.success(
      form.customization_requested
        ? `${product.name} customized and added to cart.`
        : `${product.name} blank added to cart.`,
    );
    setOpen(false);
    window.dispatchEvent(new CustomEvent('hc:open-cart'));
  };

  const quoteUrl = `/RequestQuote?quantity=${Math.max(50, Number(form.quantity) || 50)}&garment_type=${encodeURIComponent(product?.name || '')}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-hidden p-0">
        <div
          data-product-modal-scroll-region
          className="max-h-[90vh] max-h-[90dvh] touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-6 [-webkit-overflow-scrolling:touch]"
        >
        <DialogHeader className="pr-8">
          <DialogTitle>{blankFirst ? 'Add Blank to Cart' : 'Customize & Add to Cart'}</DialogTitle>
          <DialogDescription>
            {blankFirst
              ? 'Choose your blank garment options. Custom printing is optional.'
              : 'Choose the garment options and attach the artwork HC Apparel should print.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected product</p>
            <p className="font-semibold">{product?.name}</p>
            {variant?.sku && <p className="text-xs text-muted-foreground">SKU: {variant.sku}</p>}
            <p className="mt-1 text-sm font-semibold text-primary">
              {variant
                ? `Selected price: $${displayedPrice.toFixed(2)}`
                : `${priceRange.hasVariablePricing ? 'Starting at ' : ''}$${displayedPrice.toFixed(2)}`}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor={`custom-color-${product?.id}`}>Color *</Label>
              <select
                id={`custom-color-${product?.id}`}
                value={form.selectedColor}
                onChange={(event) => {
                  setForm(current => ({
                    ...current,
                    selectedColor: event.target.value,
                    selectedSize: '',
                  }));
                  setErrors([]);
                }}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select color</option>
                {colors.map(color => <option key={color} value={color}>{color}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor={`custom-size-${product?.id}`}>Size *</Label>
              <select
                id={`custom-size-${product?.id}`}
                value={form.selectedSize}
                onChange={setField('selectedSize')}
                disabled={!form.selectedColor}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">Select size</option>
                {sizes.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor={`custom-quantity-${product?.id}`}>Quantity *</Label>
              <Input
                id={`custom-quantity-${product?.id}`}
                type="number"
                min="1"
                step="1"
                value={form.quantity}
                onChange={setField('quantity')}
                className="mt-1"
              />
            </div>
          </div>

          {bulkQuoteRequired && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">{BULK_QUOTE_MESSAGE}</p>
              <p className="mt-1">The combined garment quantity in this cart must remain between 1 and 49.</p>
              <Link to={quoteUrl} onClick={() => setOpen(false)}>
                <Button type="button" variant="outline" className="mt-3 border-amber-400">
                  Bulk Quote 50+
                </Button>
              </Link>
            </div>
          )}

          {blankFirst && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-4">
              <input
                type="checkbox"
                checked={form.customization_requested}
                onChange={(event) => {
                  setForm(current => ({
                    ...current,
                    customization_requested: event.target.checked,
                  }));
                  setErrors([]);
                }}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-semibold">Add custom printing</span>
                <span className="block text-xs text-muted-foreground">
                  Need printing? Custom printing is available before checkout.
                </span>
              </span>
            </label>
          )}

          {form.customization_requested && (
            <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`custom-method-${product?.id}`}>Decoration method *</Label>
              <select
                id={`custom-method-${product?.id}`}
                value={form.decoration_method}
                onChange={setField('decoration_method')}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select method</option>
                {DECORATION_METHODS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`custom-placement-${product?.id}`}>Print placement *</Label>
              <select
                id={`custom-placement-${product?.id}`}
                value={form.print_placement}
                onChange={setField('print_placement')}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select placement</option>
                {PRINT_PLACEMENTS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor={`custom-print-size-${product?.id}`}>Print size *</Label>
              <select
                id={`custom-print-size-${product?.id}`}
                value={form.print_size_option}
                onChange={setField('print_size_option')}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select print size</option>
                {PRINT_SIZE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor={`custom-artwork-${product?.id}`}>Artwork upload *</Label>
            <Input
              id={`custom-artwork-${product?.id}`}
              type="file"
              accept={ARTWORK_ACCEPT}
              onChange={uploadArtwork}
              disabled={uploading}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Upload your print-ready artwork. PNG with transparent background is preferred.
            </p>
            {uploading && <p className="mt-2 text-sm text-muted-foreground">Uploading securely...</p>}
            {form.artwork_file_url && (
              <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                <FileCheck2 className="h-4 w-4" />
                {form.artwork_file_name} attached securely
              </p>
            )}
          </div>
            </>
          )}

          <div>
            <Label htmlFor={`custom-notes-${product?.id}`}>Customer print notes</Label>
            <Textarea
              id={`custom-notes-${product?.id}`}
              rows={3}
              value={form.print_notes}
              onChange={setField('print_notes')}
              placeholder="Print colors, exact positioning, custom sizing, or other production notes..."
              className="mt-1"
            />
          </div>

          {errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <ul className="list-disc space-y-1 pl-5">
                {errors.map(error => <li key={error}>{error}</li>)}
              </ul>
              {signInRequired && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => base44.auth.redirectToLogin(window.location.href)}
                >
                  Sign in to upload artwork
                </Button>
              )}
            </div>
          )}

          <Button
            type="button"
            className="w-full gap-2"
            size="lg"
            onClick={submit}
            disabled={uploading || bulkQuoteRequired}
          >
            {uploading ? <FileUp className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
            {form.customization_requested ? 'Add Customized Item to Cart' : 'Add Blank to Cart'}
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
