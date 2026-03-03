import type { Workflow, Node, Edge, StackFrame, EngineSnapshot } from '@corpus-relica/reflex';
import { Panel, type PanelOptions } from '../panel.js';
import { className } from '../../core/class-name.js';
import { el } from '../../core/dom.js';
import { Emitter } from '../../core/emitter.js';
import { computeLayout, type LayoutResult } from './dag-layout.js';
import { DagRenderer } from './dag-renderer.js';
import { Viewport } from './viewport.js';
import { Minimap } from './minimap.js';

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
  private _minimap: Minimap | null = null;
  private _currentLayout: LayoutResult | null = null;
  private _currentWorkflowId: string | null = null;
  private _breadcrumb: HTMLElement | null = null;
  private _workflowStack: string[] = [];
  private _activeNodeId: string | null = null;

  // Per-workflow traversal history (survives workflow push/pop)
  private _visitedNodes = new Map<string, Set<string>>();
  private _traveledEdges = new Map<string, Set<string>>();
  private _workflowCache = new Map<string, Workflow>();

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

    // Minimap
    this._minimap = new Minimap(svgContainer, (dx, dy) => this._viewport?.pan(dx, dy));
    this._viewport.onTransformChange((t) => {
      this._minimap?.setSvgRect(this._renderer!.svg.getBoundingClientRect());
      this._minimap?.onTransformChange(t);
    });

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
    this._workflowCache.set(workflow.id, workflow);
    this._currentWorkflowId = workflow.id;
    const layout = computeLayout(workflow);
    this._currentLayout = layout;

    if (this._renderer) {
      this._renderer.render(layout);
      this._replayTraversalHistory(workflow.id);
      this._minimap?.setLayout(layout);

      // Fit after a tick to ensure SVG has dimensions
      requestAnimationFrame(() => {
        this._viewport?.fitToContent(layout.width, layout.height);
        this._minimap?.setSvgRect(this._renderer!.svg.getBoundingClientRect());
      });
    }
  }

  onNodeEnter(node: Node, workflow: Workflow, options?: { preserveView?: boolean }): void {
    // Always record traversal history regardless of what's displayed
    this._recordNodeVisit(workflow.id, node.id);

    if (options?.preserveView && this._currentWorkflowId !== workflow.id) {
      // User is viewing a different workflow — don't switch the display
      return;
    }

    // Show workflow if switching to a different one, or if no graph rendered yet
    if (this._currentWorkflowId !== workflow.id || !this._currentLayout) {
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

  onEdgeTraverse(edge: Edge, workflow: Workflow): void {
    if (!this._renderer) return;
    const edgeId = this._renderer.findEdge(edge.from, edge.to) ?? edge.id;
    this._recordEdgeTraversal(workflow.id, edgeId);
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

  private _recordNodeVisit(workflowId: string, nodeId: string): void {
    let set = this._visitedNodes.get(workflowId);
    if (!set) { set = new Set(); this._visitedNodes.set(workflowId, set); }
    set.add(nodeId);
  }

  private _recordEdgeTraversal(workflowId: string, edgeId: string): void {
    let set = this._traveledEdges.get(workflowId);
    if (!set) { set = new Set(); this._traveledEdges.set(workflowId, set); }
    set.add(edgeId);
  }

  private _replayTraversalHistory(workflowId: string): void {
    if (!this._renderer) return;

    const visited = this._visitedNodes.get(workflowId);
    if (visited) {
      for (const nodeId of visited) {
        // Mark as visited; the active node will be overridden by onNodeEnter
        this._renderer.setNodeState(nodeId, 'visited');
      }
    }

    const traveled = this._traveledEdges.get(workflowId);
    if (traveled) {
      for (const edgeId of traveled) {
        this._renderer.setEdgeState(edgeId, 'traveled');
      }
    }
  }

  showEdgeViability(currentNodeId: string, validEdgeIds: Set<string>): void {
    if (!this._renderer || !this._currentLayout) return;

    // Clear previous viability markings
    this._renderer.clearViability();

    // Mark outgoing guarded edges from current node as viable or blocked
    for (const edge of this._currentLayout.edges) {
      if (edge.source !== currentNodeId) continue;
      if (!edge.guarded) continue;

      if (validEdgeIds.has(edge.id)) {
        this._renderer.setEdgeViable(edge.id);
      } else {
        this._renderer.setEdgeBlocked(edge.id);
      }
    }
  }

  switchToWorkflow(workflowId: string): void {
    const workflow = this._workflowCache.get(workflowId);
    if (!workflow) return;
    this.showWorkflow(workflow);
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
    this._minimap?.destroy();
    this._viewport?.destroy();
    this._renderer?.destroy();
    this.events.dispose();
    super.destroy();
  }
}
