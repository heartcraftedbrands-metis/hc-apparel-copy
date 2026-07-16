import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link } from 'react-router-dom';
import { Settings2, ArrowLeft, Wifi, WifiOff, Info } from 'lucide-react';

export default function AdminSSApiSettings() {
  const [form, setForm] = useState({ account_number: '', api_key: '' });
  const [testing, setTesting] = useState(false);

  const handleTestConnection = () => {
    setTesting(true);
    setTimeout(() => { setTesting(false); }, 1500);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto flex items-center gap-4">
          <Link to="/AdminSSCatalog">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-accent" />
              S&S Activewear API Settings
            </h1>
            <p className="text-primary-foreground/70 text-sm">Phase 2 — API connection placeholder</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Phase 2 banner */}
        <div className="bg-accent/10 border border-accent/30 rounded-2xl p-5 mb-6 flex gap-3">
          <Info className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Phase 2 — Coming Soon</p>
            <p className="text-sm text-muted-foreground mt-1">
              This page is a placeholder for the upcoming S&S Activewear live API integration.
              When Phase 2 is ready, you'll be able to sync your catalog automatically using your account credentials.
              For now, use the <Link to="/AdminSSCatalog" className="text-primary underline">CSV / Excel import</Link> to add products.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">API Credentials</h2>
            <Badge className="bg-gray-100 text-gray-600 flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Not Connected
            </Badge>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="acct">S&S Account Number</Label>
              <Input
                id="acct"
                placeholder="Your S&S Activewear account number"
                value={form.account_number}
                onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                disabled
              />
            </div>
            <div>
              <Label htmlFor="apikey">S&S API Key</Label>
              <Input
                id="apikey"
                type="password"
                placeholder="Your S&S API key"
                value={form.api_key}
                onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                disabled
              />
              <p className="text-xs text-muted-foreground mt-1">Your credentials are never stored until Phase 2 is live.</p>
            </div>
          </div>

          <div className="border-t pt-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium">Connection Status</p>
                <p className="text-xs text-muted-foreground">Last checked: Never</p>
              </div>
              <Badge className="bg-gray-100 text-gray-500">Offline</Badge>
            </div>
            <Button
              variant="outline"
              className="gap-2 w-full"
              onClick={handleTestConnection}
              disabled={testing}
            >
              <Wifi className="w-4 h-4" />
              {testing ? 'Testing…' : 'Test Connection (Coming Soon)'}
            </Button>
          </div>

          <div className="border-t pt-5">
            <Button className="w-full bg-primary text-primary-foreground" disabled>
              Save Settings (Coming Soon)
            </Button>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-2xl border shadow-sm p-6">
          <h3 className="font-bold mb-3">What Phase 2 Will Include</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              'Live catalog sync from your S&S account',
              'Automatic inventory and price updates',
              'Order placement directly to S&S from vendor orders',
              'Dropship fulfillment routing',
              'Automatic product availability updates',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-accent font-bold mt-0.5">→</span> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}