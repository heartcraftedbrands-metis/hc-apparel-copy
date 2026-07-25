import React from 'react';
import { FileImage, Minus, Package, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  BULK_QUOTE_MESSAGE,
  getCartItemKey,
  getCustomizedCartQuantity,
} from '@/lib/productCustomization';
import { createPageUrl } from '@/utils';

const readableOption = (value) => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

export default function CartDrawer({ isOpen, onClose, cart, onUpdateQuantity, onRemoveItem }) {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const customizedQuantity = getCustomizedCartQuantity(cart);
  const bulkQuoteRequired = customizedQuantity >= 50;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Shopping Cart ({cart.length} items)</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {cart.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <p>Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => {
                const itemKey = getCartItemKey(item);
                const lineTotal = item.price * item.quantity;
                return (
                  <div key={itemKey} className="flex gap-3 border-b pb-4">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded border bg-gray-100">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="h-full w-full bg-white object-contain p-1" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-300">
                          <Package className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="mb-1 text-sm font-medium leading-snug">{item.name}</h4>
                      {item.selectedColor && <p className="text-xs text-gray-600">Color: {item.selectedColor}</p>}
                      {item.selectedSize && <p className="text-xs text-gray-600">Size: {item.selectedSize}</p>}
                      {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}

                      {item.is_customized && (
                        <div className="mt-2 rounded-lg bg-muted/60 p-2 text-xs text-gray-600">
                          <p>Decoration: {readableOption(item.decoration_method)}</p>
                          <p>Placement: {readableOption(item.print_placement)}</p>
                          <p>Print size: {readableOption(item.print_size_option)}</p>
                          {item.artwork_file_name && (
                            <p className="mt-1 flex items-center gap-1 break-all">
                              <FileImage className="h-3 w-3 flex-shrink-0" />
                              Artwork: {item.artwork_file_name}
                            </p>
                          )}
                          {item.print_notes && <p className="mt-1">Notes: {item.print_notes}</p>}
                        </div>
                      )}

                      <p className="mt-1 text-xs text-gray-500">
                        ${item.price?.toFixed(2)} × {item.quantity} = ${lineTotal.toFixed(2)}
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => onUpdateQuantity(itemKey, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => onUpdateQuantity(itemKey, item.quantity + 1)}
                          disabled={item.is_customized && customizedQuantity >= 49}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="ml-auto h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => onRemoveItem(itemKey)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <SheetFooter className="border-t pt-4">
            <div className="w-full space-y-4">
              {bulkQuoteRequired && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">{BULK_QUOTE_MESSAGE}</p>
                  <Link to="/RequestQuote" onClick={onClose}>
                    <Button variant="outline" className="mt-2 w-full border-amber-400">
                      Bulk Quote 50+
                    </Button>
                  </Link>
                </div>
              )}
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total:</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <Link
                to={bulkQuoteRequired ? '#' : createPageUrl('Checkout')}
                className="block"
                onClick={bulkQuoteRequired ? undefined : onClose}
              >
                <Button className="w-full" size="lg" disabled={bulkQuoteRequired}>
                  Proceed to Checkout
                </Button>
              </Link>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
