import type { ReflexEngine, EngineEvent, EventHandler, Node, Edge, Workflow, BlackboardEntry, StackFrame, EngineSnapshot } from '@corpus-relica/reflex';
import { embedStyle } from './core/style.js';
import { resolveTheme, applyTheme, type ThemeOption } from './core/theme.js';
import { DagPanel } from './panels/dag/dag-panel.js';
import { StackPanel } from './panels/stack/stack-panel.js';
import { BlackboardPanel } from './panels/blackboard/blackboard-panel.js';
import { EventsPanel } from './panels/events/events-panel.js';
import devtoolsStyles from './styles/generated.js';

export type PanelName = 'dag' | 'stack' | 'blackboard' | 'events';

export interface DevtoolsOptions {
  container?: HTMLElement;
  panels?: PanelName[];
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  height?: number | string;
  collapsed?: PanelName[];
  theme?: ThemeOption;
}

export class ReflexDevtools {
  private readonly _engine: ReflexEngine;
  private readonly _options: DevtoolsOptions;
  private _root: HTMLElement | null = null;
  private _disposeStyle: (() => void) | null = null;

  private _dagPanel: DagPanel | null = null;
  private _stackPanel: StackPanel | null = null;
  private _blackboardPanel: BlackboardPanel | null = null;
  private _eventsPanel: EventsPanel | null = null;
  private _userFocusedWorkflowId: string | null = null;

