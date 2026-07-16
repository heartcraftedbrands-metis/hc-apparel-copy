import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Eye, CheckCircle, MessageSquare, Archive, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

const STATUS_MAP = {
  new:      { label: 'New',      color: 'bg-blue-100 text-blue-700' },
  reviewed: { label: 'Reviewed', color: 'bg-yellow-100 text-yellow-700' },
  replied:  { label: 'Replied',  color: 'bg-green-100 text-green-700' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-500' },
};

export default function AdminContactMessages() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['contact_messages'],
    queryFn: () => base44.entities.ContactMessage.list('-created_date'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.ContactMessage.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact_messages'] }),
  });

  const setStatus = (id, status) => {
    updateStatus.mutate({ id, status });
    if (selected?.id === id) setSelected(s => ({ ...s, status }));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-8 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <Link to="/AdminDashboard" className="inline-flex items-center gap-1.5 text-xs text-primary-foreground/60 hover:text-primary-foreground mb-3 transition-colors">
            ← Back to Admin Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <Mail className="w-6 h-6 text-accent" />
            <div>
              <h1 className="text-2xl font-extrabold">Contact Messages</h1>
              <p className="text-primary-foreground/70 text-sm">Messages submitted through the Contact page</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No contact messages yet.</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-5 gap-6">
            {/* Message List */}
            <div className="lg:col-span-2 space-y-2">
              {messages.map(msg => (
                <button
                  key={msg.id}
                  onClick={() => setSelected(msg)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    selected?.id === msg.id
                      ? 'bg-primary/5 border-primary/30'
                      : 'bg-white border-border hover:border-primary/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm truncate">{msg.name}</p>
                    <Badge className={`text-xs shrink-0 ${STATUS_MAP[msg.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_MAP[msg.status]?.label || msg.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{msg.subject || '(no subject)'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {msg.created_date ? format(new Date(msg.created_date), 'MMM d, yyyy') : '—'}
                  </p>
                </button>
              ))}
            </div>

            {/* Detail Panel */}
            <div className="lg:col-span-3">
              {selected ? (
                <div className="bg-white border border-border rounded-2xl p-6 shadow-sm space-y-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold">{selected.name}</h2>
                      <a href={`mailto:${selected.email}`} className="text-sm text-primary hover:underline">{selected.email}</a>
                    </div>
                    <Badge className={`${STATUS_MAP[selected.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_MAP[selected.status]?.label || selected.status}
                    </Badge>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Subject</p>
                    <p className="text-sm font-medium">{selected.subject || '(no subject)'}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Message</p>
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-xl p-3 leading-relaxed">{selected.message}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Submitted: {selected.created_date ? format(new Date(selected.created_date), 'MMM d, yyyy h:mm a') : '—'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button size="sm" variant="outline" onClick={() => setStatus(selected.id, 'reviewed')}
                      disabled={selected.status === 'reviewed'} className="gap-1.5">
                      <Eye className="w-4 h-4" />Mark Reviewed
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(selected.id, 'replied')}
                      disabled={selected.status === 'replied'} className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50">
                      <CheckCircle className="w-4 h-4" />Mark Replied
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(selected.id, 'archived')}
                      disabled={selected.status === 'archived'} className="gap-1.5 border-gray-300 text-gray-600 hover:bg-gray-50">
                      <Archive className="w-4 h-4" />Archive
                    </Button>
                    <a href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject || '')}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 transition-colors">
                      <Mail className="w-4 h-4" />Reply via Email
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm bg-white border border-dashed border-border rounded-2xl">
                  Select a message to view
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}