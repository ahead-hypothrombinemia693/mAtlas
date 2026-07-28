import type cytoscape from 'cytoscape';
import { byId } from '../core/dom.js';

export type PointerEventLike = cytoscape.EventObject | MouseEvent;

export class TooltipController {
  constructor(private readonly elementId = 'tooltip') {}

  show(html: string, event: PointerEventLike): void {
    const tooltip = byId(this.elementId);
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    this.position(event);
  }

  position(event: PointerEventLike): void {
    const tooltip = byId(this.elementId);
    if (tooltip.hidden) return;
    const original = 'originalEvent' in event && event.originalEvent ? event.originalEvent : event;
    const pointer = original as MouseEvent;
    const clientX = pointer.clientX ?? 20;
    const clientY = pointer.clientY ?? 20;
    const left = Math.min(clientX + 14, window.innerWidth - tooltip.offsetWidth - 12);
    const top = Math.min(clientY + 14, window.innerHeight - tooltip.offsetHeight - 12);
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  hide(): void {
    byId(this.elementId).hidden = true;
  }
}
