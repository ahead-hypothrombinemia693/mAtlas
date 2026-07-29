import { byId, escapeHtml } from '../core/dom.js';
import { resolveViewSurface } from './view-surface.js';
import type { AtlasView } from '../types.js';

const WELCOME_STORAGE_KEY = 'human-knowledge-atlas:views-welcome-dismissed:v1';
const BANNER_SESSION_PREFIX = 'human-knowledge-atlas:view-banner-hidden:';

export interface ViewsControllerOptions {
  views: readonly AtlasView[];
  activeView: () => AtlasView | null;
  viewPageUrl: (viewId: string) => string;
  isMobileLayout: () => boolean;
  detailsOpen: () => boolean;
}

export class ViewsController {
  constructor(private readonly options: ViewsControllerOptions) {}

  initialize(): void {
    this.buildDialog();
    this.syncActiveView();
    this.bindEvents();
    this.maybeShowWelcome();
  }

  syncActiveView(): void {
    const view = this.options.activeView();
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
      this.syncPresentation();
      return;
    }

    banner.innerHTML = this.renderActiveBanner(view);
    detailsContext.innerHTML = this.renderMobileDetailsContext(view);
    this.syncPresentation();
  }

  syncPresentation(): void {
    const view = this.options.activeView();
    const visibility = resolveViewSurface({
      active: Boolean(view),
      mobile: this.options.isMobileLayout(),
      detailsOpen: this.options.detailsOpen(),
      graphIntroductionDismissed: view ? this.bannerHidden(view.id) : false
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
    if (target.closest('[data-view-banner-close]')) {
      const view = this.options.activeView();
      if (view) {
        try { window.sessionStorage.setItem(`${BANNER_SESSION_PREFIX}${view.id}`, '1'); } catch { /* ignore */ }
        this.syncPresentation();
      }
    } else if (target.closest('[data-open-views]')) {
      this.open();
    }
  }

  private buildDialog(): void {
    const active = this.options.activeView();
    const featured = this.options.views.filter((view) => view.featured);
    const other = this.options.views.filter((view) => !view.featured);
    byId('viewsContent').innerHTML = `
      <p class="views-intro">Each view is a curated starting point: a named set of filters, relation types, display choices, and an initial concept. You can still explore normally after opening one.</p>
      ${this.renderViewSection('Featured paths', featured, active)}
      ${other.length ? this.renderViewSection('More views', other, active) : ''}`;
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
        <a class="button view-open-button${active ? ' secondary' : ' primary'}" href="${escapeHtml(this.options.viewPageUrl(view.id))}">${active ? 'Restart view' : 'Open view'}</a>
      </div>
    </article>`;
  }

  private renderActiveBanner(view: AtlasView): string {
    const permalink = escapeHtml(this.options.viewPageUrl(view.id));
    return `<div class="view-banner-desktop view-banner-copy">
      <div class="kicker">Guided view</div>
      <h2>${escapeHtml(view.title)}</h2>
      <p>${escapeHtml(view.narrative)}</p>
      <div class="view-banner-actions"><button type="button" class="text-button" data-open-views>Browse views</button><a href="${permalink}">Permalink</a></div>
    </div>
    ${this.renderCompactViewDetails(view, 'view-banner-mobile')}
    <button type="button" class="icon-button view-banner-close" data-view-banner-close aria-label="Hide view introduction" title="Hide introduction">×</button>`;
  }

  private renderMobileDetailsContext(view: AtlasView): string {
    return this.renderCompactViewDetails(view, 'mobile-view-details');
  }

  private renderCompactViewDetails(view: AtlasView, className: string): string {
    return `<details class="view-context-details ${className}">
      <summary>
        <span class="material-icons view-context-icon" aria-hidden="true">explore</span>
        <span class="view-context-heading"><span class="kicker">Guided view</span><strong>${escapeHtml(view.title)}</strong></span>
        <span class="material-icons view-context-chevron" aria-hidden="true">expand_more</span>
      </summary>
      <div class="view-context-body">
        <p>${escapeHtml(view.narrative)}</p>
        <div class="view-banner-actions"><button type="button" class="text-button" data-open-views>Browse views</button><a href="${escapeHtml(this.options.viewPageUrl(view.id))}">Permalink</a></div>
      </div>
    </details>`;
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

  private bannerHidden(viewId: string): boolean {
    try { return window.sessionStorage.getItem(`${BANNER_SESSION_PREFIX}${viewId}`) === '1'; } catch { return false; }
  }
}
