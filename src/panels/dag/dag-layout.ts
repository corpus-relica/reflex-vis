import dagre from 'dagre';
import type { Workflow } from '@corpus-relica/reflex';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  type: 'standard' | 'terminal' | 'invocation';
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  points: Array<{ x: number; y: number }>;
  guarded: boolean;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 36;

const cache = new Map<string, LayoutResult>();

export function computeLayout(workflow: Workflow): LayoutResult {
  const cached = cache.get(workflow.id);
  if (cached) return cached;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 20, ranksep: 40, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));

  // Collect terminal node IDs (no outgoing edges)
  const hasOutgoing = new Set<string>();
  for (const edge of workflow.edges) hasOutgoing.add(edge.from);

  for (const [id, node] of Object.entries(workflow.nodes)) {
    let type: LayoutNode['type'] = 'standard';
    if (node.invokes) type = 'invocation';
    else if (!hasOutgoing.has(id)) type = 'terminal';

    g.setNode(id, {
      label: node.description || id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      type,
    });
  }

  for (const edge of workflow.edges) {
    g.setEdge(edge.from, edge.to, { id: edge.id, guarded: !!edge.guard });
  }

  dagre.layout(g);

  const nodes: LayoutNode[] = [];
  for (const id of g.nodes()) {
    const n = g.node(id);
    if (!n) continue;
    nodes.push({
      id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      label: n.label ?? id,
      type: (n as any).type ?? 'standard',
    });
  }

  const edges: LayoutEdge[] = [];
  for (const e of g.edges()) {
    const edgeData = g.edge(e);
    if (!edgeData) continue;
    edges.push({
      id: (edgeData as any).id ?? `${e.v}-${e.w}`,
      source: e.v,
      target: e.w,
      points: edgeData.points ?? [],
      guarded: (edgeData as any).guarded ?? false,
    });
  }

  const graphMeta = g.graph();
  const result: LayoutResult = {
    nodes,
    edges,
    width: graphMeta.width ?? 0,
    height: graphMeta.height ?? 0,
  };

  cache.set(workflow.id, result);
  return result;
}

export function clearLayoutCache(workflowId?: string): void {
  if (workflowId) cache.delete(workflowId);
  else cache.clear();
}
