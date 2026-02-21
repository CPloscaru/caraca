'use client';

export function Sidebar() {
  return (
    <div
      style={{
        width: 240,
        background: '#1a1a1a',
        borderRight: '1px solid #2a2a2a',
        padding: 12,
        color: '#f3f4f6',
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Nodes</div>
      <div style={{ color: '#9ca3af' }}>Drag to add</div>
    </div>
  );
}
