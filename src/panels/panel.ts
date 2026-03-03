import { Value } from '../core/value.js';
import { className } from '../core/class-name.js';
import { el } from '../core/dom.js';

export interface PanelOptions {
  collapsed?: boolean;
}

export abstract class Panel {
  readonly element: HTMLElement;
  readonly collapsed: Value<boolean>;
  private readonly _header: HTMLElement;
  private readonly _body: HTMLElement;
  private readonly _disposers: Array<() => void> = [];

  abstract readonly name: string;
  abstract readonly label: string;

  constructor(container: HTMLElement, options: PanelOptions = {}) {
    this.collapsed = new Value(options.collapsed ?? false);

    // Outer wrapper
    this.element = el('div', { class: className('panel') });

    // Header bar — click to toggle collapse
    this._header = el('div', { class: className('panel', 'header') });
    const title = el('span', { class: className('panel', 'title') });
    this._header.appendChild(title);
    this._header.addEventListener('click', () => this.toggle());
    this.element.appendChild(this._header);

    // Content body
    this._body = el('div', { class: className('panel', 'body') });
    this.element.appendChild(this._body);

    // React to collapsed state
    const unsub = this.collapsed.onChange((c) => this._applyCollapsed(c));
    this._disposers.push(unsub);

    container.appendChild(this.element);

    // Defer so subclass constructor finishes before we read .label/.name
    queueMicrotask(() => {
      title.textContent = this.label;
      this.element.setAttribute('data-panel', this.name);
      this._applyCollapsed(this.collapsed.get());
      this.mount(this._body);
    });
  }

  private _applyCollapsed(c: boolean): void {
    this.element.classList.toggle(className('panel', '', 'collapsed'), c);
  }

  protected get body(): HTMLElement {
    return this._body;
  }

  abstract mount(body: HTMLElement): void;
  abstract update(snapshot: unknown): void;

  collapse(): void { this.collapsed.set(true); }
  expand(): void { this.collapsed.set(false); }
  toggle(): void { this.collapsed.set(!this.collapsed.get()); }

  destroy(): void {
    for (const fn of this._disposers) fn();
    this._disposers.length = 0;
    this.collapsed.dispose();
    this.element.remove();
  }
}
