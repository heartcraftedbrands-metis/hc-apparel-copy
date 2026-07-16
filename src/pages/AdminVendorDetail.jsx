import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, Mail, Phone, Globe, MapPin, Star, Package, Truck, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from "sonner";
import VendorFormDialog from '@/components/vendors/VendorFormDialog';

function StarRating({ value, label }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(n => (
          <Star key={n} className={`w-4 h-4 ${n <= value ? 'fill-accent text-accent' : 'text-muted-foreground/20'}`} />
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-muted last:border-0">
      <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

export default function AdminVendorDetail() {
  const location = useLocation();
  const vendorId = new URLSearchParams(location.search).get('id');
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendor', vendorId],
    queryFn: async () => {
      const results = await base44.entities.Vendor.filter({ id: vendorId });
      return results[0];
    },
    enabled: !!vendorId,
  });

  const { data: pricing = [] } = useQuery({
    queryKey: ['vendor-pricing', vendorId],
    queryFn: () => base44.entities.VendorPricing.filter({ vendor_id: vendorId }),
    enabled: !!vendorId,
  });

  const { data: vendorOrders = [] } = useQuery({
    queryKey: ['vendor-orders', vendorId],
    queryFn: () => base44.entities.VendorOrder.filter({ vendor_id: vendorId }),
    enabled: !!vendorId,
  });

  const update = useMutation({
    mutationFn: (data) => base44.entities.Vendor.update(vendorId, data),
    onSuccess: () => { qc.invalidateQueries(['vendor', vendorId]); qc.invalidateQueries(['vendors']); toast.success('Vendor updated'); setEditOpen(false); },
  });

  if (isLoading) return <div className="min-h-screen bg-muted/30 flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!vendor) return <div className="text-center py-20"><p className="text-muted-foreground">Vendor not found</p><Link to="/AdminVendors"><Button className="mt-4">Back to Vendors</Button></Link></div>;

  const totalCost = vendorOrders.reduce((s, o) => s + (Number(o.blank_garment_cost)||0) + (Number(o.print_cost)||0) + (Number(o.shipping_cost)||0) + (Number(o.other_fees)||0), 0);
  const totalProfit = vendorOrders.reduce((s, o) => s + (Number(o.estimated_profit)||0), 0);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto">
          <Link to="/AdminVendors" className="inline-flex items-center gap-1.5 text-primary-foreground/70 hover:text-primary-foreground text-sm mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Vendors
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{vendor.name}</h1>
                <Badge className={vendor.is_active ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}>
                  {vendor.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {vendor.contact_person && <p className="text-primary-foreground/70 mt-1">{vendor.contact_person}</p>}
            </div>
            <Button onClick={() => setEditOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 flex-shrink-0">
              <Pencil className="w-4 h-4" /> Edit Vendor
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-1 space-y-5">
            {/* Contact Info */}
            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <h2 className="font-bold mb-4">Contact Information</h2>
              <div className="space-y-3 text-sm">
                {vendor.email && <a href={`mailto:${vendor.email}`} className="flex items-center gap-3 text-primary hover:underline"><Mail className="w-4 h-4" />{vendor.email}</a>}
                {vendor.phone && <a href={`tel:${vendor.phone}`} className="flex items-center gap-3 hover:text-primary"><Phone className="w-4 h-4" />{vendor.phone}</a>}
                {vendor.website && <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-primary hover:underline"><Globe className="w-4 h-4" />{vendor.website}</a>}
                {vendor.address && <div className="flex items-start gap-3 text-muted-foreground"><MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />{vendor.address}</div>}
              </div>
            </div>

            {/* Ratings */}
            {(vendor.quality_rating > 0 || vendor.reliability_rating > 0) && (
              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <h2 className="font-bold mb-4">Ratings</h2>
                <div className="space-y-4">
                  {vendor.quality_rating > 0 && <StarRating value={vendor.quality_rating} label="Quality" />}
                  {vendor.reliability_rating > 0 && <StarRating value={vendor.reliability_rating} label="Reliability" />}
                </div>
              </div>
            )}

            {/* Quick facts */}
            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <h2 className="font-bold mb-4">Production Details</h2>
              <InfoRow label="Turnaround" value={vendor.turnaround_time} />
              <InfoRow label="Min. Order Qty" value={vendor.minimum_order_quantity > 0 ? vendor.minimum_order_quantity : null} />
              <InfoRow label="Rush Orders" value={vendor.rush_order_available ? '✓ Available' : null} />
              {vendor.rush_order_available && <InfoRow label="Rush Fee" value={vendor.rush_fee_notes} />}
              <InfoRow label="Local Pickup" value={vendor.local_pickup_available ? '✓ Available' : null} />
              <InfoRow label="Shipping" value={vendor.shipping_options} />
              <InfoRow label="Payment" value={vendor.payment_terms} />
              <InfoRow label="Setup Fee" value={vendor.default_setup_fee > 0 ? `$${Number(vendor.default_setup_fee).toFixed(2)}` : null} />
              <InfoRow label="Tax Charged" value={vendor.tax_charged ? 'Yes' : null} />
            </div>

            {/* Capabilities */}
            {(vendor.print_methods_offered?.length > 0 || vendor.garment_types_offered?.length > 0) && (
              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <h2 className="font-bold mb-4">Capabilities</h2>
                {vendor.print_methods_offered?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground font-medium mb-2">Print Methods</p>
                    <div className="flex flex-wrap gap-1.5">
                      {vendor.print_methods_offered.map((m, i) => <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{m}</span>)}
                    </div>
                  </div>
                )}
                {vendor.garment_types_offered?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-2">Garment Types</p>
                    <div className="flex flex-wrap gap-1.5">
                      {vendor.garment_types_offered.map((g, i) => <span key={i} className="text-xs bg-muted text-foreground px-2 py-0.5 rounded-full">{g}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Order stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Orders', value: vendorOrders.length, icon: Package },
                { label: 'Total Cost', value: `$${totalCost.toFixed(2)}`, icon: Truck },
                { label: 'Est. Profit', value: `$${totalProfit.toFixed(2)}`, icon: CheckCircle },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-2xl border shadow-sm p-4 text-center">
                  <s.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                  <div className="font-bold text-lg">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Pricing records */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h2 className="font-bold">Pricing Records</h2>
                <Link to={`/AdminVendorPricing?vendor_id=${vendor.id}`}>
                  <Button size="sm" variant="outline">+ Add Pricing</Button>
                </Link>
              </div>
              {pricing.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">No pricing records yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b">
                      <tr>{['Product','Brand/Style','Method','Blank','Print','Total'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y">
                      {pricing.map(row => {
                        const total = (Number(row.blank_garment_cost)||0) + (Number(row.print_cost)||0) + (Number(row.setup_fee)||0) + (Number(row.shipping_cost)||0);
                        return (
                          <tr key={row.id} className="hover:bg-muted/10">
                            <td className="px-4 py-2.5 font-medium">{row.product_name || row.product_type || '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{[row.garment_brand, row.garment_style_number].filter(Boolean).join(' ')}</td>
                            <td className="px-4 py-2.5 capitalize">{row.print_method?.replace(/_/g,' ')}</td>
                            <td className="px-4 py-2.5">${Number(row.blank_garment_cost||0).toFixed(2)}</td>
                            <td className="px-4 py-2.5">${Number(row.print_cost||0).toFixed(2)}</td>
                            <td className="px-4 py-2.5 font-bold text-primary">${total.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Fulfillment orders */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h2 className="font-bold">Fulfillment Orders</h2>
                <Link to="/AdminVendorOrders">
                  <Button size="sm" variant="outline">View All</Button>
                </Link>
              </div>
              {vendorOrders.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">No fulfillment orders yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b">
                      <tr>{['Status','Customer Order','Paid','Cost','Profit'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground uppercase">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y">
                      {vendorOrders.slice(0, 8).map(o => {
                        const cost = (Number(o.blank_garment_cost)||0)+(Number(o.print_cost)||0)+(Number(o.shipping_cost)||0)+(Number(o.other_fees)||0);
                        return (
                          <tr key={o.id} className="hover:bg-muted/10">
                            <td className="px-4 py-2.5 capitalize"><Badge className="text-xs bg-blue-100 text-blue-800">{o.status?.replace(/_/g,' ')}</Badge></td>
                            <td className="px-4 py-2.5 text-muted-foreground text-xs">{o.customer_order_id ? `#${o.customer_order_id.slice(-8)}` : '—'}</td>
                            <td className="px-4 py-2.5">${Number(o.customer_paid_total||0).toFixed(2)}</td>
                            <td className="px-4 py-2.5">${cost.toFixed(2)}</td>
                            <td className="px-4 py-2.5 font-semibold text-primary">${Number(o.estimated_profit||0).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Notes */}
            {(vendor.notes || vendor.pricing_notes) && (
              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <h2 className="font-bold mb-3">Notes</h2>
                {vendor.notes && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">General Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{vendor.notes}</p>
                  </div>
                )}
                {vendor.pricing_notes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Pricing Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{vendor.pricing_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <VendorFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={vendor}
        onSubmit={(data) => update.mutate(data)}
        isPending={update.isPending}
      />
    </div>
  );
}