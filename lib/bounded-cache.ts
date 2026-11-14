/** In-memory LRU. Eviction never mutates persisted data. */
export class BoundedCache<K, V> extends Map<K, V> {
  constructor(private readonly capacity: number) { super(); }
  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined;
    const value = super.get(key)!;
    super.delete(key);
    super.set(key, value);
    return value;
  }
  override set(key: K, value: V): this {
    super.delete(key);
    super.set(key, value);
    while (this.size > this.capacity) super.delete(this.keys().next().value!);
    return this;
  }
}
