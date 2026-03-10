import type { Workflow, Node, StackFrame, BlackboardEntry } from '@corpus-relica/reflex';
import { Panel, type PanelOptions } from '../panel.js';
import { className } from '../../core/class-name.js';
import { el } from '../../core/dom.js';
import { Emitter } from '../../core/emitter.js';

export interface StackEntry {
  workflowId: string;
  currentNodeId: string;
  depth: number;
  label?: string;
  status?: 'completed';
  order?: number;
  parentNodeId?: string;
}

const LABEL_KEYS = ['label', 'name', 'title', 'description'] as const;

/** Extract a human-readable label from blackboard entries using a priority key heuristic. */
function labelFromBlackboard(blackboard: BlackboardEntry[]): string | undefined {
  // For each priority key, scan newest-to-oldest so latest write wins
  for (const key of LABEL_KEYS) {
    for (let i = blackboard.length - 1; i >= 0; i--) {
      const entry = blackboard[i];
      if (entry.key !== key) continue;
      const v = entry.value;
      if (typeof v === 'string' && v.length > 0) return v;
      if (typeof v === 'number') return String(v);
      // Check nested .name for object values
      if (v != null && typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
        const name = (v as Record<string, unknown>).name;
        if (typeof name === 'string' && name.length > 0) return name;
      }
      break; // Found key but value not usable — try next priority key
    }
  }
  return undefined;
}

export interface StackPanelEvents {
  'frame-click': { workflowId: string; depth: number };
}

export class StackPanel extends Panel {
  readonly name = 'stack';
  readonly label = 'Stack';
  readonly events = new Emitter<StackPanelEvents>();

  private _list: HTMLElement | null = null;
  private _entries: StackEntry[] = [];
  private _completedEntries: StackEntry[] = [];
  private _orderCounter = 0;
  private _focusedDepth: number | null = null;

  constructor(container: HTMLElement, options?: PanelOptions) {
    super(container, options);
  }

  mount(body: HTMLElement): void {
    this._list = el('div', { class: className('stack', 'list') });
    body.appendChild(this._list);
  }

  update(snapshot: unknown): void {
    // Hydrate from engine snapshot
    const snap = snapshot as {
      stack?: StackFrame[];
      currentWorkflowId?: string;
      currentNodeId?: string;
      currentBlackboard?: BlackboardEntry[];
    } | null;
    if (!snap) return;
    this._entries = [];
    this._completedEntries = [];
    const stackLen = snap.stack?.length ?? 0;
    // Active frame first (highest depth)
    if (snap.currentWorkflowId) {
      this._entries.push({
        workflowId: snap.currentWorkflowId,
        currentNodeId: snap.currentNodeId ?? '',
        depth: stackLen,
        label: snap.currentBlackboard ? labelFromBlackboard(snap.currentBlackboard) : undefined,
      });
    }
    // Parent frames: stack[0] = most recent parent → stack[N-1] = oldest
    if (snap.stack) {
      for (let i = 0; i < stackLen; i++) {
        const frame = snap.stack[i];
        this._entries.push({
          workflowId: frame.workflowId,
          currentNodeId: frame.currentNodeId,
          depth: stackLen - 1 - i,
          label: frame.blackboard ? labelFromBlackboard(frame.blackboard) : undefined,
        });
      }
    }
    this._render();
  }

  onNodeEnter(node: Node, _workflow: Workflow): void {
    if (this._entries.length > 0) {
      this._entries[0].currentNodeId = node.id;
      this._render();
    }
  }

  onBlackboardWrite(entries: BlackboardEntry[], _workflow: Workflow): void {
    if (this._entries.length === 0) return;
    const newLabel = labelFromBlackboard(entries);
    if (newLabel !== undefined) {
      this._entries[0].label = newLabel;
      this._render();
    }
  }

  onWorkflowPush(frame: StackFrame, childWorkflow: Workflow): void {
    // The frame is the parent being suspended; update its label from blackboard
    if (this._entries.length > 0 && frame.blackboard) {
      this._entries[0].label = labelFromBlackboard(frame.blackboard);
    }
    // The child is now current (highest depth)
    this._entries.unshift({
      workflowId: childWorkflow.id,
      currentNodeId: '',
      depth: this._entries.length,
      parentNodeId: frame.currentNodeId,
    });
    this._render();
  }

  onWorkflowPop(_frame: StackFrame, parentWorkflow: Workflow): void {
    // If the focused entry was popped (always index 0 = highest depth), clear focus
    if (this._focusedDepth != null && this._entries.length > 0 && this._entries[0].depth === this._focusedDepth) {
      this._focusedDepth = null;
    }
    // Pop the current, move to completed
    if (this._entries.length > 0) {
      const popped = this._entries.shift()!;
      popped.status = 'completed';
      popped.order = ++this._orderCounter;
      this._completedEntries.push(popped);
    }
    if (this._entries.length > 0) {
      this._entries[0].workflowId = parentWorkflow.id;
    }
    this._render();
  }

