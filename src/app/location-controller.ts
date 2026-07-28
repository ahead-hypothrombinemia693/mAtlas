import { addUiStateToParams } from '../state/ui-state.js';
import { stripInlineMathText, summarizePlainText } from '../core/text.js';
import type { GraphModel } from '../model/graph-model.js';
import type { AppState, HistoryMode, SelectionTarget } from '../types.js';

export interface LocationControllerOptions {
  model: GraphModel;
  getState: () => AppState;
  fieldOrder: readonly string[];
  domainOrder: readonly string[];
  edgeTypeOrder: readonly string[];
}

export function selectionFromPath(pathname: string, nodeIds: ReadonlySet<string>): SelectionTarget | null {
  const match = pathname.match(/\/concepts\/([^/]+)(?:\/index\.html)?\/?$/);
  const encodedNodeId = match?.[1];
  if (!encodedNodeId) return null;
  const nodeId = decodeURIComponent(encodedNodeId);
  return nodeIds.has(nodeId) ? { kind: 'node', id: nodeId } : null;
}

export function selectionFromParams(
  params: URLSearchParams,
  nodeIds: ReadonlySet<string>,
  edgeIds: ReadonlySet<string>
): SelectionTarget | null {
  const nodeId = params.get('node');
  if (nodeId && nodeIds.has(nodeId)) return { kind: 'node', id: nodeId };
  const edgeId = params.get('edge');
  if (edgeId && edgeIds.has(edgeId)) return { kind: 'edge', id: edgeId };
  return null;
}

export function selectionFromTemplate(
  content: string | null | undefined,
  nodeIds: ReadonlySet<string>,
  edgeIds: ReadonlySet<string>
): SelectionTarget | null {
  const normalized = content?.trim();
  if (!normalized) return null;
  const separator = normalized.indexOf(':');
  if (separator <= 0) return null;
  const kind = normalized.slice(0, separator);
  const id = normalized.slice(separator + 1);
  if (kind === 'node' && nodeIds.has(id)) return { kind: 'node', id };
  if (kind === 'edge' && edgeIds.has(id)) return { kind: 'edge', id };
  return null;
}

export class LocationController {
  readonly scopedFieldId: string | null;
  readonly runtimeGlobalRootUrl: string;
  readonly currentScopeUrl: string;
  readonly canonicalRootUrl: string;
  private readonly defaultPageTitle: string;
  private readonly defaultPageDescription: string;

  constructor(private readonly options: LocationControllerOptions) {
    const { model } = options;
    this.runtimeGlobalRootUrl = new URL('./', document.baseURI).toString();
    this.scopedFieldId = this.resolveScopedField();
    this.currentScopeUrl = this.scopedFieldId
      ? new URL(`${model.data.fields[this.scopedFieldId]?.path ?? this.scopedFieldId}/`, this.runtimeGlobalRootUrl).toString()
      : this.runtimeGlobalRootUrl;
    this.canonicalRootUrl = document.querySelector<HTMLMetaElement>('meta[name="atlas:root"]')?.content?.trim()
      || 'https://atlas.madvay.com/';
    this.defaultPageTitle = this.scopedFieldId
      ? `${model.data.fields[this.scopedFieldId]?.label ?? this.scopedFieldId} — ${model.data.meta.title}`
      : model.data.meta.title;
    this.defaultPageDescription = this.scopedFieldId
      ? model.data.fields[this.scopedFieldId]?.description ?? model.data.meta.description
      : model.data.meta.description;
  }

  scopedDefaultFieldIds(): string[] {
    return this.scopedFieldId ? [this.scopedFieldId] : [...this.options.fieldOrder];
  }

  scopedDefaultDomainIds(): string[] {
    const fields = new Set(this.scopedDefaultFieldIds());
    return this.options.domainOrder.filter((domainId) => fields.has(this.options.model.fieldForDomain(domainId)));
  }

