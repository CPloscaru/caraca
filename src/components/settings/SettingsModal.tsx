'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useBudgetStore } from '@/stores/budget-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type KeyStatus = 'loading' | 'configured' | 'missing';
type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

// ---------------------------------------------------------------------------
// Shared status badge component
// ---------------------------------------------------------------------------

function StatusBadge({
  keyStatus,
  validationStatus,
}: {
  keyStatus: KeyStatus;
  validationStatus: ValidationStatus;
}) {
  if (keyStatus === 'loading') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          color: '#9ca3af',
        }}
      >
        <Loader2 size={14} className="animate-spin" />
        Checking...
      </span>
    );
  }

  if (keyStatus === 'configured' && validationStatus === 'idle') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          color: '#22c55e',
          background: 'rgba(34, 197, 94, 0.1)',
          padding: '2px 8px',
          borderRadius: 4,
        }}
      >
        <CheckCircle size={14} />
        Configured
      </span>
    );
  }

  if (keyStatus === 'configured' && validationStatus === 'validating') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          color: '#9ca3af',
        }}
      >
        <Loader2 size={14} className="animate-spin" />
        Validating...
      </span>
    );
  }

  if (validationStatus === 'valid') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          color: '#22c55e',
          background: 'rgba(34, 197, 94, 0.1)',
          padding: '2px 8px',
          borderRadius: 4,
        }}
      >
        <CheckCircle size={14} />
        Valid
      </span>
    );
  }

  if (validationStatus === 'invalid') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          color: '#ef4444',
          background: 'rgba(239, 68, 68, 0.1)',
          padding: '2px 8px',
          borderRadius: 4,
        }}
      >
        <XCircle size={14} />
        Invalid
      </span>
    );
  }

  if (keyStatus === 'missing') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          color: '#ef4444',
          background: 'rgba(239, 68, 68, 0.1)',
          padding: '2px 8px',
          borderRadius: 4,
        }}
      >
        <XCircle size={14} />
        Missing
      </span>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared validate button component
// ---------------------------------------------------------------------------

