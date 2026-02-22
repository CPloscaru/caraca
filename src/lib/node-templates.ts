/**
 * @deprecated Use getNodeTemplates() and NodeTemplate from '@/lib/node-registry' instead.
 * This file is kept for backward compatibility during the transition.
 * All consumers have been migrated to the registry.
 */
export { getNodeTemplates as NODE_TEMPLATES_FN, type NodeTemplate } from '@/lib/node-registry';