  conceptPageDefaultTaxonomy(): { fields: string[]; domains: string[] } | null {
    const selection = this.parseSelectionPath();
    if (!selection || selection.kind !== 'node') return null;
    const node = this.options.model.nodeRecord.get(selection.id);
    if (!node || node.kind !== 'structure') return null;
    const domainId = node.primaryDomain;
    return { fields: [this.options.model.fieldForDomain(domainId)], domains: [domainId] };
  }

  parseSelectionPath(): SelectionTarget | null {
    return selectionFromPath(window.location.pathname, this.options.model.knownNodeIds);
  }

  parseSelectionQuery(): SelectionTarget | null {
    return selectionFromParams(
      new URL(window.location.href).searchParams,
      this.options.model.knownNodeIds,
      this.options.model.knownEdgeIds
    );
  }

  parseTemplateSelection(): SelectionTarget | null {
    const content = document.querySelector<HTMLMetaElement>('meta[name="atlas:selection"]')?.content;
    return selectionFromTemplate(content, this.options.model.knownNodeIds, this.options.model.knownEdgeIds);
  }

  parseSelection({ includeTemplateSelection = false }: { includeTemplateSelection?: boolean } = {}): SelectionTarget | null {
    const pathTarget = this.parseSelectionPath();
    if (pathTarget) return pathTarget;
    const queryTarget = this.parseSelectionQuery();
    if (queryTarget) return queryTarget;
    if (includeTemplateSelection) {
      const templateTarget = this.parseTemplateSelection();
      if (templateTarget) return templateTarget;
    }
    return selectionFromParams(
      new URLSearchParams(window.location.hash.slice(1)),
      this.options.model.knownNodeIds,
      this.options.model.knownEdgeIds
    );
  }

  addUiState(url: URL): void {
    addUiStateToParams(
      url.searchParams,
      this.options.getState(),
      this.options.fieldOrder,
      this.options.domainOrder,
      this.options.edgeTypeOrder
    );
  }

  githubEditUrl(itemId: string): string {
    const textFragment = encodeURIComponent(`"id": "${itemId}"`);
    return `https://github.com/madvay/mAtlas/blob/main/src/data/structures.json#:~:text=${textFragment}`;
  }

  conceptPageUrl(nodeId: string): string {
    return new URL(`concepts/${encodeURIComponent(nodeId)}/`, this.runtimeGlobalRootUrl).toString();
  }

  itemUrl(itemId: string, itemKind: SelectionTarget['kind']): string {
    const { model } = this.options;
    if (itemKind === 'node' && model.nodeRecord.get(itemId)?.kind === 'structure') {
      const url = new URL(this.conceptPageUrl(itemId));
      this.addUiState(url);
      return url.toString();
    }

    const url = new URL(this.currentScopeUrl);
    this.addUiState(url);
    url.searchParams.set(itemKind, itemId);
    url.searchParams.delete(itemKind === 'node' ? 'edge' : 'node');
    url.hash = '';
    return url.toString();
  }

  write(target: SelectionTarget | null, mode: Exclude<HistoryMode, null> = 'replace'): void {
    const { model } = this.options;
    const url = target?.kind === 'node' && model.nodeRecord.get(target.id)?.kind === 'structure'
      ? new URL(this.conceptPageUrl(target.id))
      : new URL(this.currentScopeUrl);
    this.addUiState(url);
    url.searchParams.delete('node');
    url.searchParams.delete('edge');
    if (target?.kind === 'node' && model.nodeRecord.get(target.id)?.kind !== 'structure') url.searchParams.set('node', target.id);
    if (target?.kind === 'edge') url.searchParams.set('edge', target.id);
    url.hash = '';
    if (url.href === window.location.href) return;

    try {
      const historyState = { selection: target, uiStateVersion: 1 };
      if (mode === 'replace') window.history.replaceState(historyState, '', url.href);
      else window.history.pushState(historyState, '', url.href);
    } catch {
      if (mode === 'replace') window.location.replace(url.href);
      else window.location.assign(url.href);
    }
  }

