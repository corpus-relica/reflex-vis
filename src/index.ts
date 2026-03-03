import type { ReflexEngine } from '@corpus-relica/reflex';
import { embedStyle } from './core/style.js';
import { resolveTheme, applyTheme, type ThemeOption } from './core/theme.js';
import devtoolsStyles from './styles/generated.js';

export type PanelName = 'dag' | 'stack' | 'blackboard' | 'events';

export interface DevtoolsOptions {
  container?: HTMLElement;
  panels?: PanelName[];
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  height?: number;
  collapsed?: PanelName[];
  theme?: ThemeOption;
}

export class ReflexDevtools {
  private readonly _engine: ReflexEngine;
  private readonly _options: DevtoolsOptions;
  private _root: HTMLElement | null = null;
  private _disposeStyle: (() => void) | null = null;

  constructor(engine: ReflexEngine, options: DevtoolsOptions = {}) {
    this._engine = engine;
    this._options = options;
    this._mount();
  }

  get engine(): ReflexEngine { return this._engine; }
  get root(): HTMLElement | null { return this._root; }

  private _mount(): void {
    this._disposeStyle = embedStyle(devtoolsStyles, 'devtools');
    const root = document.createElement('div');
    root.setAttribute('data-rx-devtools', '');

    const theme = resolveTheme(this._options.theme);
    applyTheme(root, theme);

    if (this._options.height) {
      root.style.height = `${this._options.height}px`;
    }

    // Fixed overlay vs embedded
    if (!this._options.container) {
      root.classList.add('rx-container-fixed');
      const pos = this._options.position ?? 'top-right';
      root.classList.add(`rx-pos-${pos}`);
      document.body.appendChild(root);
    } else {
      this._options.container.appendChild(root);
    }

    this._root = root;
  }

  destroy(): void {
    this._root?.remove();
    this._root = null;
    this._disposeStyle?.();
    this._disposeStyle = null;
  }
}

export { className } from './core/class-name.js';
export { embedStyle } from './core/style.js';
export { resolveTheme, applyTheme } from './core/theme.js';
export { el, text, remove } from './core/dom.js';
export { Emitter } from './core/emitter.js';
export { Value } from './core/value.js';
export { Panel } from './panels/panel.js';
export type { PanelOptions } from './panels/panel.js';
export type { ThemeOption } from './core/theme.js';
export type { Handler } from './core/emitter.js';
export type { EqualsFn } from './core/value.js';
