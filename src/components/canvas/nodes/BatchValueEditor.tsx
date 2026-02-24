'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, Pencil, X, Plus, ChevronLeft } from 'lucide-react';

type BatchValueEditorProps = {
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
};

export function BatchValueEditor({ values, onChange, disabled }: BatchValueEditorProps) {
  const [mode, setMode] = useState<'textarea' | 'table'>(
    values.length > 0 ? 'table' : 'textarea',
  );
  const [textareaValue, setTextareaValue] = useState(values.join('\n'));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse textarea content into values array
  const parseTextarea = useCallback(
    (text: string): string[] =>
      text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [],
  );

  // Count values in current textarea content
  const textareaCount = parseTextarea(textareaValue).length;

  // Apply textarea values
  const handleApply = useCallback(() => {
    const parsed = parseTextarea(textareaValue);
    if (parsed.length === 0) return;
    onChange(parsed);
    setMode('table');
  }, [textareaValue, onChange, parseTextarea]);

  // Parse file content
  const parseFileContent = useCallback(
    (content: string, fileName: string): string[] => {
      const isCsv =
        fileName.endsWith('.csv') || fileName.endsWith('.CSV');
      if (isCsv) {
        return content
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return '';
            // Take first column, handle quoted values
            if (trimmed.startsWith('"')) {
              const endQuote = trimmed.indexOf('"', 1);
              if (endQuote > 0) return trimmed.slice(1, endQuote);
            }
            const comma = trimmed.indexOf(',');
            return comma >= 0 ? trimmed.slice(0, comma).trim() : trimmed;
          })
          .filter(Boolean);
      }
      // TXT: split by newlines
      return content
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    },
    [],
  );

  // Handle file import
  const handleFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (!content) return;
        const parsed = parseFileContent(content, file.name);
        if (parsed.length > 0) {
          if (mode === 'table' && values.length > 0) {
            onChange([...values, ...parsed]);
          } else {
            onChange(parsed);
          }
          setMode('table');
        }
      };
      reader.readAsText(file);

      // Reset input so same file can be re-imported
      e.target.value = '';
    },
    [mode, values, onChange, parseFileContent],
  );

  // Table mode handlers
  const handleDelete = useCallback(
    (index: number) => {
      const newValues = values.filter((_, i) => i !== index);
      onChange(newValues);
      if (newValues.length === 0) {
        setTextareaValue('');
        setMode('textarea');
      }
    },
    [values, onChange],
  );

  const handleEdit = useCallback(
    (index: number) => {
      setEditingIndex(index);
      setEditValue(values[index]);
    },
    [values],
  );

  const handleEditSave = useCallback(() => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      // Empty value = delete
      handleDelete(editingIndex);
    } else {
      const newValues = [...values];
      newValues[editingIndex] = trimmed;
      onChange(newValues);
    }
    setEditingIndex(null);
    setEditValue('');
  }, [editingIndex, editValue, values, onChange, handleDelete]);

  const handleEditCancel = useCallback(() => {
    setEditingIndex(null);
    setEditValue('');
  }, []);

  const handleAdd = useCallback(() => {
    const newValues = [...values, ''];
    onChange(newValues);
    setEditingIndex(newValues.length - 1);
    setEditValue('');
  }, [values, onChange]);

  const handleBackToTextarea = useCallback(() => {
    setTextareaValue(values.join('\n'));
    setMode('textarea');
  }, [values]);

  // File import button (shared between modes)
  const fileImportButton = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,.text"
        className="hidden"
        onChange={handleFileImport}
        disabled={disabled}
      />
      <button
        className="nodrag flex h-6 w-6 items-center justify-center rounded bg-white/5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        title="Import from CSV/TXT file"
      >
        <Upload className="h-3 w-3" />
      </button>
    </>
  );

  if (mode === 'textarea') {
    return (
      <div className="space-y-1.5">
        <textarea
          className="nodrag nowheel nopan w-full resize-none rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-white/20"
          placeholder="Enter values, one per line..."
          rows={4}
          value={textareaValue}
          onChange={(e) => setTextareaValue(e.target.value)}
          disabled={disabled}
        />
        <div className="flex items-center gap-1.5">
          <button
            className="nodrag rounded bg-teal-600 px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleApply}
            disabled={disabled || textareaCount === 0}
          >
            Apply
          </button>
          {fileImportButton}
          {textareaCount > 0 && (
            <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-400">
              {textareaCount} value{textareaCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Table mode
  return (
    <div className="space-y-1.5">
      {/* Value count badge */}
      <div className="flex items-center justify-between">
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-400">
          {values.length} value{values.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1">
          {fileImportButton}
        </div>
      </div>

      {/* Table */}
      <div className="max-h-32 overflow-y-auto rounded-md border border-white/10 bg-white/[0.02]">
        {values.map((value, index) => (
          <div
            key={index}
            className="flex items-center gap-1.5 border-b border-white/5 px-2 py-1 last:border-b-0"
          >
            <span className="w-5 shrink-0 text-[10px] text-gray-600">
              {index + 1}.
            </span>
            {editingIndex === index ? (
              <input
                className="nodrag nowheel nopan min-w-0 flex-1 rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-teal-500"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEditSave();
                  if (e.key === 'Escape') handleEditCancel();
                }}
                onBlur={handleEditSave}
                autoFocus
                disabled={disabled}
              />
            ) : (
              <span
                className="min-w-0 flex-1 truncate text-xs text-gray-300"
                title={value}
              >
                {value || <span className="italic text-gray-600">empty</span>}
              </span>
            )}
            {editingIndex !== index && (
              <>
                <button
                  className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => handleEdit(index)}
                  disabled={disabled}
                  title="Edit"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => handleDelete(index)}
                  disabled={disabled}
                  title="Delete"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add + Back to textarea */}
      <div className="flex items-center gap-1.5">
        <button
          className="nodrag flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleAdd}
          disabled={disabled}
        >
          <Plus className="h-2.5 w-2.5" />
          Add
        </button>
        <button
          className="nodrag flex items-center gap-1 text-[10px] text-gray-500 transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleBackToTextarea}
          disabled={disabled}
        >
          <ChevronLeft className="h-2.5 w-2.5" />
          Textarea
        </button>
      </div>
    </div>
  );
}
