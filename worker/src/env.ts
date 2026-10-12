/** The slice of Cloudflare KV the Worker uses, so tests can use a Map. */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * Bindings and secrets. The three secrets are set with `wrangler secret put` and exist nowhere in
 * the repo or the client build; ALLOWED_ORIGINS is a plain variable in wrangler.toml.
 */
export interface Env {
  PROGRESS: KVLike;
  TRURL_APP_SECRET: string;
  ANTHROPIC_API_KEY: string;
  XAI_API_KEY: string;
  /** Comma-separated production origins, e.g. https://you.github.io */
  ALLOWED_ORIGINS?: string;
}
