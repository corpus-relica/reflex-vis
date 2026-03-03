import type { BlackboardEntry, Workflow } from '@corpus-relica/reflex';
import { Panel, type PanelOptions } from '../panel.js';
import { className } from '../../core/class-name.js';
import { el } from '../../core/dom.js';
import { Emitter } from '../../core/emitter.js';

export interface BlackboardPanelEvents {
  'source-click': { nodeId: string; workflowId: string };
}

interface DisplayEntry {
  key: string;
  value: unknown;
  source: { workflowId: string; nodeId: string; stackDepth: number };
  isLocal: boolean;
}

export class BlackboardPanel extends Panel {
  readonly name = 'blackboard';
  readonly label = 'Blackboard';
  readonly events = new Emitter<BlackboardPanelEvents>();

  private _table: HTMLElement | null = null;
  private _entries: DisplayEntry[] = [];
  private _filter = '';
  private _showInherited = true;
  private _currentDepth = 0;
  private _filterInput: HTMLInputElement | null = null;

  constructor(container: HTMLElement, options?: PanelOptions) {
    super(container, options);
  }

  mount(body: HTMLElement): void {
    // Toolbar
    const toolbar = el('div', { class: className('bb', 'toolbar') });
    this._filterInput = document.createElement('input');
    this._filterInput.type = 'text';
    this._filterInput.placeholder = 'Filter keys\u2026';
    this._filterInput.className = className('bb', 'filter');
    this._filterInput.addEventListener('input', () => {
      this._filter = this._filterInput!.value.toLowerCase();
      this._render();
    });
    toolbar.appendChild(this._filterInput);

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

    // Table
    this._table = el('div', { class: className('bb', 'table') });
    body.appendChild(this._table);
  }

  update(snapshot: unknown): void {
    const snap = snapshot as { currentBlackboard?: BlackboardEntry[]; stack?: Array<{ blackboard: BlackboardEntry[] }> } | null;
    if (!snap) return;

    this._entries = [];
    this._currentDepth = snap.stack?.length ?? 0;

    // Current (local) entries
    if (snap.currentBlackboard) {
      for (const e of snap.currentBlackboard) {
        this._entries.push({
          key: e.key,
          value: e.value,
          source: e.source,
          isLocal: true,
        });
      }
    }

    // Parent scope entries
    if (snap.stack) {
      for (const frame of snap.stack) {
        for (const e of frame.blackboard) {
          this._entries.push({
            key: e.key,
            value: e.value,
            source: e.source,
            isLocal: false,
          });
        }
      }
    }
    this._render();
  }

  onBlackboardWrite(entries: BlackboardEntry[], workflow: Workflow): void {
    for (const e of entries) {
      // Remove existing entry with same key at same depth (update)
      const idx = this._entries.findIndex(
        (d) => d.key === e.key && d.source.stackDepth === e.source.stackDepth
      );
      const display: DisplayEntry = {
        key: e.key,
        value: e.value,
        source: e.source,
        isLocal: e.source.stackDepth === this._currentDepth,
      };
      if (idx >= 0) {
        this._entries[idx] = display;
      } else {
        this._entries.unshift(display);
      }
    }
    this._render();

    // Flash new entries
    if (this._table) {
      this._table.querySelectorAll(`.${className('bb', 'row', 'flash')}`).forEach((r) => {
        r.classList.remove(className('bb', 'row', 'flash'));
      });
      for (const e of entries) {
        const row = this._table.querySelector(`[data-key="${CSS.escape(e.key)}"]`);
        if (row) {
          row.classList.add(className('bb', 'row', 'flash'));
        }
      }
    }
  }

  onWorkflowPush(): void { this._currentDepth++; }
  onWorkflowPop(): void { this._currentDepth = Math.max(0, this._currentDepth - 1); }

  private _render(): void {
    if (!this._table) return;
    this._table.innerHTML = '';

    // Header row
    const header = el('div', { class: className('bb', 'header') });
    header.innerHTML = `<span>Key</span><span>Value</span><span>Source</span>`;
    this._table.appendChild(header);

    // Deduplicate — latest per key wins
    const seen = new Map<string, DisplayEntry>();
    for (const e of this._entries) {
      if (!seen.has(e.key)) seen.set(e.key, e);
    }

    for (const [, entry] of seen) {
      if (this._filter && !entry.key.toLowerCase().includes(this._filter)) continue;
      if (!this._showInherited && !entry.isLocal) continue;

      const row = el('div', {
        class: className('bb', 'row') + (entry.isLocal ? '' : ` ${className('bb', 'row', 'inherited')}`),
        'data-key': entry.key,
      });

      const keyEl = el('span', { class: className('bb', 'key') });
      keyEl.textContent = entry.key;

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
