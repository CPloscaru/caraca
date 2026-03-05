'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  getNodeTemplates,
  groupBySubcategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type NodeCategory,
  type NodeTemplate,
} from '@/lib/node-registry';
import { useAppStore } from '@/stores/app-store';

type CommandPaletteProps = {
  onAddNode: (template: NodeTemplate) => void;
};

export function CommandPalette({ onAddNode }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeCommandPalette = useAppStore((s) => s.closeCommandPalette);

  const templates = useMemo(() => getNodeTemplates(), []);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        (t.subcategory && t.subcategory.toLowerCase().includes(q)),
    );
  }, [templates, search]);

  const grouped = useMemo(() => {
    const map = new Map<NodeCategory, NodeTemplate[]>();
    for (const t of filtered) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return [...map.entries()].sort(([a], [b]) => CATEGORY_ORDER[a] - CATEGORY_ORDER[b]);
  }, [filtered]);

  // Flat list for keyboard navigation (preserves grouped order)
  const flatList = useMemo(() => grouped.flatMap(([, templates]) => templates), [grouped]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Autofocus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click-outside dismissal
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as HTMLElement)) {
        closeCommandPalette();
      }
    }
    // Delay to avoid the triggering click itself
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClickOutside);
    });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [closeCommandPalette]);

  const handleSelect = useCallback(
    (template: NodeTemplate) => {
      onAddNode(template);
      closeCommandPalette();
    },
    [onAddNode, closeCommandPalette],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(flatList.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + flatList.length) % Math.max(flatList.length, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatList[selectedIndex]) {
          handleSelect(flatList[selectedIndex]);
        }
      }
    },
    [flatList, selectedIndex, handleSelect, closeCommandPalette],
  );

  // Track flat index across grouped rendering
  let flatIdx = 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 120,
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: 400,
          maxHeight: 380,
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'flex-start',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={{ padding: '12px 12px 8px' }}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            style={{
              width: '100%',
              background: '#111',
              border: '1px solid #333',
              borderRadius: 8,
              color: '#f3f4f6',
              fontSize: 14,
              padding: '8px 12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', padding: '0 4px 4px' }}>
          {flatList.length === 0 && (
            <div style={{ padding: '12px 16px', color: '#666', fontSize: 13 }}>
              No matching nodes
            </div>
          )}
          {grouped.map(([category, categoryTemplates]) => {
            const hasSubcategories = categoryTemplates.some((t) => t.subcategory);
            const subGroups = hasSubcategories
              ? groupBySubcategory(categoryTemplates)
              : [[undefined, categoryTemplates] as [string | undefined, NodeTemplate[]]];

            return (
              <div key={category}>
                <div
                  style={{
                    padding: '8px 12px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#6b7280',
                  }}
                >
                  {CATEGORY_LABELS[category]}
                </div>
                {subGroups.map(([sub, subTemplates]) => (
                  <div key={sub ?? '_default'}>
                    {sub && (
                      <div
                        style={{
                          padding: '4px 12px 2px',
                          fontSize: 9,
                          color: '#555',
                          fontWeight: 500,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {sub}
                      </div>
                    )}
                    {subTemplates.map((template) => {
                      const idx = flatIdx++;
                      return (
                        <button
                          key={template.nodeType}
                          onClick={() => handleSelect(template)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 12px',
                            background: idx === selectedIndex ? '#2a2a2a' : 'transparent',
                            border: 'none',
                            borderTop: '1px solid #222',
                            color: '#f3f4f6',
                            cursor: 'pointer',
                            textAlign: 'left',
                            borderRadius: idx === selectedIndex ? 6 : 0,
                            transition: 'background 0.1s ease',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{template.label}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            {template.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
