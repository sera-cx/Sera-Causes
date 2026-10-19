/**
 * Small in-memory TTL cache with in-flight de-duplication: concurrent callers
 * for the same key share one upstream request. Mirrors sera-mcp's TtlCache.
 * Failed loads are not cached.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string, load: () => Promise<T>, options: { fresh?: boolean } = {}): Promise<T> {
    if (!options.fresh) {
      const hit = this.entries.get(key);
      if (hit && hit.expiresAt > this.now()) return hit.value;
      const pending = this.inflight.get(key);
      if (pending) return pending;
    }
    const promise = (async () => {
      try {
        const value = await load();
        this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  peek(key: string): T | undefined {
    const hit = this.entries.get(key);
    return hit && hit.expiresAt > this.now() ? hit.value : undefined;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }
}
