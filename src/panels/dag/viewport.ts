export interface Transform {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

export class Viewport {
  private _transform: Transform = { x: 0, y: 0, scale: 1 };
  private _svg: SVGSVGElement;
  private _content: SVGGElement;
  private _listeners = new Set<(t: Transform) => void>();
  private _dragging = false;
  private _dragStart = { x: 0, y: 0 };

  private _onMouseDown: (e: MouseEvent) => void;
  private _onMouseMove: (e: MouseEvent) => void;
  private _onMouseUp: () => void;
  private _onWheel: (e: WheelEvent) => void;

  constructor(svg: SVGSVGElement, content: SVGGElement) {
    this._svg = svg;
    this._content = content;

    this._onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Only start drag on background (svg or content group), not on nodes
      const target = e.target as Element;
      if (target !== this._svg && !target.classList.contains('rx-dag_svg') && !target.classList.contains('rx-dag_content')) return;
      this._dragging = true;
      this._dragStart = { x: e.clientX - this._transform.x, y: e.clientY - this._transform.y };
      e.preventDefault();
    };

    this._onMouseMove = (e: MouseEvent) => {
      if (!this._dragging) return;
      this._transform.x = e.clientX - this._dragStart.x;
      this._transform.y = e.clientY - this._dragStart.y;
      this._apply();
    };

    this._onMouseUp = () => { this._dragging = false; };

    this._onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = this._svg.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this._transform.scale * delta));
      const ratio = newScale / this._transform.scale;

      this._transform.x = cx - ratio * (cx - this._transform.x);
      this._transform.y = cy - ratio * (cy - this._transform.y);
      this._transform.scale = newScale;
      this._apply();
    };

    svg.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    svg.addEventListener('wheel', this._onWheel, { passive: false });
  }

  getTransform(): Transform {
    return { ...this._transform };
  }

  pan(dx: number, dy: number): void {
    this._transform.x += dx;
    this._transform.y += dy;
    this._apply();
  }

  zoom(scale: number, center: { x: number; y: number }): void {
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const ratio = newScale / this._transform.scale;
    this._transform.x = center.x - ratio * (center.x - this._transform.x);
    this._transform.y = center.y - ratio * (center.y - this._transform.y);
    this._transform.scale = newScale;
    this._apply();
  }

  fitToContent(graphWidth: number, graphHeight: number): void {
    const rect = this._svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || graphWidth === 0 || graphHeight === 0) return;

    const pad = 16;
    const scaleX = (rect.width - pad * 2) / graphWidth;
    const scaleY = (rect.height - pad * 2) / graphHeight;
    const scale = Math.min(scaleX, scaleY, 2); // don't over-zoom small graphs

    this._transform.scale = scale;
    this._transform.x = (rect.width - graphWidth * scale) / 2;
    this._transform.y = (rect.height - graphHeight * scale) / 2;
    this._apply();
  }

  onTransformChange(handler: (t: Transform) => void): () => void {
    this._listeners.add(handler);
    return () => this._listeners.delete(handler);
  }

  private _apply(): void {
    const { x, y, scale } = this._transform;
    this._content.setAttribute('transform', `translate(${x}, ${y}) scale(${scale})`);
    for (const fn of this._listeners) fn(this._transform);
  }

  destroy(): void {
    this._svg.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this._svg.removeEventListener('wheel', this._onWheel);
    this._listeners.clear();
  }
}
