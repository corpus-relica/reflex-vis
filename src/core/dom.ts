export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

export function text(content: string): Text {
  return document.createTextNode(content);
}

export function remove(node: Node): void {
  node.parentNode?.removeChild(node);
}
