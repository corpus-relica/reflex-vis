/**
 * @corpus-relica/reflex-devtools/tap
 *
 * Backend entry point — no DOM dependency, safe for Node.js / NestJS.
 * Provides ReflexDevtoolsTap for subscribing to a server-side ReflexEngine
 * and serializing events for wire transport.
 */

export { ReflexDevtoolsTap } from './remote/tap.js';
export type { TapEventHandler } from './remote/tap.js';

export type {
  DevtoolsWireEvent,
  DevtoolsInitEvent,
  DevtoolsEngineEvent,
  SerializedWorkflow,
  SerializedEdge,
  SerializedGuard,
} from './remote/protocol.js';
