import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Search, Loader2, MessageSquare } from 'lucide-react';
import { ssVendorOrderStageLabel } from '@/lib/ssVendorOrderWorkflow';

export const STATUSES = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { value: 'reviewing', label: 'Reviewing', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'waiting_on_customer', label: 'Waiting on Customer', color: 'bg-orange-100 text-orange-700' },
  { value: 'quote_sent', label: 'Quote Sent', color: 'bg-purple-100 text-purple-700' },
  { value: 'approved', label: 'Approved', color: 'bg-green-100 text-green-700' },
  { value: 'declined', label: 'Declined', color: 'bg-red-100 text-red-700' },
  { value: 'completed', label: 'Completed', color: 'bg-teal-100 text-teal-700' },
  { value: 'converted_to_order', label: 'Converted to Order', color: 'bg-primary/10 text-primary' },
];
export const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]));

export const PRODUCT_LABELS = {
  t_shirts: 'T-Shirts', hoodies: 'Hoodies', sweatshirts: 'Sweatshirts', tank_tops: 'Tank Tops',
  sportswear: 'Sportswear', youth_apparel: 'Youth Apparel', bulk_order: 'Bulk Order', other: 'Other',
};

export const CONTACT_LABELS = {
  email: 'Email', phone: 'Phone Call', text: 'Text Message',
};

const PRODUCT_TYPES = [
  { value: 't_shirts', label: 'T-Shirts' },
  { value: 'hoodies', label: 'Hoodies' },
  { value: 'sweatshirts', label: 'Sweatshirts' },
  { value: 'tank_tops', label: 'Tank Tops' },
  { value: 'sportswear', label: 'Sportswear' },
  { value: 'youth_apparel', label: 'Youth Apparel' },
  { value: 'bulk_order', label: 'Bulk Order' },
  { value: 'other', label: 'Other' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'date_needed', label: 'Date Needed (Soonest)' },
  { value: 'quantity_desc', label: 'Quantity (High to Low)' },
  { value: 'quantity_asc', label: 'Quantity (Low to High)' },
];

export default function AdminQuoteRequests() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [contactFilter, setContactFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['quote_requests'],
    queryFn: () => base44.entities.QuoteRequest.list('-created_date'),
  });

  const filtered = requests
    .filter(r => {
      const matchSearch = !search || [r.full_name, r.email, r.business_name, r.phone]
        .some(v => v?.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchProduct = productFilter === 'all' || r.product_type === productFilter;
      const matchContact = contactFilter === 'all' || r.preferred_contact === contactFilter;
      return matchSearch && matchStatus && matchProduct && matchContact;
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.created_date) - new Date(b.created_date);
      if (sortBy === 'date_needed') {
        if (!a.date_needed) return 1;
        if (!b.date_needed) return -1;
        return new Date(a.date_needed) - new Date(b.date_needed);
      }
      if (sortBy === 'quantity_desc') return (b.quantity || 0) - (a.quantity || 0);
      if (sortBy === 'quantity_asc') return (a.quantity || 0) - (b.quantity || 0);
      return new Date(b.created_date) - new Date(a.created_date); // newest
    });

  const newCount = requests.filter(r => r.status === 'new').length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-foreground">Quote Requests</h1>
                {newCount > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{newCount} new</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Customer quote submissions and project inquiries</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, email…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger><SelectValue placeholder="All Products" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {PRODUCT_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contactFilter} onValueChange={setContactFilter}>
            <SelectTrigger><SelectValue placeholder="Contact Method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contact Methods</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone">Phone Call</SelectItem>
              <SelectItem value="text">Text Message</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger><SelectValue placeholder="Sort By" /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {['Customer', 'Business', 'Contact', 'Product', 'Qty', 'Date Needed', 'Status', 'Submitted', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No quote requests found.</td></tr>
                ) : filtered.map(r => {
                  const s = STATUS_MAP[r.status] || STATUS_MAP['new'];
                  return (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sm">{r.full_name}</p>
                        <p className="text-xs text-muted-foreground">{r.email}</p>
                        {r.phone && <p className="text-xs text-muted-foreground">{r.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{r.business_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{CONTACT_LABELS[r.preferred_contact] || r.preferred_contact || '—'}</td>
                      <td className="px-4 py-3 text-sm">{PRODUCT_LABELS[r.product_type] || r.product_type || '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium">{r.quantity || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{r.date_needed || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${s.color}`}>{s.label}</Badge>
                        {r.workflow_status && (
                          <p className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">
                            {ssVendorOrderStageLabel(r.workflow_status)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {r.created_date ? new Date(r.created_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/AdminQuoteRequestDetail?id=${r.id}`}>
                          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs whitespace-nowrap">
                            <Eye className="w-3.5 h-3.5" />View Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {requests.length} requests
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
