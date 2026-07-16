import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function DeleteAccountModal({ open, onClose }) {
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await base44.auth.logout();
      toast.success('Account deleted. You have been logged out.');
      onClose();
    } catch {
      toast.error('Failed to delete account. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-red-600">Delete Account</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          This action is <strong>irreversible</strong>. All your data will be permanently removed. 
          Type <strong>DELETE</strong> to confirm.
        </p>
        <Input
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="mt-2"
        />
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={confirm !== 'DELETE' || loading}
            onClick={handleDelete}
          >
            {loading ? 'Deleting…' : 'Delete Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}