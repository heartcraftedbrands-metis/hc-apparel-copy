import React, { useEffect, useState } from 'react';
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { LogOut, User, Package, Settings, Trash2, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import DeleteAccountModal from "@/components/mobile/DeleteAccountModal";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <User className="w-16 h-16 text-gray-300" />
        <p className="text-gray-500">You are not logged in.</p>
        <Button onClick={() => base44.auth.redirectToLogin()}>Login</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
          <User className="w-10 h-10 text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{user.full_name || 'My Account'}</h1>
        <p className="text-gray-500 text-sm">{user.email}</p>
        <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600 capitalize">{user.role}</span>
      </div>

      <div className="bg-white rounded-2xl border divide-y overflow-hidden">
        {user.role === 'admin' && (
          <>
            <Link to={createPageUrl('AdminProducts')} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
              <Settings className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Manage Products</span>
            </Link>
            <Link to={createPageUrl('AdminOrders')} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
              <Package className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">View Orders</span>
            </Link>
            <Link to={createPageUrl('AdminAnalytics')} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
              <BarChart3 className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Sales Analytics</span>
            </Link>
          </>
        )}
        <button
          onClick={() => base44.auth.logout()}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
        >
          <LogOut className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Logout</span>
        </button>
        <button
          onClick={() => setShowDelete(true)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-red-50 transition-colors text-left"
        >
          <Trash2 className="w-5 h-5 text-red-400" />
          <span className="text-sm font-medium text-red-500">Delete Account</span>
        </button>
      </div>

      <DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} />
    </div>
  );
}