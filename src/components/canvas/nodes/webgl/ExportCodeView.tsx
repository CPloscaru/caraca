'use client';

import { useCallback, useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { Copy, Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExportCodeViewProps = {
  code: string;
  language: 'html' | 'javascript';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportCodeView({ code, language }: ExportCodeViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Copy button */}
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          background: copied ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255,255,255,0.1)',
          border: `1px solid ${copied ? 'rgba(76, 175, 80, 0.4)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 4,
          color: copied ? '#4caf50' : '#ccc',
          fontSize: 11,
          cursor: 'pointer',
          zIndex: 2,
          transition: 'all 0.2s ease',
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copie \u2713' : 'Copier'}
      </button>

      {/* Syntax-highlighted code */}
      <Highlight theme={themes.vsDark} code={code} language={language}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            style={{
              ...style,
              maxHeight: 400,
              overflow: 'auto',
              fontSize: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              padding: '12px 14px',
              margin: 0,
              borderRadius: 6,
              background: '#1a1a2e',
              lineHeight: 1.5,
            }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
