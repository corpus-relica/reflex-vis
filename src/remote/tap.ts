/**
 * ReflexDevtoolsTap — backend-side engine event serializer.
 *
 * Subscribes to a ReflexEngine, serializes events for wire transport,
 * and pre-evaluates validEdges (since custom guard functions can't cross
 * the wire). No DOM dependency — safe for Node.js / NestJS.
 *
 * Usage:
 *   const engine = createEngine(registry, agent);
 *   const tap = new ReflexDevtoolsTap(engine);
 *   tap.onEvent((event) => socket.emit('devtools:event', event));
 *   await engine.init(workflowId);
 *   await engine.run();
 *   // later: tap.detach();
 */

import type {
  ReflexEngine,
  EngineEvent,
  Workflow,
  Edge,
  Guard,
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
  SerializedGuard,
} from './protocol.js';

export type TapEventHandler = (event: DevtoolsWireEvent) => void;

export class ReflexDevtoolsTap {
  private readonly _engine: ReflexEngine;
  private _handler: TapEventHandler | null = null;
  private _detached = false;

  constructor(engine: ReflexEngine, handler?: TapEventHandler) {
    this._engine = engine;
    this._subscribe();
    if (handler) {
      this._handler = handler;
      this._sendInit();
    }
  }

  /** Register a handler for wire events. Sends an init event immediately. */
  onEvent(handler: TapEventHandler): void {
    this._handler = handler;
    this._sendInit();
  }

  /** Stop emitting events. Handlers on the engine remain but become no-ops. */
  detach(): void {
    this._detached = true;
    this._handler = null;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private _emit(event: DevtoolsWireEvent): void {
    if (this._detached || !this._handler) return;
    try {
      this._handler(event);
    } catch {
      // Transport errors shouldn't crash the engine
    }
  }

  private _sendInit(): void {
    try {
      const engine = this._engine;
      const snapshot = engine.snapshot();
      const workflow = engine.currentWorkflow();

      const init: DevtoolsInitEvent = {
        type: 'devtools:init',
        snapshot,
        workflow: workflow ? serializeWorkflow(workflow) : undefined,
        validEdges: this._safeValidEdges(),
      };
      this._emit(init);
    } catch {
      // Engine not initialized yet — skip init event.
      // State will arrive via node:enter once the engine starts.
    }
  }

  private _safeValidEdges(): SerializedEdge[] | undefined {
    try {
      const edges = this._engine.validEdges();
      return edges.length > 0 ? edges.map(serializeEdge) : undefined;
    } catch {
      return undefined;
    }
  }

  private _subscribe(): void {
    const on = (event: EngineEvent, handler: (payload?: unknown) => void) => {
      this._engine.on(event, (payload) => {
        if (!this._detached) handler(payload);
      });
    };

    on('node:enter', (payload) => {
      const { node, workflow } = payload as { node: Node; workflow: Workflow };
      this._emit(this._engineEvent('node:enter', {
        node,
        workflow: serializeWorkflow(workflow),
      }, true));
    });

    on('node:exit', (payload) => {
      const { node, workflow } = payload as { node: Node; workflow: Workflow };
      this._emit(this._engineEvent('node:exit', {
        node,
        workflow: serializeWorkflow(workflow),
      }));
    });

    on('edge:traverse', (payload) => {
      const { edge, workflow } = payload as { edge: Edge; workflow: Workflow };
      this._emit(this._engineEvent('edge:traverse', {
        edge: serializeEdge(edge),
        workflow: serializeWorkflow(workflow),
      }));
    });

    on('blackboard:write', (payload) => {
      const { entries, workflow } = payload as { entries: BlackboardEntry[]; workflow: Workflow };
      this._emit(this._engineEvent('blackboard:write', {
        entries,
        workflow: serializeWorkflow(workflow),
      }, true));
    });

    on('workflow:push', (payload) => {
      const { frame, workflow } = payload as { frame: StackFrame; workflow: Workflow };
      this._emit(this._engineEvent('workflow:push', {
        frame,
        workflow: serializeWorkflow(workflow),
      }));
    });

    on('workflow:pop', (payload) => {
      const { frame, workflow } = payload as { frame: StackFrame; workflow: Workflow };
      this._emit(this._engineEvent('workflow:pop', {
        frame,
        workflow: serializeWorkflow(workflow),
      }));
    });

    on('engine:complete', (payload) => {
      const { workflow } = payload as { workflow: Workflow };
      this._emit(this._engineEvent('engine:complete', {
        workflow: serializeWorkflow(workflow),
      }));
    });

    on('engine:suspend', (payload) => {
      const { reason } = payload as { reason: string };
      this._emit(this._engineEvent('engine:suspend', { reason }));
    });

    on('engine:error', (payload) => {
      this._emit(this._engineEvent('engine:error', payload));
    });
  }

  private _engineEvent(
    type: EngineEvent,
    payload: unknown,
    includeValidEdges = false,
  ): DevtoolsEngineEvent {
    return {
      type,
      payload,
      timestamp: Date.now(),
      validEdges: includeValidEdges ? this._safeValidEdges() : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function serializeWorkflow(workflow: Workflow): SerializedWorkflow {
  return {
    id: workflow.id,
    entry: workflow.entry,
    nodes: workflow.nodes,
    edges: workflow.edges.map(serializeEdge),
    metadata: workflow.metadata,
  };
}

function serializeEdge(edge: Edge): SerializedEdge {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    event: edge.event,
    guard: edge.guard ? serializeGuard(edge.guard) : undefined,
  };
}

function serializeGuard(guard: Guard): SerializedGuard {
  if (guard.type === 'custom') {
    return { type: 'custom' };
  }
  // Builtin guards are already JSON-serializable
  return { type: guard.type, key: guard.key, value: guard.value };
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
