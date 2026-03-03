const TAG = 'data-rx-devtools';

export function embedStyle(css: string, id = 'default'): () => void {
  const selector = `style[${TAG}="${id}"]`;
  if (document.querySelector(selector)) {
    return () => document.querySelector(selector)?.remove();
  }
  const el = document.createElement('style');
  el.setAttribute(TAG, id);
  el.textContent = css;
  document.head.appendChild(el);
  return () => el.remove();
}
