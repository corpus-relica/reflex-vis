/**
 * Mock ReflexEngine for standalone devtools development and testing.
 * Implements the subset of ReflexEngine that ReflexDevtools requires:
 * - on(event, handler) for event subscription
 * - snapshot() returning an EngineSnapshot
 * - Programmatic methods to fire events
 */

import type {
  EngineEvent,
  EngineSnapshot,
  EventHandler,
  Workflow,
  BlackboardEntry,
  StackFrame,
} from '@corpus-relica/reflex';

export class MockEngine {
  private _handlers = new Map<EngineEvent, EventHandler[]>();
  private _status: 'idle' | 'running' | 'suspended' | 'completed' = 'idle';
  private _currentWorkflowId: string = '';
  private _currentNodeId: string = '';
  private _blackboard: BlackboardEntry[] = [];
  private _stack: StackFrame[] = [];
  private _stepCount = 0;
  private _workflows = new Map<string, Workflow>();
  private _autoplayTimer: ReturnType<typeof setInterval> | null = null;

  constructor(workflows: Workflow[]) {
    for (const w of workflows) this._workflows.set(w.id, w);
  }

  on(event: EngineEvent, handler: EventHandler): void {
    const handlers = this._handlers.get(event) ?? [];
    handlers.push(handler);
    this._handlers.set(event, handlers);
  }

  snapshot(): EngineSnapshot {
    return {
      version: '1',
      createdAt: new Date().toISOString(),
      sessionId: 'mock-session',
      status: this._status,
      currentWorkflowId: this._currentWorkflowId,
      currentNodeId: this._currentNodeId,
      currentBlackboard: [...this._blackboard],
      stack: this._stack.map((f) => ({ ...f, blackboard: [...f.blackboard] })),
      skipInvocation: false,
      workflowIds: [...this._workflows.keys()],
    };
  }

  private _emit(event: EngineEvent, payload?: unknown): void {
    const handlers = this._handlers.get(event);
    if (handlers) {
      for (const h of handlers) h(payload);
    }
  }

  getWorkflow(id: string): Workflow | undefined {
    return this._workflows.get(id);
  }

  /** Initialize the engine on a workflow's entry node */
  init(workflowId: string): void {
    const workflow = this._workflows.get(workflowId);
    if (!workflow) throw new Error(`Unknown workflow: ${workflowId}`);
    this._status = 'running';
    this._currentWorkflowId = workflowId;
    this._currentNodeId = workflow.entry;
    this._blackboard = [];
    this._stack = [];
    this._stepCount = 0;

    const node = workflow.nodes[workflow.entry];
    this._emit('node:enter', { node, workflow });
  }

  /** Step: exit current node, traverse an edge, enter next node */
  step(edgeId?: string): void {
    const workflow = this._workflows.get(this._currentWorkflowId);
    if (!workflow || this._status !== 'running') return;

    const currentNode = workflow.nodes[this._currentNodeId];
    if (!currentNode) return;

    // Find outgoing edges
    const outEdges = workflow.edges.filter((e) => e.from === this._currentNodeId);
    if (outEdges.length === 0) {
      // Terminal node — complete
      this.complete();
      return;
    }

    const edge = edgeId
      ? outEdges.find((e) => e.id === edgeId) ?? outEdges[0]
      : outEdges[0];

    // Exit current node
    this._emit('node:exit', { node: currentNode, workflow });

    // Traverse edge
    this._emit('edge:traverse', { edge, workflow });

    // Enter next node
    this._currentNodeId = edge.to;
    this._stepCount++;
    const nextNode = workflow.nodes[edge.to];
    this._emit('node:enter', { node: nextNode, workflow });

    // Check if next node is an invocation
    if (nextNode.invokes) {
      const childWorkflow = this._workflows.get(nextNode.invokes.workflowId);
      if (childWorkflow) {
        this.pushWorkflow(childWorkflow);
      }
    }
  }

  /** Auto-step through the current workflow */
  autoplay(intervalMs = 800): void {
    this.stopAutoplay();
    this._autoplayTimer = setInterval(() => {
      if (this._status !== 'running') {
        this.stopAutoplay();
        return;
      }
      this.step();
    }, intervalMs);
  }

  stopAutoplay(): void {
    if (this._autoplayTimer) {
      clearInterval(this._autoplayTimer);
      this._autoplayTimer = null;
    }
  }

  /** Write entries to the blackboard */
  writeBlackboard(entries: Array<{ key: string; value: unknown }>): void {
    const workflow = this._workflows.get(this._currentWorkflowId);
    if (!workflow) return;

    const bbEntries: BlackboardEntry[] = entries.map((e) => ({
      key: e.key,
      value: e.value,
      source: {
        workflowId: this._currentWorkflowId,
        nodeId: this._currentNodeId,
        stackDepth: this._stack.length,
      },
      timestamp: Date.now(),
    }));

    this._blackboard.push(...bbEntries);
    this._emit('blackboard:write', { entries: bbEntries, workflow });
  }

  /** Push a sub-workflow onto the stack */
  pushWorkflow(childWorkflow: Workflow): void {
    const parentWorkflow = this._workflows.get(this._currentWorkflowId);
    if (!parentWorkflow) return;

    const frame: StackFrame = {
      workflowId: this._currentWorkflowId,
      currentNodeId: this._currentNodeId,
      returnMap: [],
      blackboard: [...this._blackboard],
    };
    this._stack.push(frame);

    this._currentWorkflowId = childWorkflow.id;
    this._currentNodeId = childWorkflow.entry;
    this._blackboard = [];

    this._emit('workflow:push', { frame, workflow: childWorkflow });
    const entryNode = childWorkflow.nodes[childWorkflow.entry];
    this._emit('node:enter', { node: entryNode, workflow: childWorkflow });
  }

  /** Pop back to parent workflow */
  popWorkflow(): void {
    if (this._stack.length === 0) return;

    const frame = this._stack.pop()!;
    const parentWorkflow = this._workflows.get(frame.workflowId);
    if (!parentWorkflow) return;

    this._currentWorkflowId = frame.workflowId;
    this._currentNodeId = frame.currentNodeId;
    this._blackboard = frame.blackboard;

    this._emit('workflow:pop', { frame, workflow: parentWorkflow });
  }

  /** Suspend the engine */
  suspend(reason = 'User paused'): void {
    this._status = 'suspended';
    this._emit('engine:suspend', { reason });
    this.stopAutoplay();
  }

  /** Complete the engine */
  complete(): void {
    const workflow = this._workflows.get(this._currentWorkflowId);
    this._status = 'completed';
    this._emit('engine:complete', { workflow });
    this.stopAutoplay();
  }

  /** Reset to idle */
  reset(): void {
    this.stopAutoplay();
    this._status = 'idle';
    this._currentWorkflowId = '';
    this._currentNodeId = '';
    this._blackboard = [];
    this._stack = [];
    this._stepCount = 0;
  }
}
