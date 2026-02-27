import { useState, useEffect, useCallback } from 'react';
import { Braces, Copy, Check } from 'lucide-react';
import { JsonTreeView } from './JsonTreeView';
import { SchemaTreeView } from './SchemaTreeView';
import type { SchemaNode } from '@/lib/fal/schema-tree';

// ---------------------------------------------------------------------------
// DebugToggleButton
// ---------------------------------------------------------------------------

type DebugToggleButtonProps = {
  active: boolean;
  onClick: () => void;
  /** Override default absolute positioning (e.g. for inline header usage) */
  className?: string;
};

export function DebugToggleButton({ active, onClick, className }: DebugToggleButtonProps) {
  return (
    <button
      className={`nodrag h-6 w-6 flex items-center justify-center rounded transition-opacity ${
        active
          ? 'bg-purple-500/20 text-purple-300 opacity-100'
          : 'text-gray-400 opacity-50 hover:opacity-80'
      } ${className ?? 'absolute top-2 right-2 z-10'}`}
      onClick={onClick}
      title="Toggle debug view"
    >
      <Braces className="h-3.5 w-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// JsonDebugPanel
// ---------------------------------------------------------------------------

type TabId = 'schema' | 'tree' | 'request' | 'response';

type JsonDebugPanelProps = {
  schema?: unknown;
  schemaTree?: SchemaNode[];
  config?: Record<string, unknown>;
  request?: unknown;
  response?: unknown;
  error?: unknown;
};

export function JsonDebugPanel({
  schema,
  schemaTree,
  config,
  request,
  response,
  error,
}: JsonDebugPanelProps) {
  // Build available tabs
  const tabs: { id: TabId; label: string }[] = [{ id: 'schema', label: 'Schema' }];
  if (schemaTree && schemaTree.length > 0) tabs.push({ id: 'tree', label: 'Tree' });
  if (request) tabs.push({ id: 'request', label: 'Request' });
  if (response || error) tabs.push({ id: 'response', label: 'Response' });

  const [activeTab, setActiveTab] = useState<TabId>('schema');
  const [copied, setCopied] = useState(false);

  // Auto-switch to Response tab when response/error arrives
  useEffect(() => {
    if (response || error) {
      setActiveTab('response');
    }
  }, [response, error]);

  // Ensure active tab is valid (if data disappears)
  const validTabIds = tabs.map((t) => t.id);
  const currentTab = validTabIds.includes(activeTab) ? activeTab : 'schema';

  // Get data for the active tab
  const getTabData = useCallback((): unknown => {
    switch (currentTab) {
      case 'schema':
        return config ? { schema, currentConfig: config } : schema;
      case 'tree':
        return schemaTree;
      case 'request':
        return request;
      case 'response':
        return error ?? response;
      default:
        return null;
    }
  }, [currentTab, schema, schemaTree, config, request, response, error]);

  const handleCopy = useCallback(() => {
    const data = getTabData();
    if (data == null) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getTabData]);

  return (
    <div className="rounded-md border border-white/10 bg-black/40 p-2">
      {/* Tab bar */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-1 mb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`nodrag text-[11px] pb-0.5 transition-colors ${
              currentTab === tab.id
                ? 'border-b-2 border-purple-400 text-purple-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="nodrag nowheel max-h-[300px] overflow-y-auto">
        {currentTab === 'response' && !!error && (
          <div className="text-red-400 text-[10px] mb-1">Error Response</div>
        )}
        {currentTab === 'tree' && schemaTree ? (
          <SchemaTreeView tree={schemaTree} />
        ) : (
          <JsonTreeView data={getTabData()} />
        )}
      </div>

      {/* Copy button — bottom left */}
      <div className="mt-1 pt-1 border-t border-white/10">
        <button
          className="nodrag text-gray-400 hover:text-gray-200 transition-colors"
          onClick={handleCopy}
          title="Copy JSON"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
