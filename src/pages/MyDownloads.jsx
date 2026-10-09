import { Link, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';

import DownloadsPanel from '@/components/mockups/DownloadsPanel';
import { Button } from '@/components/ui/button';

export default function MyDownloads() {
  const [params] = useSearchParams();
  const orderId = params.get('orderId') || '';
  const access = params.get('access') || (orderId ? window.localStorage.getItem(`hc_digital_access:${orderId}`) || '' : '');
  return <main className="min-h-[70vh] bg-background"><div className="container mx-auto max-w-4xl px-4 py-10 md:py-14">
    <header className="mb-7"><p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">HC Apparel account</p><h1 className="mt-1 flex items-center gap-3 text-3xl font-black"><Download className="h-7 w-7 text-primary" />My Downloads</h1><p className="mt-2 text-sm text-muted-foreground">Access the original mockup files included in your verified purchases.</p></header>
    <DownloadsPanel orderId={orderId} access={access} />
    <div className="mt-8"><Button variant="outline" asChild><Link to="/DigitalMockups">Browse more mockups</Link></Button></div>
  </div></main>;
}
