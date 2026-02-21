'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type KeyStatus = 'loading' | 'configured' | 'missing';
type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

export function SettingsModal() {
  const settingsModalOpen = useAppStore((s) => s.settingsModalOpen);
  const closeSettings = useAppStore((s) => s.closeSettings);

  const [keyStatus, setKeyStatus] = useState<KeyStatus>('loading');
  const [validationStatus, setValidationStatus] =
    useState<ValidationStatus>('idle');

  useEffect(() => {
    if (!settingsModalOpen) return;
    setValidationStatus('idle');
    fetch('/api/settings/fal-key')
      .then((res) => res.json())
      .then((data: { status: string }) => {
        setKeyStatus(data.status === 'configured' ? 'configured' : 'missing');
      })
      .catch(() => {
        setKeyStatus('missing');
      });
  }, [settingsModalOpen]);

  const handleValidate = useCallback(async () => {
    setValidationStatus('validating');
    try {
      const res = await fetch('/api/settings/fal-key', { method: 'POST' });
      const data: { valid: boolean } = await res.json();
      setValidationStatus(data.valid ? 'valid' : 'invalid');
    } catch {
      setValidationStatus('invalid');
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
            {keyStatus === 'loading' && (
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
            )}
            {keyStatus === 'configured' && validationStatus === 'idle' && (
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
            )}
            {keyStatus === 'configured' && validationStatus === 'validating' && (
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
            )}
            {validationStatus === 'valid' && (
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
            )}
            {validationStatus === 'invalid' && (
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
            )}
            {keyStatus === 'missing' && (
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
            )}
          </div>

          {keyStatus === 'configured' && (
            <button
              onClick={handleValidate}
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
          )}

          {keyStatus === 'missing' && (
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
                FAL_KEY=your-key-here
              </code>
              <a
                href="https://fal.ai/dashboard/keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#2a8af6',
                  textDecoration: 'underline',
                  fontSize: 12,
                }}
              >
                Get your API key from fal.ai
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
