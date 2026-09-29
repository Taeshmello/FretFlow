/** Minimal event channel: `add` returns the unsubscribe function. */
export class ListenerSet<A extends unknown[]> {
  private readonly listeners = new Set<(...args: A) => void>();

  add(listener: (...args: A) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(...args: A): void {
    for (const listener of this.listeners) {
      listener(...args);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
