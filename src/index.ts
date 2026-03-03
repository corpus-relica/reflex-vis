import type { ReflexEngine, EngineEvent, EventHandler, Node, Edge, Workflow, BlackboardEntry, StackFrame, EngineSnapshot } from '@corpus-relica/reflex';
import { embedStyle } from './core/style.js';
import { resolveTheme, applyTheme, type ThemeOption } from './core/theme.js';
import { StackPanel } from './panels/stack/stack-panel.js';
import { BlackboardPanel } from './panels/blackboard/blackboard-panel.js';
import { EventsPanel } from './panels/events/events-panel.js';
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

  private _stackPanel: StackPanel | null = null;
  private _blackboardPanel: BlackboardPanel | null = null;
  private _eventsPanel: EventsPanel | null = null;

  constructor(engine: ReflexEngine, options: DevtoolsOptions = {}) {
    this._engine = engine;
    this._options = options;
    this._mount();
    this._subscribe();
    this._hydrateFromSnapshot();
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

    // Create panels
    const enabled = this._options.panels ?? ['dag', 'stack', 'blackboard', 'events'];
    const collapsed = new Set(this._options.collapsed ?? []);

    // DAG panel placeholder — will be added in future issue
    if (enabled.includes('stack')) {
      this._stackPanel = new StackPanel(root, { collapsed: collapsed.has('stack') });
    }
    if (enabled.includes('blackboard')) {
      this._blackboardPanel = new BlackboardPanel(root, { collapsed: collapsed.has('blackboard') });
    }
    if (enabled.includes('events')) {
      this._eventsPanel = new EventsPanel(root, { collapsed: collapsed.has('events') });
    }
  }

  private _subscribe(): void {
    const on = (event: EngineEvent, handler: EventHandler) => {
      this._engine.on(event, handler);
    };

    on('node:enter', (payload) => {
      const { node, workflow } = payload as { node: Node; workflow: Workflow };
      this._stackPanel?.onNodeEnter(node, workflow);
      this._eventsPanel?.onNodeEnter(node, workflow);
    });

    on('node:exit', (payload) => {
      const { node, workflow } = payload as { node: Node; workflow: Workflow };
      this._eventsPanel?.onNodeExit(node, workflow);
    });

    on('edge:traverse', (payload) => {
      const { edge, workflow } = payload as { edge: Edge; workflow: Workflow };
      this._eventsPanel?.onEdgeTraverse(edge, workflow);
    });

    on('blackboard:write', (payload) => {
      const { entries, workflow } = payload as { entries: BlackboardEntry[]; workflow: Workflow };
      this._blackboardPanel?.onBlackboardWrite(entries, workflow);
      this._eventsPanel?.onBlackboardWrite(entries, workflow);
    });

    on('workflow:push', (payload) => {
      const { frame, workflow } = payload as { frame: StackFrame; workflow: Workflow };
      this._stackPanel?.onWorkflowPush(frame, workflow);
      this._blackboardPanel?.onWorkflowPush();
      this._eventsPanel?.onWorkflowPush(frame, workflow);
    });

    on('workflow:pop', (payload) => {
      const { frame, workflow } = payload as { frame: StackFrame; workflow: Workflow };
      this._stackPanel?.onWorkflowPop(frame, workflow);
      this._blackboardPanel?.onWorkflowPop();
      this._eventsPanel?.onWorkflowPop(frame, workflow);
    });

    on('engine:complete', (payload) => {
      const { workflow } = payload as { workflow: Workflow };
      this._eventsPanel?.onEngineComplete(workflow);
    });

    on('engine:suspend', (payload) => {
      const { reason } = payload as { reason: string };
      this._eventsPanel?.onEngineSuspend(reason);
    });
  }

  private _hydrateFromSnapshot(): void {
    try {
      const snap: EngineSnapshot = this._engine.snapshot();
      this._stackPanel?.update(snap);
      this._blackboardPanel?.update(snap);
      this._eventsPanel?.update(snap);
    } catch {
      // Engine not initialized yet — no snapshot available
    }
  }

  // Programmatic control
  collapse(): void {
    this._stackPanel?.collapse();
    this._blackboardPanel?.collapse();
    this._eventsPanel?.collapse();
  }

  expand(): void {
    this._stackPanel?.expand();
    this._blackboardPanel?.expand();
    this._eventsPanel?.expand();
  }

  showPanel(name: PanelName): void {
    this._getPanel(name)?.expand();
  }

  hidePanel(name: PanelName): void {
    this._getPanel(name)?.collapse();
  }

  private _getPanel(name: PanelName) {
    switch (name) {
      case 'stack': return this._stackPanel;
      case 'blackboard': return this._blackboardPanel;
      case 'events': return this._eventsPanel;
      default: return null;
    }
  }

  destroy(): void {
    // No engine.off() — handlers persist, but we null out references
    this._stackPanel?.destroy();
    this._blackboardPanel?.destroy();
    this._eventsPanel?.destroy();
    this._stackPanel = null;
    this._blackboardPanel = null;
    this._eventsPanel = null;
    this._root?.remove();
    this._root = null;
    this._disposeStyle?.();
    this._disposeStyle = null;
  }
}

// Core utilities
export { className } from './core/class-name.js';
export { embedStyle } from './core/style.js';
export { resolveTheme, applyTheme } from './core/theme.js';
export { el, text, remove } from './core/dom.js';
export { Emitter } from './core/emitter.js';
export { Value } from './core/value.js';
export { Panel } from './panels/panel.js';
export { StackPanel } from './panels/stack/stack-panel.js';
export { BlackboardPanel } from './panels/blackboard/blackboard-panel.js';
export { EventsPanel } from './panels/events/events-panel.js';
export type { PanelOptions } from './panels/panel.js';
export type { ThemeOption } from './core/theme.js';
export type { Handler } from './core/emitter.js';
export type { EqualsFn } from './core/value.js';
