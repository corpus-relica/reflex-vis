import type { Workflow, Node, Edge, StackFrame, EngineSnapshot } from '@corpus-relica/reflex';
import { Panel, type PanelOptions } from '../panel.js';
import { className } from '../../core/class-name.js';
import { el } from '../../core/dom.js';
import { Emitter } from '../../core/emitter.js';
import { computeLayout, type LayoutResult } from './dag-layout.js';
import { DagRenderer } from './dag-renderer.js';
import { Viewport } from './viewport.js';

export interface DagPanelEvents {
  'node-click': { nodeId: string; workflowId: string };
  [key: string]: unknown;
}

export class DagPanel extends Panel {
  readonly name = 'dag';
  readonly label = 'DAG';
  readonly events = new Emitter<DagPanelEvents>();

  private _renderer: DagRenderer | null = null;
  private _viewport: Viewport | null = null;
  private _currentLayout: LayoutResult | null = null;
  private _currentWorkflowId: string | null = null;
  private _breadcrumb: HTMLElement | null = null;
  private _workflowStack: string[] = [];
  private _activeNodeId: string | null = null;

  constructor(container: HTMLElement, options?: PanelOptions) {
    super(container, options);
  }

  mount(body: HTMLElement): void {
    // Breadcrumb trail
    this._breadcrumb = el('div', { class: className('dag', 'breadcrumb') });
    body.appendChild(this._breadcrumb);

    // SVG container
    const svgContainer = el('div', { class: className('dag', 'viewport') });
    body.appendChild(svgContainer);

    this._renderer = new DagRenderer(svgContainer);
    this._viewport = new Viewport(this._renderer.svg, this._renderer.contentGroup);

    // Node click handler
    this._renderer.svg.addEventListener('click', (e) => {
      const target = (e.target as Element).closest(`[data-id]`);
      if (!target) return;
      const nodeId = target.getAttribute('data-id');
      if (nodeId && this._currentWorkflowId) {
        this.events.emit('node-click', { nodeId, workflowId: this._currentWorkflowId });
      }
    });
  }

  update(snapshot: unknown): void {
    const snap = snapshot as EngineSnapshot | null;
    if (!snap) return;

    // Build workflow stack from snapshot
    this._workflowStack = [];
    if (snap.stack) {
      for (let i = snap.stack.length - 1; i >= 0; i--) {
        this._workflowStack.push(snap.stack[i].workflowId);
      }
    }
    this._workflowStack.push(snap.currentWorkflowId);
    this._currentWorkflowId = snap.currentWorkflowId;
    this._activeNodeId = snap.currentNodeId;

    this._updateBreadcrumb();
  }

  showWorkflow(workflow: Workflow): void {
    this._currentWorkflowId = workflow.id;
    const layout = computeLayout(workflow);
    this._currentLayout = layout;

    if (this._renderer) {
      this._renderer.render(layout);

      // Fit after a tick to ensure SVG has dimensions
      requestAnimationFrame(() => {
        this._viewport?.fitToContent(layout.width, layout.height);
      });
    }
  }

  onNodeEnter(node: Node, workflow: Workflow): void {
    // If viewing a different workflow, switch to this one
    if (this._currentWorkflowId !== workflow.id) {
      this.showWorkflow(workflow);
    }

    // Deactivate previous active node
    if (this._activeNodeId && this._renderer) {
      this._renderer.setNodeState(this._activeNodeId, 'visited');
    }

    // Activate new node
    this._activeNodeId = node.id;
    this._renderer?.setNodeState(node.id, 'active');
  }

  onNodeExit(node: Node, _workflow: Workflow): void {
    this._renderer?.setNodeState(node.id, 'visited');
    if (this._activeNodeId === node.id) {
      this._activeNodeId = null;
    }
  }

  onEdgeTraverse(edge: Edge, _workflow: Workflow): void {
    if (!this._renderer) return;
    const edgeId = this._renderer.findEdge(edge.from, edge.to) ?? edge.id;
    this._renderer.setEdgeState(edgeId, 'active');
    // Briefly active, then traveled
    setTimeout(() => {
      this._renderer?.setEdgeState(edgeId, 'traveled');
    }, 300);
  }

  onWorkflowPush(_frame: StackFrame, childWorkflow: Workflow): void {
    this._workflowStack.push(childWorkflow.id);
    this._currentWorkflowId = childWorkflow.id;
    this._activeNodeId = null;
    this.showWorkflow(childWorkflow);
    this._updateBreadcrumb();
  }

  onWorkflowPop(_frame: StackFrame, parentWorkflow: Workflow): void {
    this._workflowStack.pop();
    this._currentWorkflowId = parentWorkflow.id;
    this._activeNodeId = null;
    this.showWorkflow(parentWorkflow);
    this._updateBreadcrumb();
  }

  private _updateBreadcrumb(): void {
    if (!this._breadcrumb) return;
    this._breadcrumb.innerHTML = '';
    for (let i = 0; i < this._workflowStack.length; i++) {
      if (i > 0) {
        const sep = el('span', { class: className('dag', 'breadcrumb-sep') });
        sep.textContent = ' \u203A ';
        this._breadcrumb.appendChild(sep);
      }
      const item = el('span', {
        class: className('dag', 'breadcrumb-item') +
          (i === this._workflowStack.length - 1 ? ` ${className('dag', 'breadcrumb-item', 'current')}` : ''),
      });
      item.textContent = this._workflowStack[i];
      this._breadcrumb.appendChild(item);
    }
  }

  highlightNode(nodeId: string): void {
    if (!this._renderer) return;
    this._renderer.setNodeState(nodeId, 'active');
    setTimeout(() => {
      const current = this._activeNodeId === nodeId ? 'active' : 'visited';
      this._renderer?.setNodeState(nodeId, current);
    }, 1500);
  }

  destroy(): void {
    this._viewport?.destroy();
    this._renderer?.destroy();
    this.events.dispose();
    super.destroy();
  }
}
