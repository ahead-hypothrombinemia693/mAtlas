import type cytoscape from 'cytoscape';
import { escapeHtml } from '../core/dom.js';
import type { AppState } from '../types.js';
import type { GraphModel } from '../model/graph-model.js';

export interface FieldBandControllerOptions {
  cy: cytoscape.Core;
  model: GraphModel;
  state: AppState;
  isMobileLayout: () => boolean;
  containerId?: string;
}

export class FieldBandController {
  private frame = 0;
  private readonly containerId: string;

  constructor(private readonly options: FieldBandControllerOptions) {
    this.containerId = options.containerId ?? 'fieldBands';
  }

  clear(): void {
    const container = document.getElementById(this.containerId);
    if (container instanceof HTMLElement) container.replaceChildren();
  }

  update(): void {
    const { cy, model, state } = this.options;
    if (state.layout !== 'atlas') {
      this.clear();
      return;
    }

    const container = document.getElementById(this.containerId);
    if (!(container instanceof HTMLElement)) return;
    container.replaceChildren();

    for (const fieldId of model.fieldOrder) {
      const nodes = cy.nodes().not('.filter-hidden').filter((element) => {
        const record = model.nodeRecord.get(element.id());
        return record ? model.nodePrimaryField(record) === fieldId : false;
      });
      if (nodes.empty()) continue;

      const field = model.data.fields[fieldId];
      if (!field) continue;
      const box = nodes.renderedBoundingBox({ includeLabels: true, includeOverlays: false });
      const band = document.createElement('div');
      band.className = 'field-band';
      band.style.left = `${box.x1 - 28}px`;
      band.style.top = `${box.y1 - 52}px`;
      band.style.width = `${box.w + 56}px`;
      band.style.height = `${box.h + 86}px`;
      band.style.setProperty('--field-color', field.color);
      band.innerHTML = `<span>${escapeHtml(field.label)}</span>`;
      container.appendChild(band);
    }
  }

  schedule(): void {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      if (this.options.isMobileLayout()) this.clear();
      else this.update();
    });
  }
}
