import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function Checkout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <Link to={createPageUrl('Home')}>
          <Button variant="ghost" className="mb-8">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                Launch Week Ordering
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <p className="text-base text-foreground">
                  Online ordering is being finalized for launch week.
                </p>
                <p className="text-base text-foreground">
                  Please request order help and HC Apparel will confirm your order details.
                </p>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <p className="font-semibold text-primary">support@ilovehcapparel.net</p>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <Link to="/RequestQuote" className="w-full">
                  <Button className="w-full" size="lg">
                    Request Order Help
                  </Button>
                </Link>
                <Link to={createPageUrl('ShopGarments')} className="w-full">
                  <Button variant="outline" className="w-full" size="lg">
                    Continue Shopping
                  </Button>
                </Link>
                <Link to={createPageUrl('Contact')} className="w-full">
                  <Button variant="outline" className="w-full" size="lg">
                    Contact Support
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}