  syncDocumentMetadata(target: SelectionTarget | null): void {
    const { model } = this.options;
    let title = this.defaultPageTitle;
    let description = this.defaultPageDescription;

    if (target?.kind === 'node') {
      const node = model.nodeRecord.get(target.id);
      if (node) {
        title = `${stripInlineMathText(node.label)} - ${model.data.meta.title}`;
        description = summarizePlainText(node.summary || model.data.meta.description);
        const canonicalUrl = this.selectionCanonicalUrl(target);
        this.setDynamicEntityJsonLd({
          '@context': 'https://schema.org',
          '@type': 'DefinedTerm',
          '@id': canonicalUrl,
          name: stripInlineMathText(node.label),
          description,
          url: canonicalUrl,
          identifier: node.id,
          termCode: node.id,
          inDefinedTermSet: `${this.canonicalRootUrl}concepts/`
        });
      }
    } else if (target?.kind === 'edge') {
      const edge = model.edgeRecord.get(target.id);
      if (edge) {
        title = `${stripInlineMathText(edge.label)} - ${model.data.meta.title}`;
        description = summarizePlainText(edge.detail || model.data.meta.description);
      }
      this.setDynamicEntityJsonLd(null);
    } else {
      this.setDynamicEntityJsonLd(null);
    }

    const canonicalUrl = this.selectionCanonicalUrl(target);
    document.title = title;
    this.setCanonicalHref(canonicalUrl);
    this.setHeadMeta('meta[name="description"]', 'name', 'description', description);
    this.setHeadMeta('meta[property="og:title"]', 'property', 'og:title', title);
    this.setHeadMeta('meta[property="og:description"]', 'property', 'og:description', description);
    this.setHeadMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    this.setHeadMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    this.setHeadMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
  }

  private resolveScopedField(): string | null {
    const { model, fieldOrder } = this.options;
    const explicit = document.querySelector<HTMLMetaElement>('meta[name="atlas:scope"]')?.content?.trim();
    if (explicit && model.knownFieldIds.has(explicit)) return explicit;
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    for (const fieldId of fieldOrder) {
      const fieldPath = model.data.fields[fieldId]?.path;
      if (path === fieldPath || (fieldPath && path.startsWith(`${fieldPath}/`))) return fieldId;
    }
    return null;
  }

  private selectionCanonicalUrl(target: SelectionTarget | null): string {
    const { model } = this.options;
    if (!target) {
      return this.scopedFieldId
        ? new URL(`${model.data.fields[this.scopedFieldId]?.path ?? this.scopedFieldId}/`, this.canonicalRootUrl).toString()
        : this.canonicalRootUrl;
    }
    if (target.kind === 'node') {
      if (model.nodeRecord.get(target.id)?.kind === 'structure') {
        return new URL(`concepts/${encodeURIComponent(target.id)}/`, this.canonicalRootUrl).toString();
      }
      return `${this.canonicalRootUrl}?node=${encodeURIComponent(target.id)}`;
    }
    return `${this.canonicalRootUrl}?edge=${encodeURIComponent(target.id)}`;
  }

  private setHeadMeta(
    selector: string,
    attributeName: 'name' | 'property',
    attributeValue: string,
    content: string
  ): void {
    let meta = document.head.querySelector<HTMLMetaElement>(selector);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(attributeName, attributeValue);
      document.head.appendChild(meta);
    }
    meta.content = content;
  }

  private setCanonicalHref(href: string): void {
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = href;
  }

  private setDynamicEntityJsonLd(payload: object | null): void {
    const scriptId = 'dynamic-entity-jsonld';
    const existing = document.head.querySelector<HTMLScriptElement>(`script#${scriptId}`);
    if (!payload) {
      existing?.remove();
      return;
    }
    const script = existing ?? document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    script.text = JSON.stringify(payload);
    if (!existing) document.head.appendChild(script);
  }
}
