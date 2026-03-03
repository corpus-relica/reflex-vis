/**
 * @corpus-relica/reflex-devtools/remote
 *
 * Frontend entry point — no DOM dependency.
 * Provides RemoteReflexEngine for receiving wire events and implementing
 * the engine interface that ReflexDevtools expects.
 */

export { RemoteReflexEngine } from './remote/remote-engine.js';

export type {
  DevtoolsWireEvent,
  DevtoolsInitEvent,
  DevtoolsEngineEvent,
  SerializedWorkflow,
  SerializedEdge,
  SerializedGuard,
} from './remote/protocol.js';
