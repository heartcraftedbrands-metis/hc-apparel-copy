import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, SlidersHorizontal, Star } from 'lucide-react';
import { toast } from "sonner";
import { Link } from 'react-router-dom';
import VendorCard from '@/components/vendors/VendorCard';
import VendorFormDialog from '@/components/vendors/VendorFormDialog';

export const VENDOR_TYPES = [
  { value: 'apparel_blank_supplier', label: 'Apparel Blank Supplier' },
  { value: 'dtf_printer',            label: 'DTF Printer' },
  { value: 'screen_printer',         label: 'Screen Printer' },
  { value: 'embroidery',             label: 'Embroidery Vendor' },
  { value: 'dtg_printer',            label: 'Direct-to-Garment Printer' },
  { value: 'dtf_supplier',           label: 'Direct-to-Film Supplier' },
  { value: 'sublimation',            label: 'Sublimation Vendor' },
  { value: 'packaging',              label: 'Packaging Supplier' },
  { value: 'shipping',               label: 'Shipping Supplier' },
  { value: 'other',                  label: 'Other' },
];

export const EMPTY_VENDOR = {
  name: '', vendor_type: 'other', contact_person: '', email: '', phone: '',
  website: '', address: '', notes: '', is_active: true,
  print_methods_offered: [], garment_types_offered: [],
  minimum_order_quantity: '', turnaround_time: '',
  rush_order_available: false, rush_fee_notes: '',
  shipping_options: '', local_pickup_available: false,
  quality_rating: 0, reliability_rating: 0,
  default_setup_fee: '', default_shipping_estimate: '',
  payment_terms: '', tax_charged: false, pricing_notes: '', shipping_cost_notes: '',
};

export default function AdminVendors() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list('-created_date'),
  });

  const upsert = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Vendor.update(editing.id, data)
      : base44.entities.Vendor.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['vendors']);
      toast.success(editing ? 'Vendor updated' : 'Vendor added');
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const del = useMutation({
    mutationFn: (id) => base44.entities.Vendor.delete(id),
    onSuccess: () => { qc.invalidateQueries(['vendors']); toast.success('Vendor deleted'); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.Vendor.update(id, { is_active }),
    onSuccess: () => { qc.invalidateQueries(['vendors']); toast.success('Vendor status updated'); },
  });

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (v) => { setEditing(v); setDialogOpen(true); };

  const filtered = vendors.filter(v => {
    if (!showInactive && !v.is_active) return false;
    if (typeFilter !== 'all' && v.vendor_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return v.name?.toLowerCase().includes(q) || v.contact_person?.toLowerCase().includes(q) || v.email?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Vendors</h1>
            <p className="text-primary-foreground/70 text-sm">
              {vendors.filter(v => v.is_active).length} active · {vendors.length} total
            </p>
          </div>
          <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 flex-shrink-0">
            <Plus className="w-4 h-4" /> Add Vendor
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Filters */}
        <div className="bg-white rounded-2xl border shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Types</option>
            {VENDOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            Show Inactive
          </label>
          <span className="text-sm text-muted-foreground ml-auto">{filtered.length} vendor{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-48 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground mb-4">{vendors.length === 0 ? 'No vendors yet' : 'No vendors match your filters'}</p>
            {vendors.length === 0 && <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add First Vendor</Button>}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(v => (
              <VendorCard
                key={v.id}
                vendor={v}
                onEdit={() => openEdit(v)}
                onDelete={() => del.mutate(v.id)}
                onToggleActive={() => toggleActive.mutate({ id: v.id, is_active: !v.is_active })}
              />
            ))}
          </div>
        )}
      </div>

      <VendorFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        onSubmit={(data) => upsert.mutate(data)}
        isPending={upsert.isPending}
      />
    </div>
  );
}