import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Archive, Eye, Globe, Pencil, Search } from 'lucide-react';
import { toast } from "sonner";
import { Link } from 'react-router-dom';
import { isDigitalProduct } from "@/lib/productVisibility";

export default function AdminDigitalArchive() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ['digital-archive'],
    queryFn: () => base44.entities.Product.list('-created_date'),
  });

  // Only show products that are digital/archived
  const digitalProducts = allProducts.filter(p =>
    p.visibility === 'admin_archive' || isDigitalProduct(p)
  );

  const filtered = search
    ? digitalProducts.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()))
    : digitalProducts;

  const updateVisibility = useMutation({
    mutationFn: ({ id, visibility }) => base44.entities.Product.update(id, { visibility, is_active: visibility === 'public' }),
    onSuccess: () => { qc.invalidateQueries(['digital-archive']); qc.invalidateQueries(['admin-products']); toast.success('Visibility updated'); },
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-[hsl(255,40%,35%)] text-white py-6 px-4">
        <div className="container mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Archive className="w-6 h-6 text-yellow-300" />
            <h1 className="text-xl font-bold">Digital Design Archive</h1>
            <Badge className="bg-yellow-400 text-yellow-900 font-bold text-xs">ADMIN ONLY</Badge>
          </div>
          <p className="text-white/70 text-sm ml-9">These products are permanently hidden from the public website. Customers cannot see, search, or purchase them.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Warning banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 mb-6 text-sm text-yellow-800 flex items-start gap-3">
          <Archive className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-600" />
          <div>
            <strong>Admin-Only Archive:</strong> {digitalProducts.length} digital design product{digitalProducts.length !== 1 ? 's' : ''} are stored here.
            They are <strong>never visible</strong> to customers on any public page, search, or category. 
            You can restore a product to public if needed using the "Make Public" button.
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search archived products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-white" />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="bg-white rounded-xl aspect-[3/4] animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {search ? 'No products match your search' : 'No archived digital products found'}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">{filtered.length} product{filtered.length !== 1 ? 's' : ''} archived</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map(p => (
                <div key={p.id} className="bg-white rounded-2xl border overflow-hidden shadow-sm opacity-80 hover:opacity-100 transition-opacity">
                  <div className="aspect-square bg-muted overflow-hidden relative">
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 font-bold text-4xl">HC</div>
                    }
                    {/* Admin Only badge — never shown to customers */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      <Archive className="w-3 h-3" /> Admin Only
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground mb-0.5 capitalize">{p.category?.replace(/_/g,' ')}</p>
                    <h3 className="font-semibold text-xs mb-2 line-clamp-2">{p.name}</h3>
                    <p className="text-accent font-bold text-sm mb-3">${p.price?.toFixed(2)}</p>
                    <div className="flex gap-1.5">
                      <Link to="/AdminProducts" className="flex-1">
                        <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1"><Pencil className="w-3 h-3" />Edit</Button>
                      </Link>
                      <Button
                        size="sm"
                        className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white"
                        title="Restore to public store"
                        onClick={() => updateVisibility.mutate({ id: p.id, visibility: 'public' })}
                      >
                        <Globe className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}