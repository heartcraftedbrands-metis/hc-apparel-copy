import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Phone, Globe, Pencil, Trash2, Star, Eye, ToggleLeft, ToggleRight, MapPin } from 'lucide-react';

const TYPE_LABELS = {
  apparel_blank_supplier: 'Blank Supplier', dtf_printer: 'DTF Printer',
  screen_printer: 'Screen Printer', embroidery: 'Embroidery',
  dtg_printer: 'DTG Printer', dtf_supplier: 'DTF Supplier',
  sublimation: 'Sublimation', packaging: 'Packaging',
  shipping: 'Shipping', other: 'Other',
};

function StarRating({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => (
        <Star key={n} className={`w-3 h-3 ${n <= value ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`} />
      ))}
    </div>
  );
}

export default function VendorCard({ vendor: v, onEdit, onDelete, onToggleActive }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm flex flex-col ${!v.is_active ? 'opacity-60' : ''}`}>
      <div className="p-5 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-base leading-tight truncate">{v.name}</h3>
            {v.contact_person && <p className="text-sm text-muted-foreground mt-0.5">{v.contact_person}</p>}
          </div>
          <Badge className={`flex-shrink-0 text-xs ${v.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            {v.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        <Badge variant="outline" className="mb-3 text-xs capitalize">
          {TYPE_LABELS[v.vendor_type] || v.vendor_type}
        </Badge>

        {/* Ratings */}
        {(v.quality_rating > 0 || v.reliability_rating > 0) && (
          <div className="flex gap-4 mb-3">
            {v.quality_rating > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Quality</p>
                <StarRating value={v.quality_rating} />
              </div>
            )}
            {v.reliability_rating > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Reliability</p>
                <StarRating value={v.reliability_rating} />
              </div>
            )}
          </div>
        )}

        {/* Contact */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {v.email && <div className="flex items-center gap-2"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{v.email}</span></div>}
          {v.phone && <div className="flex items-center gap-2"><Phone className="w-3 h-3 flex-shrink-0" />{v.phone}</div>}
          {v.website && (
            <div className="flex items-center gap-2">
              <Globe className="w-3 h-3 flex-shrink-0" />
              <a href={v.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary truncate">{v.website}</a>
            </div>
          )}
          {v.address && <div className="flex items-center gap-2"><MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{v.address}</span></div>}
          {v.turnaround_time && <div><span className="font-medium text-foreground">Turnaround:</span> {v.turnaround_time}</div>}
          {v.minimum_order_quantity > 0 && <div><span className="font-medium text-foreground">MOQ:</span> {v.minimum_order_quantity}</div>}
        </div>

        {/* Print methods */}
        {v.print_methods_offered?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {v.print_methods_offered.slice(0,4).map((m, i) => (
              <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{m}</span>
            ))}
            {v.print_methods_offered.length > 4 && <span className="text-xs text-muted-foreground">+{v.print_methods_offered.length - 4}</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t p-3 flex gap-2">
        <Link to={`/AdminVendorDetail?id=${v.id}`} className="flex-1">
          <Button size="sm" variant="outline" className="w-full gap-1.5 h-8"><Eye className="w-3.5 h-3.5" />View</Button>
        </Link>
        <Button size="sm" variant="outline" className="h-8 px-3 gap-1.5" onClick={onEdit}><Pencil className="w-3.5 h-3.5" />Edit</Button>
        <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-foreground" onClick={onToggleActive} title={v.is_active ? 'Deactivate' : 'Activate'}>
          {v.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 px-2 text-red-500 hover:bg-red-50" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}