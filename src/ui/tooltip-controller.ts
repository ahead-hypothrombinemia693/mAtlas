import type cytoscape from 'cytoscape';
import { byId } from '../core/dom.js';
import { renderHtml } from './render.js';

export type PointerEventLike = cytoscape.EventObject | MouseEvent;

export class TooltipController {
  private frame = 0;
  private pendingEvent: PointerEventLike | null = null;
  private renderedHtml = '';
  private width = 0;
  private height = 0;

  constructor(private readonly elementId = 'tooltip') {}

  show(html: string, event: PointerEventLike): void {
    const tooltip = byId(this.elementId);
    if (html !== this.renderedHtml) {
      renderHtml(tooltip, html);
      this.renderedHtml = html;
      this.width = 0;
      this.height = 0;
    }
    tooltip.hidden = false;
    if (!this.width || !this.height) {
      this.width = tooltip.offsetWidth;
      this.height = tooltip.offsetHeight;
    }
    this.positionNow(event);
  }

  position(event: PointerEventLike): void {
    this.pendingEvent = event;
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      const pending = this.pendingEvent;
      this.pendingEvent = null;
      if (pending) this.positionNow(pending);
    });
  }

  private positionNow(event: PointerEventLike): void {
    const tooltip = byId(this.elementId);
    if (tooltip.hidden) return;
    const original = 'originalEvent' in event && event.originalEvent ? event.originalEvent : event;
    const pointer = original as MouseEvent;
    const clientX = pointer.clientX ?? 20;
    const clientY = pointer.clientY ?? 20;
    const left = Math.min(clientX + 14, window.innerWidth - this.width - 12);
    const top = Math.min(clientY + 14, window.innerHeight - this.height - 12);
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  hide(): void {
    this.pendingEvent = null;
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.frame = 0;
    byId(this.elementId).hidden = true;
  }
}
