'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { Sidebar } from '@/components/canvas/Sidebar';

export default function Home() {
  return (
    <ReactFlowProvider>
      <div className="flex h-screen w-screen flex-col" style={{ background: '#111111' }}>
        <Toolbar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <Canvas />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
