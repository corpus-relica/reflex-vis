import type { BlackboardEntry, Workflow } from '@corpus-relica/reflex';
import { Panel, type PanelOptions } from '../panel.js';
import { className } from '../../core/class-name.js';
import { el } from '../../core/dom.js';
import { Emitter } from '../../core/emitter.js';

export interface BlackboardPanelEvents {
  'source-click': { nodeId: string; workflowId: string };
  [key: string]: unknown;
}

interface DisplayEntry {
  key: string;
  value: unknown;
  source: { workflowId: string; nodeId: string; stackDepth: number };
  isLocal: boolean;
  timestamp?: number;
}

interface HistoryEntry {
  value: unknown;
  nodeId: string;
  workflowId: string;
  stackDepth: number;
  timestamp: number;
  step: number;
}

export class BlackboardPanel extends Panel {
  readonly name = 'blackboard';
  readonly label = 'Blackboard';
  readonly events = new Emitter<BlackboardPanelEvents>();

  private _table: HTMLElement | null = null;
  private _entries: DisplayEntry[] = [];
  private _history = new Map<string, HistoryEntry[]>();
  private _expanded = new Set<string>();
  private _stepCounter = 0;
  private _filter = '';
  private _showInherited = true;
  private _currentDepth = 0;

  constructor(container: HTMLElement, options?: PanelOptions) {
    super(container, options);
  }

  mount(body: HTMLElement): void {
    const toolbar = el('div', { class: className('bb', 'toolbar') });
    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.placeholder = 'Filter keys\u2026';
    filterInput.className = className('bb', 'filter');
    filterInput.addEventListener('input', () => {
      this._filter = filterInput.value.toLowerCase();
      this._render();
    });
    toolbar.appendChild(filterInput);

    const toggle = el('label', { class: className('bb', 'toggle') });
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => {
      this._showInherited = cb.checked;
      this._render();
    });
    toggle.append(cb, ' inherited');
    toolbar.appendChild(toggle);
    body.appendChild(toolbar);

