import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Archive } from 'lucide-react';

export default function AdminSSCatalog() {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <Archive className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
        <h1 className="text-xl font-bold text-muted-foreground">S&S Catalog — Archived</h1>
        <p className="text-sm text-muted-foreground">The S&S catalog system is no longer active. Use the new Garment Catalog Manager instead.</p>
        <Link to="/AdminGarmentCatalog">
          <Button>Go to Garment Catalog Manager</Button>
        </Link>
      </div>
    </div>
  );
}