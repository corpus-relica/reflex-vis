import type { Workflow, Node, StackFrame } from '@corpus-relica/reflex';
import { Panel, type PanelOptions } from '../panel.js';
import { className } from '../../core/class-name.js';
import { el } from '../../core/dom.js';
import { Emitter } from '../../core/emitter.js';

export interface StackEntry {
  workflowId: string;
  currentNodeId: string;
  depth: number;
  status?: 'completed';
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
  private _focusedWorkflowId: string | null = null;

  constructor(container: HTMLElement, options?: PanelOptions) {
    super(container, options);
  }

  mount(body: HTMLElement): void {
    this._list = el('div', { class: className('stack', 'list') });
    body.appendChild(this._list);
  }

  update(snapshot: unknown): void {
    // Hydrate from engine snapshot
    const snap = snapshot as { stack?: StackFrame[]; currentWorkflowId?: string; currentNodeId?: string } | null;
    if (!snap) return;
    this._entries = [];
    this._completedEntries = [];
    // Build stack from snapshot — current frame is not on the stack array
    if (snap.stack) {
      for (let i = snap.stack.length - 1; i >= 0; i--) {
        const frame = snap.stack[i];
        this._entries.push({
          workflowId: frame.workflowId,
          currentNodeId: frame.currentNodeId,
          depth: i,
        });
      }
    }
    if (snap.currentWorkflowId) {
      this._entries.unshift({
        workflowId: snap.currentWorkflowId,
        currentNodeId: snap.currentNodeId ?? '',
        depth: (snap.stack?.length ?? 0),
      });
    }
    this._render();
  }

  onNodeEnter(node: Node, _workflow: Workflow): void {
    if (this._entries.length > 0) {
      this._entries[0].currentNodeId = node.id;
      this._render();
    }
  }

  onWorkflowPush(frame: StackFrame, childWorkflow: Workflow): void {
    // The frame is the parent being suspended; the child is now current
    this._entries.unshift({
      workflowId: childWorkflow.id,
      currentNodeId: '',
      depth: this._entries.length,
    });
    this._render();
  }

  onWorkflowPop(frame: StackFrame, parentWorkflow: Workflow): void {
    // If the focused workflow was popped, clear user focus
    if (this._focusedWorkflowId === frame.workflowId) {
      this._focusedWorkflowId = null;
    }
    // Pop the current, move to completed
    if (this._entries.length > 0) {
      const popped = this._entries.shift()!;
      popped.status = 'completed';
      this._completedEntries.unshift(popped);
    }
    if (this._entries.length > 0) {
      this._entries[0].workflowId = parentWorkflow.id;
    }
    this._render();
  }

  onEngineComplete(_workflow: Workflow): void {
    for (const entry of this._entries) entry.status = 'completed';
    this._completedEntries.unshift(...this._entries);
    this._entries = [];
    this._render();
  }

  onEngineSuspend(_reason: string): void {
    // No-op — engine may resume, keep entries live
  }

  resetSession(): void {
    this._entries = [];
    this._completedEntries = [];
    this._focusedWorkflowId = null;
    this._render();
  }

  private _renderEntry(entry: StackEntry, focusedId: string | undefined, completed: boolean): HTMLElement {
    const isFocused = !completed && entry.workflowId === focusedId;
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

    row.append(indicator, wfLabel, nodeLabel, depthLabel);
    row.addEventListener('click', () => {
      this._focusedWorkflowId = entry.workflowId;
      this._render();
      this.events.emit('frame-click', { workflowId: entry.workflowId, depth: entry.depth });
    });
    return row;
  }

  private _render(): void {
    if (!this._list) return;
    this._list.innerHTML = '';

    // Focused workflow defaults to the engine's active (top of stack)
    const focusedId = this._focusedWorkflowId ?? this._entries[0]?.workflowId;

    for (const entry of this._entries) {
      this._list.appendChild(this._renderEntry(entry, focusedId, false));
    }

    // Completed entries separator + rows
    if (this._completedEntries.length > 0) {
      const sep = el('div', { class: className('stack', 'separator') });
      sep.textContent = 'Last Run';
      this._list.appendChild(sep);

      for (const entry of this._completedEntries) {
        this._list.appendChild(this._renderEntry(entry, focusedId, true));
      }
    }
  }

  destroy(): void {
    this.events.dispose();
    super.destroy();
  }
}