function ValidateButton({
  onClick,
  validationStatus,
}: {
  onClick: () => void;
  validationStatus: ValidationStatus;
}) {
  return (
    <button
      onClick={onClick}
      disabled={validationStatus === 'validating'}
      style={{
        background: 'linear-gradient(135deg, #ae53ba, #2a8af6)',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        padding: '6px 16px',
        fontSize: 13,
        fontWeight: 500,
        cursor:
          validationStatus === 'validating' ? 'not-allowed' : 'pointer',
        opacity: validationStatus === 'validating' ? 0.6 : 1,
        transition: 'opacity 0.15s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {validationStatus === 'validating' && (
        <Loader2 size={14} className="animate-spin" />
      )}
      Validate
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shared missing key help box
// ---------------------------------------------------------------------------

function MissingKeyHelp({
  envVar,
  dashboardUrl,
  dashboardLabel,
}: {
  envVar: string;
  dashboardUrl: string;
  dashboardLabel: string;
}) {
  return (
    <div
      style={{
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: 6,
        padding: '10px 12px',
        fontSize: 13,
        color: '#d4a44a',
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0, marginBottom: 6 }}>
        Add your API key to{' '}
        <code
          style={{
            background: '#2a2a2a',
            padding: '1px 4px',
            borderRadius: 3,
            fontSize: 12,
          }}
        >
          .env.local
        </code>
        :
      </p>
      <code
        style={{
          display: 'block',
          background: '#2a2a2a',
          padding: '6px 8px',
          borderRadius: 4,
          fontSize: 12,
          color: '#f3f4f6',
          marginBottom: 8,
        }}
      >
        {envVar}=your-key-here
      </code>
      <a
        href={dashboardUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: '#2a8af6',
          textDecoration: 'underline',
          fontSize: 12,
        }}
      >
        {dashboardLabel}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Threshold input component
// ---------------------------------------------------------------------------

function ThresholdInput({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div>
      <label style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, display: 'block' }}>
        {label}
      </label>
      <input
        type="number"
        step="0.5"
        min="0"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(value);
        }}
        style={{
          width: '100%',
          background: '#111',
          border: '1px solid #2a2a2a',
          borderRadius: 6,
          padding: '6px 8px',
          color: '#f3f4f6',
          fontSize: 13,
          outline: 'none',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main settings modal
// ---------------------------------------------------------------------------

export function SettingsModal() {
  const settingsModalOpen = useAppStore((s) => s.settingsModalOpen);
  const closeSettings = useAppStore((s) => s.closeSettings);

  // fal.ai key state
  const [falKeyStatus, setFalKeyStatus] = useState<KeyStatus>('loading');
  const [falValidation, setFalValidation] =
    useState<ValidationStatus>('idle');

  // OpenRouter key state
  const [orKeyStatus, setOrKeyStatus] = useState<KeyStatus>('loading');
  const [orValidation, setOrValidation] =
    useState<ValidationStatus>('idle');

  // Budget thresholds state
  const storeThresholds = useBudgetStore((s) => s.thresholds);
  const saveThresholds = useBudgetStore((s) => s.saveThresholds);
  const [falWarning, setFalWarning] = useState(storeThresholds.fal.warning);
  const [falCritical, setFalCritical] = useState(storeThresholds.fal.critical);
  const [orWarning, setOrWarning] = useState(storeThresholds.openRouter.warning);
  const [orCritical, setOrCritical] = useState(storeThresholds.openRouter.critical);

  useEffect(() => {
    if (!settingsModalOpen) return;
    setFalValidation('idle');
    setOrValidation('idle');

    // Fetch budget thresholds
    useBudgetStore.getState().fetchThresholds();

    // Fetch fal.ai key status
    fetch('/api/settings/fal-key')
      .then((res) => res.json())
      .then((data: { status: string }) => {
        setFalKeyStatus(data.status === 'configured' ? 'configured' : 'missing');
      })
      .catch(() => setFalKeyStatus('missing'));

    // Fetch OpenRouter key status
    fetch('/api/openrouter/validate-key')
      .then((res) => res.json())
      .then((data: { configured: boolean }) => {
        setOrKeyStatus(data.configured ? 'configured' : 'missing');
      })
      .catch(() => setOrKeyStatus('missing'));
  }, [settingsModalOpen]);

  // Sync local threshold inputs when store updates
  useEffect(() => {
    setFalWarning(storeThresholds.fal.warning);
    setFalCritical(storeThresholds.fal.critical);
    setOrWarning(storeThresholds.openRouter.warning);
    setOrCritical(storeThresholds.openRouter.critical);
  }, [storeThresholds]);

  const commitThresholds = useCallback(
    (fw: number, fc: number, ow: number, oc: number) => {
      saveThresholds({
        fal: { warning: fw, critical: fc },
        openRouter: { warning: ow, critical: oc },
      });
    },
    [saveThresholds],
  );

  const handleFalValidate = useCallback(async () => {
    setFalValidation('validating');
    try {
      const res = await fetch('/api/settings/fal-key', { method: 'POST' });
      const data: { valid: boolean } = await res.json();
      setFalValidation(data.valid ? 'valid' : 'invalid');
    } catch {
      setFalValidation('invalid');
    }
  }, []);

  const handleOrValidate = useCallback(async () => {
    setOrValidation('validating');
    try {
      const res = await fetch('/api/openrouter/validate-key', { method: 'POST' });
      const data: { valid: boolean } = await res.json();
      setOrValidation(data.valid ? 'valid' : 'invalid');
    } catch {
      setOrValidation('invalid');
    }
  }, []);

  return (
    <Dialog open={settingsModalOpen} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent
        style={{
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          color: '#f3f4f6',
        }}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle style={{ color: '#f3f4f6' }}>Settings</DialogTitle>
          <DialogDescription style={{ color: '#9ca3af' }}>
            Application configuration and API status
          </DialogDescription>
        </DialogHeader>

        {/* fal.ai API Key Section */}
        <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 16 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#f3f4f6',
              marginBottom: 12,
            }}
          >
            fal.ai API Key
          </h3>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, color: '#9ca3af' }}>Status:</span>
            <StatusBadge keyStatus={falKeyStatus} validationStatus={falValidation} />
          </div>

          {falKeyStatus === 'configured' && (
            <ValidateButton onClick={handleFalValidate} validationStatus={falValidation} />
          )}

          {falKeyStatus === 'missing' && (
            <MissingKeyHelp
              envVar="FAL_KEY"
              dashboardUrl="https://fal.ai/dashboard/keys"
              dashboardLabel="Get your API key from fal.ai"
            />
          )}
        </div>

        {/* OpenRouter API Key Section */}
        <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 16, marginTop: 8 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#f3f4f6',
              marginBottom: 12,
            }}
          >
            OpenRouter API Key
          </h3>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, color: '#9ca3af' }}>Status:</span>
            <StatusBadge keyStatus={orKeyStatus} validationStatus={orValidation} />
          </div>

          {orKeyStatus === 'configured' && (
            <ValidateButton onClick={handleOrValidate} validationStatus={orValidation} />
          )}

          {orKeyStatus === 'missing' && (
            <MissingKeyHelp
              envVar="OPENROUTER_KEY"
              dashboardUrl="https://openrouter.ai/keys"
              dashboardLabel="Get your API key from OpenRouter"
            />
          )}
        </div>

        {/* Budget Alert Thresholds */}
        <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 16, marginTop: 8 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#f3f4f6',
              marginBottom: 12,
            }}
          >
            Budget Alert Thresholds
          </h3>
          <p
            style={{
              fontSize: 12,
              color: '#6b7280',
              marginBottom: 12,
              lineHeight: 1.4,
            }}
          >
            fal.ai: alerts when spending exceeds threshold. OpenRouter: alerts when balance drops below threshold.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ThresholdInput
              label="fal.ai warning ($)"
              value={falWarning}
              onChange={setFalWarning}
              onCommit={(v) => commitThresholds(v, falCritical, orWarning, orCritical)}
            />
            <ThresholdInput
              label="fal.ai critical ($)"
              value={falCritical}
              onChange={setFalCritical}
              onCommit={(v) => commitThresholds(falWarning, v, orWarning, orCritical)}
            />
            <ThresholdInput
              label="OpenRouter warning ($)"
              value={orWarning}
              onChange={setOrWarning}
              onCommit={(v) => commitThresholds(falWarning, falCritical, v, orCritical)}
            />
            <ThresholdInput
              label="OpenRouter critical ($)"
              value={orCritical}
              onChange={setOrCritical}
              onCommit={(v) => commitThresholds(falWarning, falCritical, orWarning, v)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
