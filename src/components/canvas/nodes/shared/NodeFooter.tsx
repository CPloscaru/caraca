'use client';

import { Play, Loader2 } from 'lucide-react';
import { ModelDetails, type CachedModel } from '../ModelSelector';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type NodeFooterProps = {
  modelInfo: CachedModel | null;
  isRunning: boolean;
  onRun: () => void;
  costTooltip: string | null;
  accentColor?: 'purple' | 'amber';
};

export function NodeFooter({
  modelInfo,
  isRunning,
  onRun,
  costTooltip,
  accentColor = 'purple',
}: NodeFooterProps) {
  const btnClass =
    accentColor === 'amber'
      ? 'bg-amber-600 hover:bg-amber-500'
      : 'bg-purple-600 hover:bg-purple-500';

  return (
    <div className="flex items-center justify-between p-2 pt-0">
      {modelInfo ? <ModelDetails model={modelInfo} /> : <div />}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`nodrag flex h-8 w-8 items-center justify-center rounded-full text-white shadow-lg transition-all ${btnClass}`}
              onClick={onRun}
              title={isRunning ? 'Cancel' : undefined}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          {costTooltip && !isRunning && (
            <TooltipContent>~{costTooltip}</TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
