import type { Node, Edge, Workflow, BlackboardEntry, StackFrame } from '@corpus-relica/reflex';
import { Panel, type PanelOptions } from '../panel.js';
import { className } from '../../core/class-name.js';
import { el } from '../../core/dom.js';
import { Emitter } from '../../core/emitter.js';

export type EventCategory = 'node' | 'bb' | 'workflow' | 'engine';

export interface EventEntry {
  time: number;
  type: string;
  category: EventCategory;
  summary: string;
  data?: unknown;
}

export interface EventsPanelEvents {
  'event-click': EventEntry;
  [key: string]: unknown;
}

export class EventsPanel extends Panel {
  readonly name = 'events';
  readonly label = 'Events';
  readonly events = new Emitter<EventsPanelEvents>();

  private _list: HTMLElement | null = null;
  private _entries: EventEntry[] = [];
  private _maxEntries: number;
  private _autoScroll = true;
  private _filterCategory: EventCategory | null = null;
  private _startTime = Date.now();

  constructor(container: HTMLElement, options?: PanelOptions & { maxEntries?: number }) {
    super(container, options);
    this._maxEntries = options?.maxEntries ?? 500;
  }

  mount(body: HTMLElement): void {
    // Toolbar
    const toolbar = el('div', { class: className('events', 'toolbar') });

    const filterSelect = document.createElement('select');
    filterSelect.className = className('events', 'filter');
    filterSelect.innerHTML = `
      <option value="">all</option>
      <option value="node">node</option>
      <option value="bb">blackboard</option>
      <option value="workflow">workflow</option>
      <option value="engine">engine</option>
    `;
    filterSelect.addEventListener('change', () => {
      this._filterCategory = (filterSelect.value as EventCategory) || null;
      this._render();
    });
    toolbar.appendChild(filterSelect);

    const clearBtn = el('button', { class: className('events', 'clear') });
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      this._entries = [];
      this._render();
    });
    toolbar.appendChild(clearBtn);

    body.appendChild(toolbar);

    // Log list
    this._list = el('div', { class: className('events', 'log') });
    this._list.addEventListener('scroll', () => {
      if (!this._list) return;
      const { scrollTop, scrollHeight, clientHeight } = this._list;
      this._autoScroll = scrollHeight - scrollTop - clientHeight < 20;
    });
    body.appendChild(this._list);
  }

  update(_snapshot: unknown): void {
    // On attach, we don't replay past events — just start fresh
    this._startTime = Date.now();
    this._entries = [];
    this._render();
  }

  pushEvent(type: string, category: EventCategory, summary: string, data?: unknown): void {
    this._entries.push({ time: Date.now(), type, category, summary, data });
    if (this._entries.length > this._maxEntries) {
      this._entries.shift();
    }
    this._renderLast();
  }

  onNodeEnter(node: Node, _workflow: Workflow): void {
    this.pushEvent('node:enter', 'node', node.id);
  }

  onNodeExit(node: Node, _workflow: Workflow): void {
    this.pushEvent('node:exit', 'node', node.id);
  }

  onEdgeTraverse(edge: Edge, _workflow: Workflow): void {
    this.pushEvent('edge:traverse', 'node', `${edge.from} \u2192 ${edge.to}`);
  }

  onBlackboardWrite(entries: BlackboardEntry[], _workflow: Workflow): void {
    for (const e of entries) {
      const val = truncate(typeof e.value === 'string' ? e.value : JSON.stringify(e.value));
      this.pushEvent('bb:write', 'bb', `${e.key}=${val}`);
    }
  }

  onWorkflowPush(_frame: StackFrame, workflow: Workflow): void {
    this.pushEvent('workflow:push', 'workflow', workflow.id);
  }

  onWorkflowPop(_frame: StackFrame, workflow: Workflow): void {
    this.pushEvent('workflow:pop', 'workflow', workflow.id);
  }

  onStackUnwind(discardedFrames: StackFrame[], targetDepth: number, restoredWorkflow: Workflow): void {
    this.pushEvent(
      'stack:unwind',
      'workflow',
      `\u21A9 depth=${targetDepth} (${discardedFrames.length} discarded) \u2192 ${restoredWorkflow.id}`,
    );
  }

  onEngineComplete(_workflow: Workflow): void {
    this.pushEvent('engine:complete', 'engine', 'done');
  }

  onEngineSuspend(reason: string): void {
    this.pushEvent('engine:suspend', 'engine', reason);
  }

  private _render(): void {
    if (!this._list) return;
    this._list.innerHTML = '';
    for (const entry of this._entries) {
      if (this._filterCategory && entry.category !== this._filterCategory) continue;
      this._list.appendChild(this._makeRow(entry));
    }
    this._scrollToBottom();
  }

  private _renderLast(): void {
    if (!this._list) return;
    const entry = this._entries[this._entries.length - 1];
    if (this._filterCategory && entry.category !== this._filterCategory) return;

    // Drop oldest DOM node if over limit
    while (this._list.childElementCount >= this._maxEntries) {
      this._list.firstElementChild?.remove();
    }

    this._list.appendChild(this._makeRow(entry));
    this._scrollToBottom();
  }

  private _makeRow(entry: EventEntry): HTMLElement {
    const row = el('div', { class: className('events', 'row') });

    const timeEl = el('span', { class: className('events', 'time') });
    timeEl.textContent = formatTime(entry.time - this._startTime);

    const typeEl = el('span', {
      class: `${className('events', 'type')} ${className('events', 'type', entry.category)}`,
    });
    typeEl.textContent = entry.type;

    const summaryEl = el('span', { class: className('events', 'summary') });
    summaryEl.textContent = entry.summary;

    row.append(timeEl, typeEl, summaryEl);
    row.addEventListener('click', () => this.events.emit('event-click', entry));
    return row;
  }

  private _scrollToBottom(): void {
    if (this._autoScroll && this._list) {
      this._list.scrollTop = this._list.scrollHeight;
    }
  }

  destroy(): void {
    this.events.dispose();
    super.destroy();
  }
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = ms % 1000;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${String(sec).padStart(2, '0')}.${String(m).padStart(3, '0')}`;
}

function truncate(s: string, max = 30): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}
