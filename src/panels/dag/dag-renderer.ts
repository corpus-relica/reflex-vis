import type { LayoutResult, LayoutNode, LayoutEdge } from './dag-layout.js';
import { className } from '../../core/class-name.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type NodeState = 'unvisited' | 'active' | 'visited';
export type EdgeState = 'untraveled' | 'active' | 'traveled';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export class DagRenderer {
  private _svg: SVGSVGElement;
  private _content: SVGGElement;  // transform group for pan/zoom
  private _nodeEls = new Map<string, SVGGElement>();
  private _edgeEls = new Map<string, SVGPathElement>();
  private _nodeStates = new Map<string, NodeState>();
  private _edgeStates = new Map<string, EdgeState>();

  constructor(container: HTMLElement) {
    this._svg = svgEl('svg', { class: className('dag', 'svg') });
    this._content = svgEl('g', { class: className('dag', 'content') });

    // Arrowhead marker
    const defs = svgEl('defs');
    const marker = svgEl('marker', {
      id: 'rx-arrow',
      viewBox: '0 0 10 10',
      refX: '10', refY: '5',
      markerWidth: '6', markerHeight: '6',
      orient: 'auto-start-reverse',
    });
    marker.appendChild(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--rx-text-muted)' }));
    defs.appendChild(marker);

    const activeMarker = svgEl('marker', {
      id: 'rx-arrow-active',
      viewBox: '0 0 10 10',
      refX: '10', refY: '5',
      markerWidth: '6', markerHeight: '6',
      orient: 'auto-start-reverse',
    });
    activeMarker.appendChild(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--rx-accent)' }));
    defs.appendChild(activeMarker);

    this._svg.appendChild(defs);
    this._svg.appendChild(this._content);
    container.appendChild(this._svg);
  }

  get svg(): SVGSVGElement { return this._svg; }
  get contentGroup(): SVGGElement { return this._content; }

  render(layout: LayoutResult): void {
    this._content.innerHTML = '';
    this._nodeEls.clear();
    this._edgeEls.clear();
    this._nodeStates.clear();
    this._edgeStates.clear();

    // No viewBox — viewport transform handles all pan/zoom
    // Edges first (behind nodes)
    for (const edge of layout.edges) {
      const path = this._renderEdge(edge);
      this._content.appendChild(path);
      this._edgeEls.set(edge.id, path);
      this._edgeStates.set(edge.id, 'untraveled');
    }

    // Nodes
    for (const node of layout.nodes) {
      const g = this._renderNode(node);
      this._content.appendChild(g);
      this._nodeEls.set(node.id, g);
      this._nodeStates.set(node.id, 'unvisited');
    }
  }

  setNodeState(nodeId: string, state: NodeState): void {
    const el = this._nodeEls.get(nodeId);
    if (!el) return;
    const prev = this._nodeStates.get(nodeId);
    if (prev) el.classList.remove(className('dag', 'node', prev));
    el.classList.add(className('dag', 'node', state));
    this._nodeStates.set(nodeId, state);
  }

  setEdgeState(edgeId: string, state: EdgeState): void {
    const el = this._edgeEls.get(edgeId);
    if (!el) return;
    const prev = this._edgeStates.get(edgeId);
    if (prev) el.classList.remove(className('dag', 'edge', prev));
    el.classList.add(className('dag', 'edge', state));
    this._edgeStates.set(edgeId, state);
  }

  // Find edge ID by source→target
  findEdge(from: string, to: string): string | undefined {
    for (const [id, el] of this._edgeEls) {
      if (el.dataset.from === from && el.dataset.to === to) return id;
    }
    return undefined;
  }

  private _renderNode(node: LayoutNode): SVGGElement {
    const g = svgEl('g', {
      class: `${className('dag', 'node')} ${className('dag', 'node', node.type)}`,
      'data-id': node.id,
    });
    g.setAttribute('transform', `translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`);

    const rx = node.type === 'terminal' ? '4' : '6';
    const rect = svgEl('rect', {
      width: String(node.width),
      height: String(node.height),
      rx,
      class: className('dag', 'node-bg'),
    });
    if (node.type === 'terminal') {
      rect.setAttribute('stroke-width', '2');
    }

    const text = svgEl('text', {
      x: String(node.width / 2),
      y: String(node.height / 2 + 1),
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      class: className('dag', 'node-label'),
    });
    text.textContent = node.label.length > 16 ? node.label.slice(0, 15) + '\u2026' : node.label;

    g.append(rect, text);
    return g;
  }

  private _renderEdge(edge: LayoutEdge): SVGPathElement {
    const pts = edge.points;
    let d = '';
    if (pts.length > 0) {
      d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x} ${pts[i].y}`;
      }
    }

    const path = svgEl('path', {
      d,
      class: `${className('dag', 'edge')} ${className('dag', 'edge', 'untraveled')}` +
        (edge.guarded ? ` ${className('dag', 'edge', 'guarded')}` : ''),
      'marker-end': 'url(#rx-arrow)',
      'data-id': edge.id,
      'data-from': edge.source,
      'data-to': edge.target,
    });
    return path;
  }

  destroy(): void {
    this._svg.remove();
    this._nodeEls.clear();
    this._edgeEls.clear();
  }
}
