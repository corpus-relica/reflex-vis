/**
 * RemoteReflexEngine — frontend-side adapter for remote engine visualization.
 *
 * Receives wire events from a transport layer (Socket.IO, WebSocket, etc.),
 * maintains local state, and implements the ReflexEngine interface subset
 * that ReflexDevtools expects. No DOM dependency.
 *
 * Usage:
 *   const remote = new RemoteReflexEngine();
 *   socket.on('devtools:event', (e) => remote.receive(e));
 *   const devtools = new ReflexDevtools(remote as any, { position: 'top-right' });
 */

import type {
  EngineEvent,
  EngineSnapshot,
  EventHandler,
  Edge,
  Workflow,
  Node,
  BlackboardEntry,
  StackFrame,
} from '@corpus-relica/reflex';

import type {
  DevtoolsWireEvent,
  DevtoolsInitEvent,
  DevtoolsEngineEvent,
  SerializedWorkflow,
  SerializedEdge,
} from './protocol.js';

export class RemoteReflexEngine {
  private _handlers = new Map<string, Set<EventHandler>>();
  private _snapshot: EngineSnapshot | null = null;
  private _validEdges: Edge[] = [];
  private _currentWorkflow: Workflow | null = null;
  private _workflows = new Map<string, Workflow>();

  // -------------------------------------------------------------------------
  // ReflexEngine interface subset (what devtools uses)
  // -------------------------------------------------------------------------

  /** Register an event handler. */
  on(event: EngineEvent, handler: EventHandler): void {
    let set = this._handlers.get(event);
    if (!set) { set = new Set(); this._handlers.set(event, set); }
    set.add(handler);
  }

  /** Return the current engine snapshot. */
  snapshot(): EngineSnapshot {
    if (!this._snapshot) {
      // Return a minimal idle snapshot before init
      return {
        version: '1',
        createdAt: new Date().toISOString(),
        sessionId: '',
        status: 'idle',
        currentWorkflowId: '',
        currentNodeId: '',
        currentBlackboard: [],
        stack: [],
        skipInvocation: false,
        workflowIds: [],
      };
    }
    return this._snapshot;
  }

  /** Return pre-evaluated valid edges from the last node:enter or blackboard:write. */
  validEdges(): Edge[] {
    return this._validEdges;
  }

  /** Return the current workflow (most recently seen). */
  currentWorkflow(): Workflow | null {
    return this._currentWorkflow;
  }

  // -------------------------------------------------------------------------
  // Wire event ingestion
  // -------------------------------------------------------------------------

  /** Receive a wire event from the transport layer. */
  receive(event: DevtoolsWireEvent): void {
    if (event.type === 'devtools:init') {
      this._handleInit(event as DevtoolsInitEvent);
    } else {
      this._handleEvent(event as DevtoolsEngineEvent);
    }
  }

  private _dispatch(event: string, payload: unknown): void {
    const handlers = this._handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(payload); } catch { /* ignore */ }
      }
    }
  }

  private _handleInit(event: DevtoolsInitEvent): void {
    // Signal new session — panels should clear stale state
    this._dispatch('session:reset', undefined);

    this._snapshot = event.snapshot;

    if (event.workflow) {
      const wf = event.workflow as unknown as Workflow;
      this._currentWorkflow = wf;
      this._workflows.set(wf.id, wf);
    }

    if (event.validEdges) {
      this._validEdges = event.validEdges as unknown as Edge[];
    } else {
      this._validEdges = [];
    }
  }

  private _handleEvent(event: DevtoolsEngineEvent): void {
    // Update valid edges cache BEFORE dispatching (so devtools reads fresh values)
    if (event.validEdges) {
      this._validEdges = event.validEdges as unknown as Edge[];
    }

    // Update internal state from event payload
    this._updateState(event);

    // Dispatch to registered handlers
    const handlers = this._handlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event.payload);
        } catch {
          // Handler errors shouldn't break the event stream
        }
      }
    }
  }

  private _updateState(event: DevtoolsEngineEvent): void {
    const payload = event.payload as Record<string, unknown> | undefined;
    if (!payload) return;

    switch (event.type) {
      case 'node:enter': {
        const node = payload.node as Node;
        const workflow = payload.workflow as unknown as Workflow;
        this._cacheWorkflow(workflow);
        this._currentWorkflow = workflow;
        if (this._snapshot) {
          this._snapshot.currentNodeId = node.id;
          this._snapshot.currentWorkflowId = workflow.id;
          this._snapshot.status = 'running';
        }
        break;
      }

      case 'node:exit':
        // No snapshot state changes needed
        break;

      case 'edge:traverse':
        // No snapshot state changes needed
        break;

      case 'blackboard:write': {
        const entries = payload.entries as BlackboardEntry[];
        if (this._snapshot && entries) {
          this._snapshot.currentBlackboard.push(...entries);
        }
        break;
      }

      case 'workflow:push': {
        const frame = payload.frame as StackFrame;
        const workflow = payload.workflow as unknown as Workflow;
        this._cacheWorkflow(workflow);
        this._currentWorkflow = workflow;
        if (this._snapshot) {
          this._snapshot.stack.unshift(frame);
          this._snapshot.currentWorkflowId = workflow.id;
          this._snapshot.currentBlackboard = [];
        }
        break;
      }

      case 'workflow:pop': {
        const workflow = payload.workflow as unknown as Workflow;
        this._currentWorkflow = workflow;
        if (this._snapshot) {
          const restored = this._snapshot.stack.shift();
          this._snapshot.currentWorkflowId = workflow.id;
          this._snapshot.currentBlackboard = restored?.blackboard ?? [];
        }
        break;
      }

      case 'engine:complete':
        if (this._snapshot) this._snapshot.status = 'completed';
        break;

      case 'engine:suspend':
        if (this._snapshot) this._snapshot.status = 'suspended';
        break;

      case 'engine:error':
        if (this._snapshot) this._snapshot.status = 'error';
        break;
    }
  }

  private _cacheWorkflow(workflow: Workflow): void {
    this._workflows.set(workflow.id, workflow);
  }
}

// Re-export protocol types for convenience
export type {
  DevtoolsWireEvent,
  DevtoolsInitEvent,
  DevtoolsEngineEvent,
  SerializedWorkflow,
  SerializedEdge,
  SerializedGuard,
} from './protocol.js';