    this._table = el('div', { class: className('bb', 'table') });
    body.appendChild(this._table);
  }

  update(snapshot: unknown): void {
    const snap = snapshot as { currentBlackboard?: BlackboardEntry[]; stack?: Array<{ blackboard: BlackboardEntry[] }> } | null;
    if (!snap) return;

    this._entries = [];
    this._history.clear();
    this._stepCounter = 0;
    this._currentDepth = snap.stack?.length ?? 0;

    if (snap.currentBlackboard) {
      for (const e of snap.currentBlackboard) {
        this._addEntry(e, true);
      }
    }
    if (snap.stack) {
      for (const frame of snap.stack) {
        for (const e of frame.blackboard) {
          this._addEntry(e, false);
        }
      }
    }
    this._render();
  }

  private _addEntry(e: BlackboardEntry, isLocal: boolean): void {
    this._stepCounter++;
    this._entries.push({
      key: e.key, value: e.value, source: e.source, isLocal,
      timestamp: e.timestamp,
    });
    const hist = this._history.get(e.key) ?? [];
    hist.push({
      value: e.value,
      nodeId: e.source.nodeId,
      workflowId: e.source.workflowId,
      stackDepth: e.source.stackDepth,
      timestamp: e.timestamp,
      step: this._stepCounter,
    });
    this._history.set(e.key, hist);
  }

  onBlackboardWrite(entries: BlackboardEntry[], _workflow: Workflow): void {
    for (const e of entries) {
      this._stepCounter++;
      const idx = this._entries.findIndex(
        (d) => d.key === e.key && d.source.stackDepth === e.source.stackDepth
      );
      const display: DisplayEntry = {
        key: e.key, value: e.value, source: e.source,
        isLocal: e.source.stackDepth === this._currentDepth,
        timestamp: e.timestamp,
      };
      if (idx >= 0) this._entries[idx] = display;
      else this._entries.unshift(display);

      const hist = this._history.get(e.key) ?? [];
      hist.push({
        value: e.value,
        nodeId: e.source.nodeId,
        workflowId: e.source.workflowId,
        stackDepth: e.source.stackDepth,
        timestamp: e.timestamp,
        step: this._stepCounter,
      });
      this._history.set(e.key, hist);
    }
    this._render();

    // Flash
    if (this._table) {
      this._table.querySelectorAll(`.${className('bb', 'row', 'flash')}`).forEach((r) => {
        r.classList.remove(className('bb', 'row', 'flash'));
      });
      for (const e of entries) {
        const row = this._table.querySelector(`[data-key="${CSS.escape(e.key)}"]`);
        if (row) row.classList.add(className('bb', 'row', 'flash'));
      }
    }
  }

  onWorkflowPush(): void { this._currentDepth++; }
  onWorkflowPop(): void { this._currentDepth = Math.max(0, this._currentDepth - 1); }

  private _render(): void {
    if (!this._table) return;
    this._table.innerHTML = '';

    const header = el('div', { class: className('bb', 'header') });
    header.innerHTML = `<span>Key</span><span>Value</span><span>Source</span>`;
    this._table.appendChild(header);

    const seen = new Map<string, DisplayEntry>();
    for (const e of this._entries) {
      if (!seen.has(e.key)) seen.set(e.key, e);
    }

    for (const [, entry] of seen) {
      if (this._filter && !entry.key.toLowerCase().includes(this._filter)) continue;
      if (!this._showInherited && !entry.isLocal) continue;

      const isExpanded = this._expanded.has(entry.key);
      const history = this._history.get(entry.key) ?? [];
      const hasHistory = history.length > 1;

      const row = el('div', {
        class: className('bb', 'row') + (entry.isLocal ? '' : ` ${className('bb', 'row', 'inherited')}`),
        'data-key': entry.key,
      });

      const keyEl = el('span', { class: className('bb', 'key') });
      if (hasHistory) {
        const arrow = el('span', { class: className('bb', 'expand') });
        arrow.textContent = isExpanded ? '\u25BC ' : '\u25B6 ';
        arrow.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._expanded.has(entry.key)) this._expanded.delete(entry.key);
          else this._expanded.add(entry.key);
          this._render();
        });
        keyEl.appendChild(arrow);
      }
      keyEl.append(entry.key);

      const valEl = el('span', { class: className('bb', 'value') });
      valEl.textContent = truncateValue(entry.value);
      valEl.title = JSON.stringify(entry.value, null, 2);

      const srcEl = el('span', { class: className('bb', 'source') });
      srcEl.textContent = `${entry.source.nodeId} (${entry.isLocal ? 'local' : `depth ${entry.source.stackDepth}`})`;
      srcEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.events.emit('source-click', {
          nodeId: entry.source.nodeId,
          workflowId: entry.source.workflowId,
        });
      });

      row.append(keyEl, valEl, srcEl);
      this._table.appendChild(row);

      // History rows
      if (isExpanded && hasHistory) {
        for (let i = history.length - 1; i >= 0; i--) {
          const h = history[i];
          const hRow = el('div', { class: className('bb', 'history-row') });

          const stepEl = el('span', { class: className('bb', 'history-step') });
          stepEl.textContent = `step ${h.step}`;

          const hNodeEl = el('span', { class: className('bb', 'history-node') });
          hNodeEl.textContent = h.nodeId;
          hNodeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.events.emit('source-click', { nodeId: h.nodeId, workflowId: h.workflowId });
          });

          const hValEl = el('span', { class: className('bb', 'history-value') });
          hValEl.textContent = truncateValue(h.value);

          const isCurrent = i === history.length - 1;
          const hTag = el('span', { class: className('bb', 'history-tag') });
          hTag.textContent = isCurrent ? '(current)' : `(depth ${h.stackDepth})`;

          hRow.append(stepEl, hNodeEl, hValEl, hTag);
          this._table.appendChild(hRow);
        }
      }
    }
  }

  destroy(): void {
    this.events.dispose();
    super.destroy();
  }
}

function truncateValue(value: unknown, maxLen = 40): string {
  const str = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
  if (str && str.length > maxLen) return str.slice(0, maxLen - 1) + '\u2026';
  return str ?? 'undefined';
}
