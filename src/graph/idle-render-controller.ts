import type cytoscape from 'cytoscape';

interface ControllableRenderer {
  destroyed: boolean;
  renderLoopStarted: boolean;
  requestedFrame: boolean;
  redraw: () => void;
  startRenderLoop: () => void;
}

/**
 * Cytoscape's canvas renderer requests an animation frame forever, including
 * when there is nothing to draw.  Keep the already-painted canvases in place,
 * but park that loop after activity and restart it before the next graph event.
 */
export class IdleRenderController {
  private timer = 0;
  private parked = false;
  private readonly renderer: ControllableRenderer;
  private readonly wake = (): void => this.noteActivity();

  constructor(private readonly cy: cytoscape.Core, container: HTMLElement) {
    this.renderer = (cy as unknown as { renderer: () => ControllableRenderer }).renderer();
    cy.on('add remove data style position select unselect pan zoom resize', this.wake);
    container.addEventListener('pointerdown', this.wake, { capture: true });
    container.addEventListener('pointermove', this.wake, { capture: true });
    container.addEventListener('wheel', this.wake, { capture: true, passive: true });
    this.noteActivity();
  }

  noteActivity(): void {
    if (this.parked) {
      this.parked = false;
      this.renderer.destroyed = false;
      this.renderer.renderLoopStarted = false;
      this.renderer.startRenderLoop();
      this.renderer.redraw();
    }
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.parkWhenSettled(), 500);
  }

  private parkWhenSettled(): void {
    this.timer = 0;
    if (this.cy.animated() || this.renderer.requestedFrame) {
      this.noteActivity();
      return;
    }
    // The renderer's next scheduled frame sees this flag and does not enqueue
    // another one. It does not remove or clear the canvases.
    this.parked = true;
    this.renderer.destroyed = true;
  }
}
