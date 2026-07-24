import React, { useState, useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Package, AlertCircle, Printer, Eye } from "lucide-react";
import { Link } from "react-router-dom";


export default function OrderConfirmation() {
  const [orderId, setOrderId] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Get orderId and sessionId from URL and persist it
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('orderId');
    const sessionId = urlParams.get('session_id');
    
    if (id) setOrderId(id);

    // Verify Stripe payment if session_id is present
    if (sessionId && id) {
      setVerifying(true);
      base44.functions.invoke('verifyStripePayment', { sessionId })
        .then(result => {
          if (result.data?.paid) {
            console.log('Payment verified:', result.data);
          }
        })
        .catch(err => console.error('Payment verification error:', err))
        .finally(() => setVerifying(false));
    }
  }, []);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const orders = await base44.entities.Order.filter({ id: orderId });
      return orders[0];
    },
    enabled: !!orderId,
    staleTime: Infinity,
    retry: 1
  });

  const { data: paymentSettings } = useQuery({
    queryKey: ['payment-settings'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPublicPaymentSettings', {});
      return response.data;
    }
  });
  const settings = paymentSettings || { payment_mode: 'manual' };

  if (isLoading || verifying) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="animate-pulse">
          {verifying ? 'Verifying payment...' : 'Loading order details...'}
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Order not found</p>
        <Link to="/ShopGarments">
          <Button className="mt-4">Back to Shop</Button>
        </Link>
      </div>
    );
  }

  const digitalItems = order?.order_items?.filter(item => item.product_type === 'digital') || [];
  const physicalItems = order?.order_items?.filter(item => item.product_type === 'physical') || [];
  
  // Check if this is a test/manual order
  const isTestOrder = order?.notes?.includes('Payment Method:') && !order?.notes?.includes('Stripe');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="container mx-auto px-4 py-8 pb-24">
    <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2">Order Confirmed!</h1>
          <p className="text-gray-600">Thank you for your purchase</p>
        </div>

        {/* Payment Status Message */}
        {order?.payment_status === 'demo' && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700">
                  <strong>Demo Order:</strong> This is a demo order. Payment has not been collected.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {order?.payment_status === 'paid' && (
          <Card className="mb-6 bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-700">
                  <p className="font-semibold mb-1">Payment Received</p>
                  <p>Your payment has been successfully processed. Your order is now being prepared for fulfillment.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {order?.payment_status === 'awaiting_payment' && (
           <Card className="mb-6 bg-amber-50 border-amber-200">
             <CardContent className="pt-6">
               <div className="flex gap-3">
                 <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                 <div className="text-sm text-amber-700">
                   <p className="font-semibold mb-1">Your order is awaiting payment.</p>
                   <p>Please return to checkout to complete your Stripe or PayPal payment.</p>
                 </div>
               </div>
             </CardContent>
           </Card>
         )}

        {order?.payment_status === 'pay_later' && (
          <Card className="mb-6 bg-cyan-50 border-cyan-200">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-cyan-700">
                  <p className="font-semibold mb-1">Payment Due Later</p>
                  <p>Your order is confirmed. You can pay at a later time. We'll send you payment details soon.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {settings.payment_notes_customer && (
          <Card className="mb-6 bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <p className="text-sm text-green-700">{settings.payment_notes_customer}</p>
            </CardContent>
          </Card>
        )}

        {/* Order Summary Card */}
        <Card id="order-summary-card" className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Order Confirmation</CardTitle>
                <p className="text-sm text-gray-500 mt-2">Order #{order?.id?.slice(-8) || 'Loading...'}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Customer Info */}
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2">Customer Information</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Name</p>
                  <p className="font-medium">{order?.customer_name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Email</p>
                  <p className="font-medium">{order?.customer_email}</p>
                </div>
                {order?.customer_phone && (
                  <div>
                    <p className="text-gray-500">Phone</p>
                    <p className="font-medium">{order?.customer_phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500">Order Date</p>
                  <p className="font-medium">{order?.created_date ? new Date(order.created_date).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Status Info */}
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2">Order Status</h3>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Payment Status</p>
                  <p className="font-medium capitalize">{order?.payment_status?.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Order Status</p>
                  <p className="font-medium capitalize">{order?.status?.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Fulfillment Status</p>
                  <p className="font-medium capitalize">{order?.fulfillment_status?.replace(/_/g, ' ')}</p>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            {order?.has_physical_items && order?.shipping_address && (
              <div>
                <h3 className="font-semibold text-sm text-gray-700 mb-2">Shipping Address</h3>
                <p className="text-sm">
                  {order?.shipping_address?.street}<br />
                  {order?.shipping_address?.city}, {order?.shipping_address?.state} {order?.shipping_address?.zip}<br />
                  {order?.shipping_address?.country || 'USA'}
                </p>
              </div>
            )}

            {/* Order Items */}
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-3">Order Items</h3>
              <div className="space-y-3">
                {order?.order_items?.map((item, idx) => (
                  <div key={idx} className="border-b pb-3 last:border-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex-1">
                        <p className="font-medium">{item.product_name}</p>
                        {item.color && <p className="text-xs text-gray-500">Color: {item.color}</p>}
                        {item.size && <p className="text-xs text-gray-500">Size: {item.size}</p>}
                        <p className="text-xs text-gray-500 mt-1">Qty: {item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                        <p className="text-xs text-gray-500">${item.price.toFixed(2)} each</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Total */}
            <div className="border-t pt-4 bg-gray-50 p-4 rounded">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Order Total</span>
                <span>${order?.total_amount?.toFixed(2)}</span>
              </div>
            </div>

            {/* Notes */}
            {order?.notes && !isTestOrder && (
              <div>
                <h3 className="font-semibold text-sm text-gray-700 mb-2">Notes</h3>
                <p className="text-sm text-gray-600">{order?.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Digital Downloads */}
        {digitalItems.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Digital Products
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {digitalItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium text-sm">{item.product_name}</span>
                  {item.file_url ? (
                    <a href={item.file_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </a>
                  ) : (
                    <span className="text-xs text-gray-500">Download link will be sent via email</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Physical Items Notice */}
        {physicalItems.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Physical Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Your physical items will be prepared and shipped soon. You'll receive a shipping confirmation email with tracking information.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center relative z-10">
          <Button onClick={handlePrint} variant="outline" className="flex-1 sm:flex-none">
            <Printer className="w-4 h-4 mr-2" />
            Print Confirmation
          </Button>
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => document.getElementById('order-summary-card')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <Eye className="w-4 h-4 mr-2" />
            View Order Summary
          </Button>
          <Link to="/ShopGarments" className="flex-1 sm:flex-none">
            <Button className="w-full">
              Continue Shopping
            </Button>
          </Link>
        </div>

        {/* Confirmation Message */}
        <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
          <p className="text-sm text-green-700">
            A confirmation email has been sent to <strong>{order?.customer_email}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}