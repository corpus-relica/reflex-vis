export function embedStyle(doc: Document, id: string, css: string): void {
  if (doc.querySelector(`style[data-rx-devtools="${id}"]`)) {
    return;
  }
  const el = doc.createElement('style');
  el.setAttribute('data-rx-devtools', id);
  el.textContent = css;
  doc.head.appendChild(el);
}
