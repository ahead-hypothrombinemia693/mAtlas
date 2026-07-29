import { byId, escapeHtml } from '../core/dom.js';
import { moveSequenceIndex, sequenceIndexForNode } from '../state/view-sequence.js';
import { resolveViewSurface } from './view-surface.js';
import type { AtlasView, SelectionTarget } from '../types.js';
import type { MathRenderer } from './math-renderer.js';
import { renderHtml } from './render.js';

const WELCOME_STORAGE_KEY = 'human-knowledge-atlas:views-welcome-dismissed:v1';

export interface ViewsControllerOptions {
  views: readonly AtlasView[];
  activeView: () => AtlasView | null;
  currentSelection: () => SelectionTarget | null;
  activateNode: (nodeId: string) => boolean;
  nodeLabel: (nodeId: string) => string;
  viewPageUrl: (viewId: string) => string;
  isMobileLayout: () => boolean;
  detailsOpen: () => boolean;
  math: MathRenderer;
}

export class ViewsController {
  private activeViewId: string | null = null;
  private sequenceIndex = 0;
  private bannerDetailsOpen = true;

  constructor(private readonly options: ViewsControllerOptions) {}

  initialize(): void {
    this.buildDialog();
    this.syncActiveView();
    this.bindEvents();
    this.maybeShowWelcome();
  }

  syncActiveView(): void {
    const view = this.options.activeView();
    const selection = this.options.currentSelection();
    if (!view) {
      this.activeViewId = null;
      this.sequenceIndex = 0;
    } else {
      const baseIndex = this.activeViewId === view.id ? this.sequenceIndex : 0;
      this.activeViewId = view.id;
      this.sequenceIndex = sequenceIndexForNode(
        view.nodeSequence,
        selection?.kind === 'node' ? selection.id : null,
        baseIndex
      );
    }

    const button = byId<HTMLButtonElement>('viewsButton');
    const label = button.querySelector<HTMLElement>('.views-button-label');
    button.classList.toggle('active', Boolean(view));
    button.setAttribute('aria-label', view ? `Current view: ${view.title}. Browse views` : 'Browse guided views');
    button.title = view ? `Current view: ${view.title}` : 'Browse guided views';
    if (label) label.textContent = view ? view.title : 'Views';

    const banner = byId<HTMLElement>('viewBanner');
    const detailsContext = byId<HTMLElement>('mobileViewContext');
    if (!view) {
      banner.replaceChildren();
      detailsContext.replaceChildren();
      this.buildDialog();
      this.syncPresentation();
      return;
    }

    renderHtml(banner, this.renderActiveBanner(view));
    renderHtml(detailsContext, this.renderMobileDetailsContext(view));
    this.buildDialog();
    this.syncPresentation();
  }

  syncSelection(target: SelectionTarget | null): void {
    const view = this.options.activeView();
    if (!view || target?.kind !== 'node') return;
    const nextIndex = view.nodeSequence.indexOf(target.id);
    if (nextIndex < 0 || nextIndex === this.sequenceIndex) return;
    this.sequenceIndex = nextIndex;
    renderHtml(byId<HTMLElement>('viewBanner'), this.renderActiveBanner(view));
    renderHtml(byId<HTMLElement>('mobileViewContext'), this.renderMobileDetailsContext(view));
    this.syncPresentation();
  }

  syncPresentation(): void {
    const view = this.options.activeView();
    const visibility = resolveViewSurface({
      active: Boolean(view),
      mobile: this.options.isMobileLayout(),
      detailsOpen: this.options.detailsOpen()
    });
    byId<HTMLElement>('viewBanner').hidden = !visibility.graphIntroduction;
    byId<HTMLElement>('mobileViewContext').hidden = !visibility.detailsContext;
  }

  open(): void {
    this.buildDialog();
    const dialog = byId<HTMLDialogElement>('viewsDialog');
    if (!dialog.open) dialog.showModal();
  }