  onEngineComplete(_workflow: Workflow): void {
    for (const entry of this._entries) {
      entry.status = 'completed';
      entry.order = ++this._orderCounter;
    }
    this._completedEntries.push(...this._entries);
    this._entries = [];
    this._render();
  }

  onStackUnwind(discardedFrames: StackFrame[], restoredWorkflow: Workflow, restoredNode: Node): void {
    // Discard the top N entries (discarded frames always correspond to the
    // topmost stack entries). Using count rather than workflowId matching
    // is critical when the stack contains repeated workflow IDs.
    const discardCount = discardedFrames.length;
    const discarded = this._entries.splice(0, discardCount);

    // Clear user focus if the focused entry was among those discarded
    if (this._focusedDepth != null && discarded.some(e => e.depth === this._focusedDepth)) {
      this._focusedDepth = null;
    }

    // Move discarded entries to completed
    for (const entry of discarded) {
      entry.status = 'completed';
      entry.order = ++this._orderCounter;
      this._completedEntries.push(entry);
    }

    // Update active entry to restored workflow/node
    if (this._entries.length > 0) {
      this._entries[0].workflowId = restoredWorkflow.id;
      this._entries[0].currentNodeId = restoredNode.id;
    }

    this._render();
  }

  onEngineSuspend(_reason: string): void {
    // No-op — engine may resume, keep entries live
  }

  resetSession(): void {
    this._entries = [];
    this._completedEntries = [];
    this._orderCounter = 0;
    this._focusedDepth = null;
    this._render();
  }

  private _renderEntry(entry: StackEntry, focusedDepth: number | undefined, completed: boolean): HTMLElement {
    const isFocused = !completed && entry.depth === focusedDepth;
    let cls = className('stack', 'frame');
    if (isFocused) cls += ` ${className('stack', 'frame', 'current')}`;
    if (completed) cls += ` ${className('stack', 'frame', 'completed')}`;
    const row = el('div', { class: cls });

    const indicator = el('span', { class: className('stack', 'indicator') });
    indicator.textContent = isFocused ? '\u25B6' : ' ';

    const wfLabel = el('span', { class: className('stack', 'workflow') });
    wfLabel.textContent = entry.workflowId;

    const nodeLabel = el('span', { class: className('stack', 'node') });
    nodeLabel.textContent = entry.currentNodeId || '\u2014';

    const depthLabel = el('span', { class: className('stack', 'depth') });
    depthLabel.textContent = `[${entry.depth}]`;

    // Optional entity label from blackboard
    let labelEl: HTMLElement | undefined;
    if (entry.label) {
      labelEl = el('span', { class: className('stack', 'label') });
      labelEl.textContent = entry.label;
      labelEl.title = entry.label;
    }

    if (completed && entry.order != null) {
      const orderLabel = el('span', { class: className('stack', 'order') });
      orderLabel.textContent = `#${entry.order}`;
      row.append(orderLabel);
    }

    if (completed && entry.parentNodeId) {
      const parentLabel = el('span', { class: className('stack', 'parent') });
      parentLabel.textContent = `\u2190 ${entry.parentNodeId}`;
      parentLabel.title = entry.parentNodeId;
      row.append(indicator, wfLabel, ...(labelEl ? [labelEl] : []), nodeLabel, parentLabel, depthLabel);
    } else {
      row.append(indicator, wfLabel, ...(labelEl ? [labelEl] : []), nodeLabel, depthLabel);
    }

    row.addEventListener('click', () => {
      this._focusedDepth = entry.depth;
      this._render();
      this.events.emit('frame-click', { workflowId: entry.workflowId, depth: entry.depth });
    });
    return row;
  }

  private _render(): void {
    if (!this._list) return;
    this._list.innerHTML = '';

    // Focused depth defaults to the engine's active (top of stack)
    const focusedDepth = this._focusedDepth ?? this._entries[0]?.depth;

    for (const entry of this._entries) {
      this._list.appendChild(this._renderEntry(entry, focusedDepth, false));
    }

    // Completed entries separator + rows
    if (this._completedEntries.length > 0) {
      const sep = el('div', { class: className('stack', 'separator') });
      sep.textContent = 'Last Run';
      this._list.appendChild(sep);

      for (const entry of this._completedEntries) {
        this._list.appendChild(this._renderEntry(entry, focusedDepth, true));
      }
    }
  }

  destroy(): void {
    this.events.dispose();
    super.destroy();
  }
}
