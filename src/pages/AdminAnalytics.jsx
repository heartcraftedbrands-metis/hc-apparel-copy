import React, { useMemo } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { format, subDays, startOfDay, isAfter } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AdminAnalytics() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['analytics-orders'],
    queryFn: () => base44.entities.Order.list('-created_date'),
  });

  const stats = useMemo(() => {
    const now = new Date();
    const last30Days = subDays(now, 30);
    const last7Days = subDays(now, 7);

    const recentOrders = orders.filter(o => isAfter(new Date(o.created_date), last30Days));
    const weekOrders = orders.filter(o => isAfter(new Date(o.created_date), last7Days));

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const monthRevenue = recentOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const weekRevenue = weekOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const uniqueCustomers = new Set(orders.map(o => o.customer_email)).size;
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    // Revenue by day (last 14 days)
    const revenueByDay = [];
    for (let i = 13; i >= 0; i--) {
      const day = startOfDay(subDays(now, i));
      const dayEnd = startOfDay(subDays(now, i - 1));
      const dayOrders = orders.filter(o => {
        const d = new Date(o.created_date);
        return d >= day && d < dayEnd;
      });
      revenueByDay.push({
        date: format(day, 'MMM d'),
        revenue: dayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
        orders: dayOrders.length
      });
    }

    // Orders by status
    const statusCounts = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});
    const ordersByStatus = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

    // Top products
    const productSales = {};
    orders.forEach(o => {
      o.order_items?.forEach(item => {
        const key = item.product_name;
        if (!productSales[key]) productSales[key] = { name: key, quantity: 0, revenue: 0 };
        productSales[key].quantity += item.quantity;
        productSales[key].revenue += item.price * item.quantity;
      });
    });
    const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return {
      totalRevenue,
      monthRevenue,
      weekRevenue,
      totalOrders: orders.length,
      monthOrders: recentOrders.length,
      uniqueCustomers,
      avgOrderValue,
      revenueByDay,
      ordersByStatus,
      topProducts
    };
  }, [orders]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Sales Analytics</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6"><div className="h-16 bg-gray-200 rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Sales Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold">${stats.totalRevenue.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">This Month</p>
                <p className="text-2xl font-bold">${stats.monthRevenue.toFixed(2)}</p>
                <p className="text-xs text-gray-400">{stats.monthOrders} orders</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Orders</p>
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
                <p className="text-xs text-gray-400">Avg ${stats.avgOrderValue.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <ShoppingCart className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Unique Customers</p>
                <p className="text-2xl font-bold">{stats.uniqueCustomers}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader><CardTitle>Revenue (Last 14 Days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.revenueByDay}>
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Orders by Status</CardTitle></CardHeader>
          <CardContent>
            {stats.ordersByStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.ordersByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {stats.ordersByStatus.map((entry, idx) => (
                      <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card>
        <CardHeader><CardTitle>Top Products by Revenue</CardTitle></CardHeader>
        <CardContent>
          {stats.topProducts.length > 0 ? (
            <div className="space-y-4">
              {stats.topProducts.map((product, idx) => (
                <div key={product.name} className="flex items-center gap-4">
                  <span className="text-lg font-bold text-gray-400 w-6">{idx + 1}</span>
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-gray-500">{product.quantity} sold</p>
                  </div>
                  <p className="font-bold text-lg">${product.revenue.toFixed(2)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">No sales data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}