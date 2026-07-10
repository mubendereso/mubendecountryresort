type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

type AsyncTtlLruCacheOptions = {
  maxEntries: number;
  ttlMs: number;
  now?: () => number;
};

export class AsyncTtlLruCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #inFlight = new Map<string, Promise<unknown>>();
  readonly #maxEntries: number;
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor({ maxEntries, ttlMs, now = Date.now }: AsyncTtlLruCacheOptions) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error("maxEntries must be a positive integer");
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("ttlMs must be positive");
    }
    this.#maxEntries = maxEntries;
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  get size(): number {
    return this.#entries.size;
  }

  get pendingSize(): number {
    return this.#inFlight.size;
  }

  async read<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const now = this.#now();
    const hit = this.#entries.get(key);
    if (hit) {
      if (hit.expiresAt > now) {
        this.#entries.delete(key);
        this.#entries.set(key, hit);
        return hit.value as T;
      }
      this.#entries.delete(key);
    }

    const existing = this.#inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    if (this.#inFlight.size >= this.#maxEntries) {
      return loader();
    }

    const pending = loader().then((value) => {
      if (value !== null && value !== undefined) this.#store(key, value);
      return value;
    });
    this.#inFlight.set(key, pending);

    try {
      return await pending;
    } finally {
      if (this.#inFlight.get(key) === pending) this.#inFlight.delete(key);
    }
  }

  #store(key: string, value: unknown): void {
    const now = this.#now();
    for (const [entryKey, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(entryKey);
    }

    this.#entries.delete(key);
    while (this.#entries.size >= this.#maxEntries) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.#entries.delete(oldestKey);
    }
    this.#entries.set(key, { expiresAt: now + this.#ttlMs, value });
  }
}
