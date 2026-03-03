export type Handler<T = unknown> = (data: T) => void;

export class Emitter<Events extends Record<string, unknown> = Record<string, unknown>> {
  private _map = new Map<keyof Events, Set<Handler<any>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this._map.get(event);
    if (!set) {
      set = new Set();
      this._map.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this._map.get(event)?.delete(handler);
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const set = this._map.get(event);
    if (set) {
      for (const handler of set) handler(data);
    }
  }

  dispose(): void {
    this._map.clear();
  }
}
