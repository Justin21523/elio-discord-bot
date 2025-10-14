// /src/config.js
// English-only code & comments.
//
// Centralized runtime configuration for the Discord bot and the AI sidecar.
// Reads from process.env, provides sane defaults for local dev.
// IMPORTANT: Do not log secrets.

function n(v, d) { const x = Number(v); return Number.isFinite(x) ? x : d; }

export const CONFIG = Object.freeze({
  // --- Discord / App ---
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  APP_ID: process.env.APP_ID,
  GUILD_ID_DEV: process.env.GUILD_ID_DEV,

  // --- MongoDB ---
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  DB_NAME: process.env.DB_NAME || 'communiverse_bot',

  // --- Game / Points ---
  GAME_MAX_JOINS: n(process.env.GAME_MAX_JOINS, 10),

  // --- AI sidecar (HTTP) ---
  ai: {
    enabled: String(process.env.AI_ENABLED || 'true') === 'true',
    baseUrl: (process.env.AI_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, ''),
    timeoutMs: n(process.env.AI_API_TIMEOUT_MS, 15000),
    retryAttempts: n(process.env.AI_API_RETRY_ATTEMPTS, 2),
    retryBackoffMs: n(process.env.AI_API_RETRY_BACKOFF_MS, 400),
    backend: process.env.AI_BACKEND || 'python', // only a label for logs
  },

  // --- Observability ---
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  METRICS_ENABLED: String(process.env.METRICS_ENABLED || 'true') === 'true',

  // --- LLM (OpenAI-compatible endpoint like vLLM/TGI/Ollama proxy) ---
  llm: {
    apiBase: (process.env.LLM_API_BASE || 'http://localhost:11434/v1/').replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY || 'ollama', // some endpoints don’t need real keys
    // Model preference order; the sidecar can still override based on availability.
    model: process.env.LLM_MODEL || process.env.LLM__MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    // Optional “reasoning” model (will be used by /agent when requested)
    reasoningModel: process.env.LLM_REASONING_MODEL || '',
    maxNewTokens: n(process.env.LLM_MAX_NEW_TOKENS, 512),
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.7),
    topP: Number(process.env.LLM_TOP_P ?? 0.9),
    topK: n(process.env.LLM_TOP_K, 50),
    timeoutMs: n(process.env.LLM_TIMEOUT_MS, 30000),
    // Adapter hints for sidecar selection: tgi | vllm | ollama | mock
    adapter: (process.env.LLM_ADAPTER || 'tgi').toLowerCase(),
  },

  // --- VLM (Vision models) ---
  vlm: {
    apiBase: (process.env.VLM_API_BASE || 'http://localhost:11434/v1/').replace(/\/+$/, ''),
    apiKey: process.env.VLM_API_KEY || 'ollama',
    model: process.env.VLM_MODEL || 'llava-1.6',
    timeoutMs: n(process.env.VLM_TIMEOUT_MS, 45000),
    // Feature toggles for preprocessing/quality analysis
    enhanceImage: String(process.env.VLM_ENHANCE_IMAGE || 'true') === 'true',
    analyzeQuality: String(process.env.VLM_ANALYZE_QUALITY || 'false') === 'false' ? false : true,
  },

  // --- Embeddings ---
  embeddings: {
    apiBase: (process.env.EMBEDDINGS_API_BASE || 'http://localhost:8000').replace(/\/+$/, ''),
    model: process.env.EMBEDDINGS_MODEL || 'bge-m3',
    // known dims: bge-m3: 1024, gte-large-zh-en: 1024, e5-large-v2: 1024, all-MiniLM-L6-v2: 384
    dim: n(process.env.EMBEDDINGS_DIM, 1024),
    timeoutMs: n(process.env.EMBEDDINGS_TIMEOUT_MS, 10000),
  },

  // --- Web Search (agent tool) ---
  webSearch: {
    provider: (process.env.WEB_SEARCH_PROVIDER || 'brave').toLowerCase(), // 'brave' | 'serpapi' | 'searxng'
    braveApiKey: process.env.BRAVE_API_KEY || '',
    baseUrl: (process.env.SEARXNG_BASE_URL || 'http://localhost:8888').replace(/\/+$/, ''),
    timeoutMs: n(process.env.WEB_SEARCH_TIMEOUT_MS, 10000),
    cacheTtl: n(process.env.WEB_SEARCH_CACHE_TTL, 3600),
  },

  // --- RAG ---
  rag: {
    enabled: String(process.env.RAG_ENABLED || 'true') === 'true',
    indexName: process.env.RAG_INDEX_NAME || 'rag_vector_index',
    // retrieval mode: 'hybrid' | 'semantic' | 'bm25' | 'cosine' (fallback)
    defaultMode: (process.env.RAG_DEFAULT_MODE || 'hybrid').toLowerCase(),
    topK: n(process.env.RAG_TOP_K, 8),
    mmrAlpha: Number(process.env.RAG_MMR_ALPHA ?? 0.7),
    chunkSize: n(process.env.RAG_CHUNK_SIZE, 700),
    chunkOverlap: n(process.env.RAG_CHUNK_OVERLAP, 120),
    provider: (process.env.RAG_PROVIDER || 'atlas').toLowerCase(), // 'atlas' | 'faiss'
  },

  // --- Metrics HTTP ---
  METRICS_PORT: n(process.env.METRICS_PORT, 9090),
});
