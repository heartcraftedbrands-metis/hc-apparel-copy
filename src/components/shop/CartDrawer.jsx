import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Minus, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function CartDrawer({ isOpen, onClose, cart, onUpdateQuantity, onRemoveItem }) {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const getItemKey = (item) => `${item.id}|${item.selectedSize || ''}|${item.selectedColor || ''}`;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Shopping Cart ({cart.length} items)</SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => {
                const itemKey = getItemKey(item);
                const lineTotal = item.price * item.quantity;
                return (
                  <div key={itemKey} className="flex gap-3 border-b pb-4">
                    <div className="w-16 h-16 bg-gray-100 rounded flex-shrink-0 overflow-hidden border">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-contain p-1 bg-white" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm mb-1 leading-snug">
                        {(() => {
                          const parts = (item.name || '').split(' — ');
                          if (parts.length === 2 && parts[1].includes(parts[0].split(' - ')[0])) return parts[1];
                          return item.name;
                        })()}
                      </h4>
                      {item.selectedColor && <p className="text-xs text-gray-600">Color: {item.selectedColor}</p>}
                      {item.selectedSize && <p className="text-xs text-gray-600">Size: {item.selectedSize}</p>}
                      {item.sku && <p className="text-xs text-gray-400">SKU: {item.sku}</p>}
                      <p className="text-xs text-gray-500 mt-1">${item.price?.toFixed(2)} × {item.quantity} = ${lineTotal.toFixed(2)}</p>
                      <div className="flex items-center gap-1 mt-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => onUpdateQuantity(itemKey, item.quantity - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => onUpdateQuantity(itemKey, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 ml-auto text-red-500 hover:text-red-600"
                          onClick={() => onRemoveItem(itemKey)}
                        >
                          <Trash2 className="w-3 h-3" />
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
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total:</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <Link to={createPageUrl('Checkout')} className="block" onClick={onClose}>
                <Button className="w-full" size="lg">
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