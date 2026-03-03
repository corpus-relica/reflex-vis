export type EqualsFn<T> = (a: T, b: T) => boolean;

export class Value<T> {
  private _value: T;
  private _listeners = new Set<(value: T) => void>();
  private _equals: EqualsFn<T>;

  constructor(initial: T, equals: EqualsFn<T> = Object.is) {
    this._value = initial;
    this._equals = equals;
  }

  get(): T {
    return this._value;
  }

  set(value: T): void {
    if (this._equals(this._value, value)) return;
    this._value = value;
    for (const fn of this._listeners) fn(value);
  }

  onChange(handler: (value: T) => void): () => void {
    this._listeners.add(handler);
    return () => this._listeners.delete(handler);
  }

  dispose(): void {
    this._listeners.clear();
  }
}
