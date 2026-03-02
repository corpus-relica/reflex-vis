import type { ReflexEngine } from '@corpus-relica/reflex';
import { embedStyle } from './core/style.js';
import devtoolsStyles from './styles/generated.js';

export interface DevtoolsOptions {
  container?: HTMLElement;
  panels?: Array<'dag' | 'stack' | 'blackboard' | 'events'>;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  height?: number;
  collapsed?: string[];
  theme?: 'dark' | 'light' | Record<string, string>;
}

export class ReflexDevtools {
  private readonly _engine: ReflexEngine;
  private readonly _options: DevtoolsOptions;
  private _root: HTMLElement | null = null;

  constructor(engine: ReflexEngine, options: DevtoolsOptions = {}) {
    this._engine = engine;
    this._options = options;
    this._mount();
  }

  private _mount(): void {
    embedStyle(document, 'devtools', devtoolsStyles);
    const root = document.createElement('div');
    root.setAttribute('data-rx-devtools', '');
    (this._options.container ?? document.body).appendChild(root);
    this._root = root;
  }

  destroy(): void {
    this._root?.remove();
    this._root = null;
  }
}