  constructor(engine: ReflexEngine, options: DevtoolsOptions = {}) {
    this._engine = engine;
    this._options = options;
    this._mount();
    this._wireCrossPanel();
    this._subscribe();
    // Panels defer mount() via queueMicrotask, so hydration must wait
    queueMicrotask(() => this._hydrateFromSnapshot());
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
      const h = this._options.height;
      root.style.height = typeof h === 'number' ? `${h}px` : h;
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

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'rx-resize-handle';
    root.appendChild(resizeHandle);
    this._initResize(resizeHandle, root);

    // Create panels in display order
    const enabled = this._options.panels ?? ['dag', 'stack', 'blackboard', 'events'];
    const collapsed = new Set(this._options.collapsed ?? []);

    if (enabled.includes('dag')) {
      this._dagPanel = new DagPanel(root, { collapsed: collapsed.has('dag') });
    }
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

  private _initResize(handle: HTMLElement, root: HTMLElement): void {
    let startY = 0;
    let startH = 0;
    const onMouseMove = (e: MouseEvent) => {
      const dy = startY - e.clientY;
      root.style.height = `${Math.max(100, startH + dy)}px`;
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    handle.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startH = root.offsetHeight;
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
  }

  private _wireCrossPanel(): void {
    // Events panel → DAG: click node event highlights node in DAG
    this._eventsPanel?.events.on('event-click', (entry) => {
      if (!this._dagPanel) return;
      if (entry.category === 'node' && entry.type === 'node:enter') {
        this._dagPanel.highlightNode(entry.summary);
        this._dagPanel.expand();
      }
    });

    // Stack panel → DAG: click frame switches workflow view
    this._stackPanel?.events.on('frame-click', ({ workflowId }) => {
      if (!this._dagPanel) return;
      // If clicking the engine's active workflow, clear user focus (resume auto-follow)
      const snap = this._engine.snapshot();
      this._userFocusedWorkflowId = workflowId === snap.currentWorkflowId ? null : workflowId;
      this._dagPanel.switchToWorkflow(workflowId);
      this._dagPanel.expand();
    });

    // Blackboard → DAG: click source highlights node
    this._blackboardPanel?.events.on('source-click', ({ nodeId }) => {
      if (this._dagPanel) {
        this._dagPanel.highlightNode(nodeId);
        this._dagPanel.expand();
      }
    });
  }

  private _subscribe(): void {
    const on = (event: EngineEvent, handler: EventHandler) => {
      this._engine.on(event, handler);
    };

    on('node:enter', (payload) => {
      const { node, workflow } = payload as { node: Node; workflow: Workflow };
      const preserveView = this._userFocusedWorkflowId != null;
      this._dagPanel?.onNodeEnter(node, workflow, { preserveView });
      this._stackPanel?.onNodeEnter(node, workflow);
      this._eventsPanel?.onNodeEnter(node, workflow);
      if (!preserveView) {
        this._updateEdgeViability(node.id);
      }
    });

    on('node:exit', (payload) => {
      const { node, workflow } = payload as { node: Node; workflow: Workflow };
      this._dagPanel?.onNodeExit(node, workflow);
      this._eventsPanel?.onNodeExit(node, workflow);
    });

    on('edge:traverse', (payload) => {
      const { edge, workflow } = payload as { edge: Edge; workflow: Workflow };
      this._dagPanel?.onEdgeTraverse(edge, workflow);
      this._eventsPanel?.onEdgeTraverse(edge, workflow);
    });

    on('blackboard:write', (payload) => {
      const { entries, workflow } = payload as { entries: BlackboardEntry[]; workflow: Workflow };
      this._blackboardPanel?.onBlackboardWrite(entries, workflow);
      this._eventsPanel?.onBlackboardWrite(entries, workflow);
      // Re-evaluate edge viability — blackboard change may affect guard results
      this._updateEdgeViability();
    });

    on('workflow:push', (payload) => {
      const { frame, workflow } = payload as { frame: StackFrame; workflow: Workflow };
      this._dagPanel?.onWorkflowPush(frame, workflow);
      this._stackPanel?.onWorkflowPush(frame, workflow);
      this._blackboardPanel?.onWorkflowPush();
      this._eventsPanel?.onWorkflowPush(frame, workflow);
    });

    on('workflow:pop', (payload) => {
      const { frame, workflow } = payload as { frame: StackFrame; workflow: Workflow };
      const preserveView = this._userFocusedWorkflowId === workflow.id;
      // Only clear focus if the focused workflow itself was popped (not when returning to it)
      if (this._userFocusedWorkflowId === frame.workflowId) {
        this._userFocusedWorkflowId = null;
      }
      this._dagPanel?.onWorkflowPop(frame, workflow, { preserveView });
      this._stackPanel?.onWorkflowPop(frame, workflow);
      this._blackboardPanel?.onWorkflowPop();
      this._eventsPanel?.onWorkflowPop(frame, workflow);
    });

    on('stack:unwind' as EngineEvent, (payload) => {
      const { discardedFrames, targetDepth, restoredWorkflow, restoredNode } =
        payload as { discardedFrames: StackFrame[]; targetDepth: number;
                     restoredWorkflow: Workflow; restoredNode: Node; reinvoke: boolean };

      // Clear user focus if the focused workflow was discarded
      if (this._userFocusedWorkflowId) {
        const discardedIds = new Set(discardedFrames.map((f: StackFrame) => f.workflowId));
        if (discardedIds.has(this._userFocusedWorkflowId)) {
          this._userFocusedWorkflowId = null;
        }
      }

      this._stackPanel?.onStackUnwind(discardedFrames, restoredWorkflow, restoredNode);
      this._eventsPanel?.onStackUnwind(discardedFrames, targetDepth, restoredWorkflow);
      this._blackboardPanel?.update(this._engine.snapshot());

      // Switch DAG to restored workflow (same pattern as workflow:pop)
      if (!this._userFocusedWorkflowId && this._dagPanel) {
        this._dagPanel.switchToWorkflow(restoredWorkflow.id);
      }
    });

    on('engine:complete', (payload) => {
      const { workflow } = payload as { workflow: Workflow };
      this._stackPanel?.onEngineComplete(workflow);
      this._eventsPanel?.onEngineComplete(workflow);
    });

    on('engine:suspend', (payload) => {
      const { reason } = payload as { reason: string };
      this._stackPanel?.onEngineSuspend(reason);
      this._eventsPanel?.onEngineSuspend(reason);
    });

    on('session:reset' as EngineEvent, () => {
      this._userFocusedWorkflowId = null;
      this._stackPanel?.resetSession();
      this._hydrateFromSnapshot();
    });
  }

  private _updateEdgeViability(nodeId?: string): void {
    if (!this._dagPanel) return;
    const engine = this._engine as any;
    const validEdges: Edge[] | undefined = engine.validEdges?.();
    if (!validEdges) return;
    const validIds = new Set(validEdges.map((e: Edge) => e.id));
    // Use provided nodeId or fall back to engine's current node
    const currentNode = nodeId ?? engine.snapshot?.()?.currentNodeId;
    if (currentNode) {
      this._dagPanel.showEdgeViability(currentNode, validIds);
    }
  }

  private _hydrateFromSnapshot(): void {
    try {
      const snap: EngineSnapshot = this._engine.snapshot();
      this._dagPanel?.update(snap);
      this._stackPanel?.update(snap);
      this._blackboardPanel?.update(snap);
      this._eventsPanel?.update(snap);

      // Show current workflow graph via public API
      if (snap.currentWorkflowId && this._dagPanel) {
        const engine = this._engine as any;
        const workflow = engine.currentWorkflow?.() ?? engine._registry?.get?.(snap.currentWorkflowId);
        if (workflow) {
          this._dagPanel.showWorkflow(workflow);
        }
      }
    } catch {
      // Engine not initialized yet — no snapshot available
    }
  }

  // Programmatic control
  collapse(): void {
    this._dagPanel?.collapse();
    this._stackPanel?.collapse();
    this._blackboardPanel?.collapse();
    this._eventsPanel?.collapse();
  }

  expand(): void {
    this._dagPanel?.expand();
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
      case 'dag': return this._dagPanel;
      case 'stack': return this._stackPanel;
      case 'blackboard': return this._blackboardPanel;
      case 'events': return this._eventsPanel;
      default: return null;
    }
  }

  destroy(): void {
    this._dagPanel?.destroy();
    this._stackPanel?.destroy();
    this._blackboardPanel?.destroy();
    this._eventsPanel?.destroy();
    this._dagPanel = null;
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
export { DagPanel } from './panels/dag/dag-panel.js';
export { StackPanel } from './panels/stack/stack-panel.js';
export { BlackboardPanel } from './panels/blackboard/blackboard-panel.js';
export { EventsPanel } from './panels/events/events-panel.js';
export { computeLayout, clearLayoutCache } from './panels/dag/dag-layout.js';
export { DagRenderer } from './panels/dag/dag-renderer.js';
export { Viewport } from './panels/dag/viewport.js';
export type { PanelOptions } from './panels/panel.js';
export type { ThemeOption } from './core/theme.js';
export type { Handler } from './core/emitter.js';
export type { EqualsFn } from './core/value.js';
export type { LayoutNode, LayoutEdge, LayoutResult } from './panels/dag/dag-layout.js';
