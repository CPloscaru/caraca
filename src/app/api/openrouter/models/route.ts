import { createCacheRouteHandler } from '@/lib/cache/strategy';
import {
  fetchAndCacheLLMModels,
  getCachedLLMModels,
} from '@/lib/openrouter/cache-warmer';

const handler = createCacheRouteHandler({
  metadataKey: 'llm_models_fetched_at',
  fetchAndCache: fetchAndCacheLLMModels,
  getCachedData: getCachedLLMModels,
  emptyResponse: { models: [] as never[], grouped: { groups: {} } },
  logPrefix: 'llm-cache',
});

export async function GET() {
  return handler();
}
