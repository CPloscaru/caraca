'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Session-level dismissal (resets on page reload)
// ---------------------------------------------------------------------------

let costDialogDismissedForSession = false;

export function isCostDialogDismissed(): boolean {
  return costDialogDismissedForSession;
}

function dismissCostDialog(): void {
  costDialogDismissedForSession = true;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type BatchCostDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  itemCount: number;
  unitPrice: number | null; // null = pricing unavailable
  priceUnit: string | null; // e.g., "image", "video", "megapixel"
  modelName: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchCostDialog({
  open,
  onConfirm,
  onCancel,
  itemCount,
  unitPrice,
  priceUnit,
  modelName,
}: BatchCostDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleConfirm = () => {
    if (dontAskAgain) {
      dismissCostDialog();
    }
    onConfirm();
  };

  const hasPricing = unitPrice != null;
  const total = hasPricing ? unitPrice * itemCount : null;

  const formatPrice = (price: number) => {
    if (price < 0.01) return price.toFixed(4);
    if (price < 1) return price.toFixed(3);
    return price.toFixed(2);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent
        className="bg-[#1a1a1a] border-white/10 text-gray-100 sm:max-w-sm"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-gray-100">
            Run Batch
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            {modelName} &mdash; {itemCount} item{itemCount !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {hasPricing && total != null ? (
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <div className="text-xs text-gray-300">
                <span className="font-mono text-teal-400">
                  ${formatPrice(unitPrice)}
                </span>
                <span className="text-gray-500">/{priceUnit}</span>
                {' '}&times; {itemCount} ={' '}
                <span className="font-semibold text-teal-300">
                  ~${formatPrice(total)}
                </span>
                {' '}total
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
              <div className="text-xs text-amber-300">
                Cost unknown for this model
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-teal-500"
            />
            <span className="text-[11px] text-gray-500">
              Don&apos;t ask again this session
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded bg-teal-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-500"
          >
            Run Batch
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
