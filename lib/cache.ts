export class BoundedCache<T> {
  private entries = new Map<
    string,
    { value: T; expires: number; bytes: number }
  >();
  private bytes = 0;
  constructor(
    private maxEntries = 32,
    private maxBytes = 64 * 1024 * 1024,
    private ttl = 86400000,
    private now = Date.now,
  ) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.expires <= this.now()) {
      this.delete(key);
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T, bytes = 1) {
    this.delete(key);
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value, bytes, expires: this.now() + this.ttl });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes)
      this.delete(this.entries.keys().next().value!);
  }
  delete(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
}
