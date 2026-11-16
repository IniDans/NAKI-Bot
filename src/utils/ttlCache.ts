/**
 * Small in-memory cache with a fixed time-to-live, used for per-guild config
 * that is read on every message. Dashboard edits become visible once the
 * entry expires, so keep the TTL short.
 */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();
  private pending = new Map<string, Promise<V>>();

  constructor(
    private readonly ttlMs = 30_000,
    private readonly maxEntries = 5_000,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // Drop the oldest entry; Map iterates in insertion order.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Returns the cached value or loads it once, sharing the in-flight load between callers. */
  async getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const promise = load()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
