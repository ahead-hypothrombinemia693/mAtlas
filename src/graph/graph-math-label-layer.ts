import type cytoscape from 'cytoscape';
import type { MathRenderer } from '../ui/math-renderer.js';
import { renderHtml } from '../ui/render.js';

type GraphElement = cytoscape.NodeSingular | cytoscape.EdgeSingular;

interface MathLabelEntry {
  element: GraphElement;
  label: HTMLDivElement;
}

const VIEWPORT_DIRTY = 1;
const GEOMETRY_DIRTY = 2;
const STATE_DIRTY = 4;
const ALL_DIRTY = VIEWPORT_DIRTY | GEOMETRY_DIRTY | STATE_DIRTY;

function numericOpacity(element: GraphElement, fallback: number): number {
  const value = Number(element.style('opacity'));
  return Number.isFinite(value) ? value : fallback;
}

export class GraphMathLabelLayer {
  private readonly layer = document.createElement('div');
  private readonly viewport = document.createElement('div');
  private readonly entries: MathLabelEntry[] = [];
  private frame = 0;
  private dirty = 0;

  constructor(
    private readonly cy: cytoscape.Core,
    graphContainer: HTMLElement,
    private readonly math: MathRenderer
  ) {
    this.layer.className = 'graph-math-label-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    this.viewport.className = 'graph-math-label-viewport';
    this.layer.appendChild(this.viewport);
    graphContainer.insertAdjacentElement('afterend', this.layer);
    this.buildEntries();

    // Pan and zoom are the hot path: one compositor transform updates every label.
    this.cy.on('pan zoom resize', () => this.schedule(VIEWPORT_DIRTY));
    this.cy.on('position', () => this.schedule(GEOMETRY_DIRTY));
    this.cy.on('style data', () => this.schedule(GEOMETRY_DIRTY | STATE_DIRTY));
    this.cy.on('select unselect', () => this.schedule(STATE_DIRTY));
    this.schedule(ALL_DIRTY);
  }

  schedule(dirty = ALL_DIRTY): void {
    this.dirty |= dirty;
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      const pending = this.dirty;
      this.dirty = 0;
      if (pending & VIEWPORT_DIRTY) this.syncViewport();
      if (pending & GEOMETRY_DIRTY) this.syncGeometry();
      if (pending & STATE_DIRTY) this.syncState();
    });
  }

  private buildEntries(): void {
    const add = (element: GraphElement): void => {
      if (Number(element.data('hasMathLabel')) !== 1) return;
      const label = document.createElement('div');
      const isNode = element.isNode();
      const isJunction = element.data('kind') === 'junction';
      const isSynthetic = Number(element.data('synthetic')) === 1;
      label.className = isNode
        ? `graph-math-label graph-math-node-label${isJunction ? ' junction' : ''}`
        : `graph-math-label graph-math-edge-label${isSynthetic ? ' synthetic' : ''}`;
      renderHtml(label, this.math.renderText(element.data('label')));

      if (isNode) {
        label.style.width = `${isJunction ? 92 : 144}px`;
        label.style.maxHeight = `${isJunction ? 54 : 52}px`;
        label.style.transform = 'translate(-50%, -50%)';
      } else {
        label.style.maxWidth = `${isSynthetic ? 138 : 120}px`;
        label.style.fontSize = '9px';
        label.style.padding = '3px';
        label.style.borderWidth = '1px';
        label.style.borderRadius = '3px';
      }

      this.viewport.appendChild(label);
      this.entries.push({ element, label });
    };

    this.cy.edges().forEach((element: cytoscape.EdgeSingular) => add(element));
    this.cy.nodes().forEach((element: cytoscape.NodeSingular) => add(element));
  }

  private syncViewport(): void {
    const pan = this.cy.pan();
    const zoom = this.cy.zoom();
    this.viewport.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`;
  }

  private syncGeometry(): void {
    const pan = this.cy.pan();
    const zoom = this.cy.zoom();
    for (const { element, label } of this.entries) {
      if (element.hasClass('filter-hidden')
        || element.style('display') === 'none'
        || (element.isEdge() && element.hasClass('edge-labels-off'))) continue;
      if (element.isNode()) this.syncNodeGeometry(element as cytoscape.NodeSingular, label);
      else this.syncEdgeGeometry(element as cytoscape.EdgeSingular, label, pan, zoom);
    }
  }

  private syncState(): void {
    for (const { element, label } of this.entries) {
      const hidden = element.hasClass('filter-hidden')
        || element.style('display') === 'none'
        || (element.isEdge() && element.hasClass('edge-labels-off'));
      if (hidden) {
        label.hidden = true;
        continue;
      }

      const opacity = numericOpacity(element, 1);
      if (opacity <= 0.001) {
        label.hidden = true;
        continue;
      }

      label.hidden = false;
      label.style.opacity = String(opacity);
      label.style.zIndex = element.selected() ? '4' : element.isNode() ? '2' : '1';
    }
  }

  private syncNodeGeometry(node: cytoscape.NodeSingular, label: HTMLDivElement): void {
    const position = node.position();
    label.style.left = `${position.x}px`;
    label.style.top = `${position.y}px`;
    label.style.fontSize = `${Math.max(0.5, Number(node.data('labelFontSize') ?? 13))}px`;
  }

  private syncEdgeGeometry(
    edge: cytoscape.EdgeSingular,
    label: HTMLDivElement,
    pan: cytoscape.Position,
    zoom: number
  ): void {
    const position = edge.renderedMidpoint();
    const source = edge.renderedSourceEndpoint();
    const target = edge.renderedTargetEndpoint();
    let dx = target.x - source.x;
    let dy = target.y - source.y;
    if (Math.abs(dx) + Math.abs(dy) < 0.001) {
      const controls = edge.renderedControlPoints();
      if (controls.length >= 2) {
        dx = controls[controls.length - 1]!.x - controls[0]!.x;
        dy = controls[controls.length - 1]!.y - controls[0]!.y;
      }
    }
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;

    label.style.left = `${(position.x - pan.x) / zoom}px`;
    label.style.top = `${(position.y - pan.y) / zoom}px`;
    label.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
  }
}
