# Reflex Devtools — Specification

A lightweight, framework-agnostic developer overlay for visualizing and debugging Reflex engine state at runtime. Inspired by the aesthetics and architecture of [tweakpane](https://tweakpane.github.io/docs/).

## Goals

- **Debug complex workflows** — see where you are in a DAG, what's on the blackboard, what the call stack looks like
- **Zero coupling** — vanilla DOM, works in React/Vue/Svelte/vanilla apps
- **Opt-in dependency** — separate package (`@corpus-relica/reflex-devtools`), doesn't bloat the core engine
- **Minimal aesthetic** — dark semi-transparent overlay, information-dense, tweakpane-style

## Non-Goals

- Not an editor (no drag-and-drop workflow building)
- Not a persistence/replay tool (that's engine-level)
- Not a production component (dev/debug only)

---

## 1. Architecture

### 1.1 Package

```
@corpus-relica/reflex-devtools
```

Peer dependency on `@corpus-relica/reflex`. Own dependencies (d3-dag or dagre for layout, etc.) are isolated here — the core engine stays lean.

### 1.2 Rendering Model

Following tweakpane's architecture:

- **Imperative DOM** — each panel/view constructs and owns its own DOM subtree. No VDOM, no templates.
- **CSS isolation via prefixed classes** — all classes use a `rx-` prefix with BEM-style naming: `rx-{panel}`, `rx-{panel}_{element}`, `rx-{panel}_{element}-{modifier}`.
- **Single `<style>` injection** — compiled CSS injected as a `<style data-rx-devtools>` tag in `document.head`. Idempotent (checks before inserting).
- **CSS custom properties for theming** — users override `--rx-bg`, `--rx-text`, `--rx-accent`, etc. on the container. Internal vars use abbreviated names.
- **Reactive primitives** — lightweight `Emitter` and `Value<T>` types (can borrow from tweakpane's pattern or use the engine's own event system).

### 1.3 Lifecycle

```
new ReflexDevtools(engine, options)  →  create DOM, subscribe to engine events
devtools.destroy()                   →  unsubscribe, remove DOM, clean up
```

Disposal cascades through the panel tree — each panel removes its own elements.

### 1.4 Engine Integration

The devtools subscribes to the engine's existing event system:

| Engine Event | Devtools Response |
|---|---|
| `node:enter` | DAG: highlight active node. Stack: update current. Events: log. |
| `node:exit` | DAG: mark node as visited. Events: log. |
| `blackboard:write` | Blackboard: add/update entry. Events: log. |
| `workflow:push` | Stack: push frame. DAG: switch to child workflow view. Events: log. |
| `workflow:pop` | Stack: pop frame. DAG: switch to parent workflow view. Events: log. |
| `engine:suspend` | All panels: indicate suspended state. Events: log. |
| `engine:complete` | All panels: indicate completed state. Events: log. |

Additionally, `engine.snapshot()` can be called on mount to hydrate the initial state if attaching to an already-running engine.

---

## 2. API Surface

### 2.1 Basic Usage

```typescript
import { ReflexDevtools } from '@corpus-relica/reflex-devtools';

const devtools = new ReflexDevtools(engine, {
  container: document.getElementById('debug'),  // optional — defaults to fixed overlay on document.body
  panels: ['dag', 'stack', 'blackboard', 'events'],  // optional — defaults to all
  position: 'top-right',  // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' — ignored if container provided
  height: 250,         // initial height in px, resizable via drag
  collapsed: [],       // panel names to start collapsed, e.g. ['events']
  theme: 'dark',       // 'dark' | 'light' | custom vars object
});

// Teardown
devtools.destroy();
```

### 2.2 Programmatic Control

```typescript
devtools.collapse();
devtools.expand();
devtools.showPanel('blackboard');
devtools.hidePanel('events');
```

### 2.3 Framework Integration

React (typical pattern):

```tsx
function DevtoolsOverlay({ engine }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dt = new ReflexDevtools(engine, { container: ref.current! });
    return () => dt.destroy();
  }, [engine]);
  return <div ref={ref} />;
}
```

---

## 3. Panels

### 3.1 DAG Panel — Workflow Graph

**Purpose**: Visualize the current workflow's node/edge structure with execution state.

**Layout**:
- Directed layered graph (Sugiyama-style) via d3-dag or dagre
- Nodes rendered as rounded rectangles with label
- Edges rendered as paths with arrowheads
- Layout computed once per workflow; re-laid-out only on workflow switch (push/pop)

**Viewport**:
- SVG or Canvas rendering inside a scrollable/pannable container
- **Pan**: click-and-drag on background
- **Zoom**: scroll wheel or pinch
- **Minimap**: small inset rectangle (bottom-right of the DAG panel) showing the full graph at thumbnail scale with a viewport rectangle indicating the current visible area. Dragging the viewport rectangle pans the main view. Same pattern as VS Code's minimap or Figma's navigation.

**Node States** (visual encoding):

| State | Visual |
|---|---|
| Unvisited | Default (muted fill) |
| Active (current) | Accent color fill + pulse/glow |
| Visited | Slightly brighter than unvisited, checkmark or filled dot |
| Terminal | Distinct shape or border (double border?) |
| Invocation | Different shape or icon indicating sub-workflow call |

**Edge States**:

| State | Visual |
|---|---|
| Untraveled | Muted/dashed |
| Traveled | Solid accent |
| Active (just traversed) | Brief highlight animation |
| Guarded | Small icon/badge on edge indicating guard presence |

**Interactions**:
- Hover node → tooltip with node spec, inputs/outputs if defined
- Click node → show node detail (spec contents, connected edges, guard conditions)
- Workflow switch on push/pop → animated transition or instant swap with breadcrumb trail

**Minimap Detail**:
- Fixed-size inset (e.g., 120x80px) in corner of DAG panel
- Renders the full graph as simplified dots/lines (no labels)
- Semi-transparent viewport rectangle shows visible area
- Drag viewport rectangle to pan main view
- Click anywhere in minimap to jump main view

### 3.2 Stack Panel — Call Stack

**Purpose**: Show the workflow call stack with current position.

**Layout**: Vertical list, current (top of stack) at top.

```
┌─ Stack ──────────────────┐
│ ► child-workflow     [2]  │  ← current (highlighted)
│   parent-workflow    [1]  │
│   root-workflow      [0]  │
└──────────────────────────┘
```

**Per Frame**:
- Workflow ID
- Current node ID within that workflow
- Stack depth index

**Interactions**:
- Click a frame → DAG panel switches to show that workflow's graph (read-only view of parent state)
- Current frame highlighted with accent color

### 3.3 Blackboard Panel — Scoped State

**Purpose**: Inspect the blackboard with scope chain visibility.

**Layout**: Key-value table with scope indicators.

```
┌─ Blackboard ─────────────────────────────┐
│ Key          Value           Source        │
│ ─────────── ─────────────── ─────────     │
│ greeting    "Hello, World!" GREET (local)  │
│ name        "World"         ASK   (local)  │
│ config      {...}           INIT  (parent) │
└───────────────────────────────────────────┘
```

**Columns**:
- **Key** — blackboard key
- **Value** — current value (truncated, expandable for objects)
- **Source** — `nodeId` + scope indicator (`local` | `parent` | `grandparent` | depth)

**Scope Visualization**:
- Local entries in normal text
- Inherited entries in muted/italic text
- Color-coded or indented by scope depth

**Value Ancestry** (expandable per-key):
- Show all writes to a given key across the scope chain
- Which workflow/node wrote it, at what step
- The append-only property means this is a clean chronological list

**Interactions**:
- Click a value → expand to full JSON view
- Click source node → DAG panel highlights that node
- Filter/search by key name
- Toggle "show inherited" to hide/show parent scope entries

**Live Updates**:
- New entries appear at top (or highlighted) on `blackboard:write` events
- Brief flash/highlight animation on new writes

### 3.4 Events Panel — Event Stream

**Purpose**: Scrolling log of engine events for tracing execution.

**Layout**: Reverse-chronological list (newest at bottom, auto-scroll).

```
┌─ Events ─────────────────────────────────┐
│ [filter: all ▾]                           │
│                                           │
│ 12:00:01.234  node:enter    ASK           │
│ 12:00:01.240  bb:write      name="World"  │
│ 12:00:01.241  node:exit     ASK           │
│ 12:00:01.242  node:enter    GREET         │
│ 12:00:01.250  bb:write      greeting=...  │
│ 12:00:01.251  node:exit     GREET         │
│ 12:00:01.252  engine:complete             │
└───────────────────────────────────────────┘
```

**Per Event**:
- Timestamp (relative or absolute, toggleable)
- Event type (color-coded by category: node=blue, blackboard=green, workflow=purple, engine=gray)
- Summary (node ID, key/value, workflow ID — depends on event type)

**Interactions**:
- Filter by event type (checkboxes or dropdown)
- Click an event → cross-highlights in other panels (e.g., clicking a `node:enter` highlights that node in DAG)
- Clear log button
- Pause/resume auto-scroll
- Search/filter by content

---

## 4. Visual Design

### 4.1 Overall Style

- **Dark theme default** — `rgba(0, 0, 0, 0.85)` background, light text
- **Semi-transparent** — host app visible behind (configurable opacity)
- **Monospace for values**, proportional for labels
- **Compact** — small font size (11-12px), tight padding
- **Color palette**: grays baseline, single accent color for active/current state, semantic colors for event categories
- **Rounded corners** on panels, subtle 1px borders
- **Collapsible sections** — each panel collapses independently

### 4.2 Layout

**Horizontal strip** — all four panels sit adjacent in a row. Each panel is independently collapsible. Anchored to the **top-right** corner of the viewport by default (like stats.js / tweakpane), configurable to any corner.

**All expanded:**

```
┌─ DAG ──────────────────┬─ Stack ────┬─ Blackboard ──────┬─ Events ──────────┐
│                        │ ► child    │ key     value     │ 12:00 node:enter  │
│      (graph viewport)  │   root     │ name    "World"   │ 12:01 bb:write    │
│                        │            │ greet   "Hello"   │ 12:02 node:exit   │
│                   [mm] │            │                   │                   │
└────────────────────────┴────────────┴───────────────────┴───────────────────┘
```

**Collapsed panels** become thin vertical bars showing a rotated label and icon. Click the bar to re-expand. Remaining expanded panels grow to fill the freed space via flexbox.

**Stack and Blackboard collapsed:**

```
┌─ DAG ──────────────────────────┬───┬───┬─ Events ──────────────────────────┐
│                                │ S │ B │ 12:00 node:enter                  │
│         (graph viewport)       │ t │ l │ 12:01 bb:write                    │
│                                │ a │ a │ 12:02 node:exit                   │
│                           [mm] │ c │ c │                                   │
│                                │ k │ k │                                   │
└────────────────────────────────┴───┴───┴───────────────────────────────────┘
```

**All collapsed** (minimal footprint):

```
┌───┬───┬───┬───┐
│ D │ S │ B │ E │
│ A │ t │ l │ v │
│ G │ a │ a │ e │
│   │ c │ c │ n │
│   │ k │ k │ t │
└───┴───┴───┴───┘
```

**Layout mechanics**:
- **Container**: `display: flex; flex-direction: row` — panels are flex children
- **Expanded panels**: `flex: 1` (equal distribution) or user-resizable via drag dividers between panels
- **Collapsed panels**: `flex: 0 0 var(--rx-collapsed-width)` (fixed narrow width, ~28px)
- **Dividers**: thin drag handles between panels for resizing relative widths
- **Container size**: configurable width/height (default ~900x250px), resizable via drag edges
- **Container position**: `position: fixed` anchored to top-right corner by default, or embedded in a user-provided container element
- **Draggable**: grab header bar to reposition freely within the viewport

### 4.3 Theming via CSS Custom Properties

```css
/* User overrides on container */
--rx-bg: rgba(0, 0, 0, 0.85);
--rx-bg-panel: rgba(30, 30, 30, 0.95);
--rx-text: #e0e0e0;
--rx-text-muted: #888;
--rx-accent: #4fc3f7;       /* active node, current stack frame */
--rx-accent-dim: #1a3a4a;   /* visited node */
--rx-border: rgba(255, 255, 255, 0.1);
--rx-font-mono: 'SF Mono', 'Fira Code', monospace;
--rx-font-ui: -apple-system, sans-serif;
--rx-font-size: 11px;

/* Semantic colors */
--rx-event-node: #64b5f6;
--rx-event-bb: #81c784;
--rx-event-workflow: #ce93d8;
--rx-event-engine: #90a4ae;
```

---

## 5. Technical Considerations

### 5.1 Performance

- DAG layout computed **once per workflow** (on push/pop or init), not per step
- Node/edge state updates are CSS class toggles, not re-renders
- Blackboard panel uses the engine's cursor API for incremental updates — no full re-scan
- Event log uses a fixed-size ring buffer (configurable, default 500 entries) — oldest entries dropped
- Minimap renders to a small canvas, updated only on pan/zoom of main view
- All DOM updates are synchronous and batched per engine step (engine events fire synchronously within a step)

### 5.2 Dependencies

| Dependency | Purpose | Approximate Size |
|---|---|---|
| d3-dag (or dagre) | DAG layout algorithm | ~30-50KB |
| (none else) | — | — |

CSS is compiled from SCSS/CSS at build time, injected as a string. No runtime CSS framework.

### 5.3 Module Structure (Preliminary)

```
reflex-devtools/
├── src/
│   ├── index.ts              — ReflexDevtools entry class
│   ├── core/
│   │   ├── emitter.ts        — lightweight reactive Emitter
│   │   ├── class-name.ts     — rx- prefixed BEM class factory
│   │   ├── style.ts          — embedStyle() injection
│   │   ├── dom.ts            — DOM utilities
│   │   └── theme.ts          — CSS var defaults and injection
│   ├── panels/
│   │   ├── panel.ts          — base Panel class (create/mount/dispose)
│   │   ├── dag/
│   │   │   ├── dag-panel.ts  — DAG panel controller
│   │   │   ├── dag-layout.ts — graph layout (wraps d3-dag/dagre)
│   │   │   ├── dag-renderer.ts — SVG/Canvas node+edge rendering
│   │   │   ├── minimap.ts    — minimap inset
│   │   │   └── viewport.ts   — pan/zoom handling
│   │   ├── stack/
│   │   │   └── stack-panel.ts
│   │   ├── blackboard/
│   │   │   └── blackboard-panel.ts
│   │   └── events/
│   │       └── events-panel.ts
│   └── styles/
│       ├── base.css          — reset, variables, container
│       ├── dag.css
│       ├── stack.css
│       ├── blackboard.css
│       └── events.css
├── package.json
├── tsconfig.json
└── README.md
```

### 5.4 Build Output

- ESM + CJS dual output (matching the core engine)
- CSS compiled and embedded as string constant at build time (same pattern as tweakpane)
- TypeScript declarations

---

## 6. Open Questions

- **Canvas vs SVG for DAG?** SVG is easier to style/theme and supports DOM events natively. Canvas is faster for large graphs. SVG is probably fine for Reflex-scale DAGs (tens to low hundreds of nodes). Minimap could use Canvas regardless.
- **d3-dag vs dagre?** dagre is mature but unmaintained. d3-dag is actively developed and more modern. Need to evaluate API ergonomics and bundle size.
- **Should the devtools be attachable/detachable at runtime?** (attach to engine mid-execution, detach without destroying) — useful if you want to toggle visibility without losing state.
- **Keyboard shortcuts?** Toggle visibility, switch panels, step-through if engine is suspended.
- **Export/snapshot?** Capture current devtools state as an image or JSON for bug reports.

---

## 7. MVP Scope

**Phase 1**: Stack + Blackboard + Events panels. These are tabular/list views — straightforward DOM, no layout algorithms. Provides immediate debugging value.

**Phase 2**: DAG panel with static layout. Render the workflow graph with node state highlighting. Pan and zoom.

**Phase 3**: Minimap, cross-panel interactions (click node in events → highlight in DAG), value ancestry in blackboard, animations.

---

*This spec is a starting point. Refine as implementation reveals constraints.*
