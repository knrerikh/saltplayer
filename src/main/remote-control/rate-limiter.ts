interface Window {
  startedAt: number;
  requests: number;
}

/** Counts requests per key in fixed windows; a key's window is dropped once it is over. */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Number of keys with a window on record. */
  get size(): number {
    return this.windows.size;
  }

  /** Counts a request from `key`; true once it is past the limit of its window. */
  isOverLimit(key: string, now = Date.now()): boolean {
    let window = this.windows.get(key);
    if (!window || now - window.startedAt >= this.windowMs) {
      this.dropExpired(now);
      window = { startedAt: now, requests: 0 };
      this.windows.set(key, window);
    }
    window.requests += 1;
    return window.requests > this.limit;
  }

  clear(): void {
    this.windows.clear();
  }

  private dropExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
    }
  }
}
