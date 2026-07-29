import type cytoscape from 'cytoscape';
import type { MathRenderer } from '../ui/math-renderer.js';

type GraphElement = cytoscape.NodeSingular | cytoscape.EdgeSingular;

interface MathLabelEntry {
  element: GraphElement;
  label: HTMLDivElement;
}

function numericOpacity(element: GraphElement, fallback: number): number {
  const value = Number(element.style('opacity'));
  return Number.isFinite(value) ? value : fallback;
}

export class GraphMathLabelLayer {
  private readonly layer = document.createElement('div');
  private readonly entries: MathLabelEntry[] = [];
  private frame = 0;

  constructor(
    private readonly cy: cytoscape.Core,
    graphContainer: HTMLElement,
    private readonly math: MathRenderer
  ) {
    this.layer.className = 'graph-math-label-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    graphContainer.insertAdjacentElement('afterend', this.layer);
    this.buildEntries();
    this.cy.on('render pan zoom position style data select unselect', () => this.schedule());
    this.schedule();
  }

  schedule(): void {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.sync();
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
      label.innerHTML = this.math.renderText(element.data('label'));
      this.layer.appendChild(label);
      this.entries.push({ element, label });
    };

    this.cy.edges().forEach((element) => add(element));
    this.cy.nodes().forEach((element) => add(element));
  }

  private sync(): void {
    const zoom = this.cy.zoom();
    for (const entry of this.entries) {
      const { element, label } = entry;
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
      if (element.isNode()) this.syncNode(element as cytoscape.NodeSingular, label, zoom);
      else this.syncEdge(element as cytoscape.EdgeSingular, label, zoom);
    }
  }

  private syncNode(node: cytoscape.NodeSingular, label: HTMLDivElement, zoom: number): void {
    const position = node.renderedPosition();
    const junction = node.data('kind') === 'junction';
    const fontSize = Math.max(0.5, Number(node.data('labelFontSize') ?? 13) * zoom);
    const maxWidth = (junction ? 92 : 144) * zoom;
    const maxHeight = (junction ? 54 : 52) * zoom;

    label.style.left = `${position.x}px`;
    label.style.top = `${position.y}px`;
    label.style.width = `${Math.max(1, maxWidth)}px`;
    label.style.maxHeight = `${Math.max(1, maxHeight)}px`;
    label.style.fontSize = `${fontSize}px`;
    label.style.transform = 'translate(-50%, -50%)';
  }

  private syncEdge(edge: cytoscape.EdgeSingular, label: HTMLDivElement, zoom: number): void {
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

    const synthetic = Number(edge.data('synthetic')) === 1;
    const fontSize = Math.max(0.5, 9 * zoom);
    const maxWidth = (synthetic ? 138 : 120) * zoom;
    const padding = Math.max(0.25, 3 * zoom);

    label.style.left = `${position.x}px`;
    label.style.top = `${position.y}px`;
    label.style.maxWidth = `${Math.max(1, maxWidth)}px`;
    label.style.fontSize = `${fontSize}px`;
    label.style.padding = `${padding}px`;
    label.style.borderWidth = `${Math.max(0.35, zoom)}px`;
    label.style.borderRadius = `${Math.max(0.5, 3 * zoom)}px`;
    label.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
  }
}
