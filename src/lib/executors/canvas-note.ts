import type { NodeExecutor } from './types';

// Canvas note is a no-op annotation node — silently skipped during execution
export const canvasNoteExecutor: NodeExecutor = async () => ({});
