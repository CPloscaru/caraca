'use client';

export function Toolbar() {
  return (
    <div
      style={{
        height: 48,
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
      }}
    >
      <span style={{ color: '#f3f4f6', fontSize: 16, fontWeight: 600 }}>
        Caraca
      </span>
    </div>
  );
}
