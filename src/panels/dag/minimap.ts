import type { LayoutResult } from './dag-layout.js';
import type { Transform } from './viewport.js';
import { className } from '../../core/class-name.js';

const MM_WIDTH = 120;
const MM_HEIGHT = 80;

export class Minimap {
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _layout: LayoutResult | null = null;
  private _svgRect: DOMRect | null = null;
  private _transform: Transform = { x: 0, y: 0, scale: 1 };
  private _onPan: ((dx: number, dy: number) => void) | null = null;
  private _dragging = false;

  constructor(container: HTMLElement, onPan: (dx: number, dy: number) => void) {
    this._onPan = onPan;
    this._canvas = document.createElement('canvas');
    this._canvas.width = MM_WIDTH * 2;  // retina
    this._canvas.height = MM_HEIGHT * 2;
    this._canvas.className = className('dag', 'minimap');
    this._canvas.style.width = `${MM_WIDTH}px`;
    this._canvas.style.height = `${MM_HEIGHT}px`;
    this._ctx = this._canvas.getContext('2d')!;
    this._ctx.scale(2, 2); // retina

    this._canvas.addEventListener('mousedown', (e) => {
      this._dragging = true;
      this._jumpTo(e);
      e.preventDefault();
      e.stopPropagation();
    });
    this._canvas.addEventListener('mousemove', (e) => {
      if (this._dragging) this._jumpTo(e);
    });
    window.addEventListener('mouseup', () => { this._dragging = false; });

    container.appendChild(this._canvas);
  }

  setLayout(layout: LayoutResult): void {
    this._layout = layout;
    this._draw();
  }

  setSvgRect(rect: DOMRect): void {
    this._svgRect = rect;
  }

  onTransformChange(t: Transform): void {
    this._transform = t;
    this._draw();
  }

  private _draw(): void {
    const ctx = this._ctx;
    const layout = this._layout;
    ctx.clearRect(0, 0, MM_WIDTH, MM_HEIGHT);

    if (!layout || layout.width === 0 || layout.height === 0) return;

    // Scale graph to fit minimap
    const pad = 4;
    const scaleX = (MM_WIDTH - pad * 2) / layout.width;
    const scaleY = (MM_HEIGHT - pad * 2) / layout.height;
    const scale = Math.min(scaleX, scaleY);
    const ox = (MM_WIDTH - layout.width * scale) / 2;
    const oy = (MM_HEIGHT - layout.height * scale) / 2;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, MM_WIDTH, MM_HEIGHT);

    // Edges
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;
    for (const edge of layout.edges) {
      if (edge.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(ox + edge.points[0].x * scale, oy + edge.points[0].y * scale);
      for (let i = 1; i < edge.points.length; i++) {
        ctx.lineTo(ox + edge.points[i].x * scale, oy + edge.points[i].y * scale);
      }
      ctx.stroke();
    }

    // Nodes as dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (const node of layout.nodes) {
      const x = ox + node.x * scale;
      const y = oy + node.y * scale;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Viewport rectangle
    if (this._svgRect && this._svgRect.width > 0) {
      const { x: tx, y: ty, scale: ts } = this._transform;
      // The visible area in graph coordinates
      const vx = -tx / ts;
      const vy = -ty / ts;
      const vw = this._svgRect.width / ts;
      const vh = this._svgRect.height / ts;

      ctx.strokeStyle = 'var(--rx-accent, #4fc3f7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        ox + vx * scale,
        oy + vy * scale,
        vw * scale,
        vh * scale,
      );
      ctx.fillStyle = 'rgba(79, 195, 247, 0.1)';
      ctx.fillRect(
        ox + vx * scale,
        oy + vy * scale,
        vw * scale,
        vh * scale,
      );
    }
  }

  private _jumpTo(e: MouseEvent): void {
    if (!this._layout || !this._svgRect || !this._onPan) return;
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const layout = this._layout;
    const pad = 4;
    const scaleX = (MM_WIDTH - pad * 2) / layout.width;
    const scaleY = (MM_HEIGHT - pad * 2) / layout.height;
    const scale = Math.min(scaleX, scaleY);
    const ox = (MM_WIDTH - layout.width * scale) / 2;
    const oy = (MM_HEIGHT - layout.height * scale) / 2;

    // Convert minimap coords to graph coords
    const gx = (mx - ox) / scale;
    const gy = (my - oy) / scale;

    // Center the main viewport on this point
    const ts = this._transform.scale;
    const newTx = -(gx * ts - this._svgRect.width / 2);
    const newTy = -(gy * ts - this._svgRect.height / 2);

    const dx = newTx - this._transform.x;
    const dy = newTy - this._transform.y;
    this._onPan(dx, dy);
  }

  destroy(): void {
    this._canvas.remove();
  }
}
