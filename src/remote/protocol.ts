/**
 * Wire protocol types for remote engine visualization.
 *
 * These types define the serialization format for bridging a server-side
 * ReflexEngine to a browser-side ReflexDevtools instance. Custom guard
 * functions are replaced with opaque markers since they can't cross the wire.
 */

import type {
  EngineEvent,
  EngineSnapshot,
  Node,
  BlackboardEntry,
  StackFrame,
  UnwindEvent,
} from '@corpus-relica/reflex';

// ---------------------------------------------------------------------------
// Serialized types (guards stripped of functions)
// ---------------------------------------------------------------------------

/** A guard with custom `evaluate` function stripped for wire transport. */
export type SerializedGuard =
  | { type: 'exists' | 'equals' | 'not-exists' | 'not-equals'; key: string; value?: unknown }
  | { type: 'custom' };

/** Edge with guard serialized for wire transport. */
export interface SerializedEdge {
  id: string;
  from: string;
  to: string;
  event: string;
  guard?: SerializedGuard;
}

/** Workflow with edges serialized (guards stripped of functions). */
export interface SerializedWorkflow {
  id: string;
  entry: string;
  nodes: Record<string, Node>;
  edges: SerializedEdge[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Wire events
// ---------------------------------------------------------------------------

/**
 * Initial state event sent when a tap connects or a new engine session begins.
 * The RemoteReflexEngine resets its internal state on receipt.
 */
export interface DevtoolsInitEvent {
  type: 'devtools:init';
  snapshot: EngineSnapshot;
  workflow?: SerializedWorkflow;
  validEdges?: SerializedEdge[];
}

/**
 * A serialized engine event with pre-evaluated validEdges.
 *
 * The `payload` mirrors the engine's event payload but with Workflow objects
 * replaced by SerializedWorkflow (guards stripped). `validEdges` is included
 * on `node:enter` and `blackboard:write` events since the frontend can't
 * evaluate guards locally.
 */
export interface DevtoolsEngineEvent {
  type: EngineEvent;
  payload: unknown;
  timestamp: number;
  /** Pre-evaluated valid edges, sent with node:enter and blackboard:write. */
  validEdges?: SerializedEdge[];
}

/** Discriminated union of all wire events. */
export type DevtoolsWireEvent = DevtoolsInitEvent | DevtoolsEngineEvent;

// ---------------------------------------------------------------------------
// Re-export commonly needed types for convenience
// ---------------------------------------------------------------------------

export type {
  EngineEvent,
  EngineSnapshot,
  Node,
  BlackboardEntry,
  StackFrame,
  UnwindEvent,
};
