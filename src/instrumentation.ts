export async function register() {
  // Only warm cache on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Fire-and-forget: warm fal.ai model cache without blocking server startup
    import('./lib/models/cache-warmer').then(({ fetchAndCacheModels }) => {
      fetchAndCacheModels('text-to-image').catch((err) => {
        console.warn('[model-cache] Startup cache warm failed:', err.message);
      });
    });

    // Fire-and-forget: warm OpenRouter LLM model cache
    import('./lib/openrouter/cache-warmer').then(({ fetchAndCacheLLMModels }) => {
      fetchAndCacheLLMModels().catch((err) => {
        console.warn('[llm-cache] Startup cache warm failed:', err.message);
      });
    });
  }
}