  private bindEvents(): void {
    byId('viewsButton').addEventListener('click', () => this.open());
    byId('viewBanner').addEventListener('click', (event) => this.handleViewSurfaceClick(event));
    byId('viewBanner').addEventListener('toggle', (event) => this.handleViewBannerToggle(event as Event));
    byId('mobileViewContext').addEventListener('click', (event) => this.handleViewSurfaceClick(event));
    byId('viewsWelcome').addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-welcome-explore]')) {
        this.dismissWelcome();
        this.open();
      } else if (target.closest('[data-welcome-dismiss]')) {
        this.dismissWelcome();
      }
    });
  }

  private handleViewSurfaceClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('[data-view-prev]')) {
      this.navigateSequence(-1);
    } else if (target.closest('[data-view-next]')) {
      this.navigateSequence(1);
    } else if (target.closest('[data-open-views]')) {
      this.open();
    }
  }

  private handleViewBannerToggle(event: Event): void {
    const details = (event.target as HTMLElement).closest('details.view-context-details') as HTMLDetailsElement | null;
    if (details) {
      this.bannerDetailsOpen = details.open;
    }
  }

  private navigateSequence(direction: -1 | 1): void {
    const view = this.options.activeView();
    if (!view) return;
    const nextIndex = moveSequenceIndex(view.nodeSequence, this.sequenceIndex, direction);
    if (nextIndex === null) return;
    const nodeId = view.nodeSequence[nextIndex];
    if (!nodeId || !this.options.activateNode(nodeId)) return;
    this.sequenceIndex = nextIndex;
    this.syncSelection({ kind: 'node', id: nodeId });
  }

  private buildDialog(): void {
    const active = this.options.activeView();
    const featured = this.options.views.filter((view) => view.featured);
    const other = this.options.views.filter((view) => !view.featured);
    renderHtml(byId('viewsContent'), `
      <p class="views-intro">Each view is a curated sequence through a named set of filters, relation types, and display choices. Previous and Next follow the suggested path; you can still explore any other concept without losing your place.</p>
      ${this.renderViewSection('Featured paths', featured, active)}
      ${other.length ? this.renderViewSection('More views', other, active) : ''}`);
  }

  private renderViewSection(title: string, views: readonly AtlasView[], active: AtlasView | null): string {
    return `<section class="views-section"><h3>${escapeHtml(title)}</h3><div class="views-grid">${views.map((view) => this.renderCard(view, active?.id === view.id)).join('')}</div></section>`;
  }

  private renderCard(view: AtlasView, active: boolean): string {
    const image = view.image
      ? `<img class="view-card-image" src="${escapeHtml(view.image.src)}" alt="${escapeHtml(view.image.alt)}" loading="lazy">`
      : '';
    return `<article class="view-card${active ? ' active' : ''}">
      ${image}
      <div class="view-card-body">
        <div class="view-card-heading"><h4>${escapeHtml(view.title)}</h4>${active ? '<span class="current-view-badge">Current</span>' : ''}</div>
        <p>${escapeHtml(view.summary)}</p>
        <div class="view-tags">${view.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
        <div class="view-card-meta">${view.nodeSequence.length} steps</div>
        <a class="button view-open-button${active ? ' secondary' : ' primary'}" href="${escapeHtml(this.options.viewPageUrl(view.id))}">${active ? 'Restart view' : 'Open view'}</a>
      </div>
    </article>`;
  }

  private renderActiveBanner(view: AtlasView): string {
    const permalink = escapeHtml(this.options.viewPageUrl(view.id));
    return `<div class="view-banner-desktop view-banner-copy">
      <details class="view-context-details"${this.bannerDetailsOpen ? ' open' : ''}>
        <summary>
          <span class="material-icons view-context-icon" aria-hidden="true">explore</span>
          <span class="view-context-heading"><span class="kicker">Guided view</span><strong>${escapeHtml(view.title)}</strong></span>
          <span class="material-icons view-context-chevron" aria-hidden="true">expand_more</span>
        </summary>
        <div class="view-context-body">
          <p class="math-rich">${this.options.math.renderText(view.narrative)}</p>
          ${this.renderSequenceControls(view)}
          <div class="view-banner-actions"><button type="button" class="text-button" data-open-views>Browse views</button><a href="${permalink}">Permalink</a></div>
        </div>
      </details>
    </div>
    ${this.renderCompactViewDetails(view, 'view-banner-mobile')}`;
  }

  private renderMobileDetailsContext(view: AtlasView): string {
    return this.renderCompactViewDetails(view, 'mobile-view-details');
  }

  private renderCompactViewDetails(view: AtlasView, className: string): string {
    return `<div class="view-compact-context ${className}">
      <details class="view-context-details">
        <summary>
          <span class="material-icons view-context-icon" aria-hidden="true">explore</span>
          <span class="view-context-heading"><span class="kicker">Guided view</span><strong>${escapeHtml(view.title)}</strong></span>
          <span class="material-icons view-context-chevron" aria-hidden="true">expand_more</span>
        </summary>
        <div class="view-context-body">
          <p class="math-rich">${this.options.math.renderText(view.narrative)}</p>
          <div class="view-banner-actions"><button type="button" class="text-button" data-open-views>Browse views</button><a href="${escapeHtml(this.options.viewPageUrl(view.id))}">Permalink</a></div>
        </div>
      </details>
      ${this.renderSequenceControls(view, true)}
    </div>`;
  }

  private renderSequenceControls(view: AtlasView, compact = false): string {
    const count = view.nodeSequence.length;
    const safeIndex = sequenceIndexForNode(view.nodeSequence, null, this.sequenceIndex);
    const nodeId = view.nodeSequence[safeIndex] ?? '';
    const nodeLabel = this.options.nodeLabel(nodeId) || nodeId;
    const previousDisabled = safeIndex <= 0 ? ' disabled' : '';
    const nextDisabled = safeIndex >= count - 1 ? ' disabled' : '';
    return `<div class="view-sequence-controls${compact ? ' compact' : ''}" role="group" aria-label="Guided sequence navigation">
      <button type="button" class="view-sequence-button" data-view-prev aria-label="Previous step" title="Previous step"${previousDisabled}><span class="material-icons" aria-hidden="true">chevron_left</span><span class="view-sequence-button-label">Previous</span></button>
      <div class="view-sequence-position" aria-live="polite"><span>Step ${safeIndex + 1} of ${count}</span><strong title="${escapeHtml(nodeLabel)}">${this.options.math.renderText(nodeLabel)}</strong></div>
      <button type="button" class="view-sequence-button" data-view-next aria-label="Next step" title="Next step"${nextDisabled}><span class="view-sequence-button-label">Next</span><span class="material-icons" aria-hidden="true">chevron_right</span></button>
    </div>`;
  }

  private maybeShowWelcome(): void {
    if (this.options.activeView()) return;
    let dismissed = false;
    try { dismissed = window.localStorage.getItem(WELCOME_STORAGE_KEY) === '1'; } catch { /* ignore */ }
    if (!dismissed) byId<HTMLElement>('viewsWelcome').hidden = false;
  }

  private dismissWelcome(): void {
    byId<HTMLElement>('viewsWelcome').hidden = true;
    try { window.localStorage.setItem(WELCOME_STORAGE_KEY, '1'); } catch { /* ignore */ }
  }

}
