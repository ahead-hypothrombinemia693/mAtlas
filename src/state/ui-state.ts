import type {
  AppState,
  CrossFieldVisibility,
  LayoutName,
  UrlUiState
} from '../types.js';

export const VALID_LAYOUTS: ReadonlySet<LayoutName> = new Set(['atlas', 'breadthfirst', 'cose-bilkent']);
export const VALID_CROSS_FIELD_VISIBILITIES: ReadonlySet<CrossFieldVisibility> = new Set(['contextual', 'all', 'hidden']);

export function isLayoutName(value: unknown): value is LayoutName {
  return typeof value === 'string' && VALID_LAYOUTS.has(value as LayoutName);
}

export function isCrossFieldVisibility(value: unknown): value is CrossFieldVisibility {
  return typeof value === 'string'
    && VALID_CROSS_FIELD_VISIBILITIES.has(value as CrossFieldVisibility);
}

export interface UiStateKnowledge {
  fieldIds: ReadonlySet<string>;
  domainIds: ReadonlySet<string>;
  edgeTypeIds: ReadonlySet<string>;
}

export interface InitialStateDefaults {
  fields: string[];
  domains: string[];
  edgeTypes: string[];
  excludedFields?: string[] | undefined;
  excludedDomains?: string[] | undefined;
  crossFieldVisibility?: CrossFieldVisibility | undefined;
  edgeLabels?: boolean | undefined;
  junctions?: boolean | undefined;
  edgeZoomActivation?: boolean | undefined;
  hidePrerequisites?: boolean | undefined;
  layout?: LayoutName | undefined;
}

export function isKnownIdArray(value: unknown, knownIds: ReadonlySet<string>): value is string[] {
  return Array.isArray(value)
    && value.every((id) => typeof id === 'string' && knownIds.has(id))
    && new Set(value).size === value.length;
}

export function readUrlIdList(params: URLSearchParams, name: string, knownIds: ReadonlySet<string>): string[] | undefined {
  if (!params.has(name)) return undefined;
  const raw = params.get(name) ?? '';
  const ids = raw ? raw.split(',').filter(Boolean) : [];
  return isKnownIdArray(ids, knownIds) ? ids : undefined;
}

export function readUrlBoolean(params: URLSearchParams, name: string): boolean | undefined {
  if (!params.has(name)) return undefined;
  const value = params.get(name);
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return undefined;
}

export function parseUrlUiState(params: URLSearchParams, known: UiStateKnowledge): UrlUiState {
  const result: UrlUiState = {};
  const fields = readUrlIdList(params, 'fields', known.fieldIds);
  const domains = readUrlIdList(params, 'domains', known.domainIds);
  const edgeTypes = readUrlIdList(params, 'edges', known.edgeTypeIds);
  const excludedFields = readUrlIdList(params, 'excludeFields', known.fieldIds);
  const excludedDomains = readUrlIdList(params, 'excludeDomains', known.domainIds);
  const crossFieldValue = params.get('crossField');
  const edgeLabels = readUrlBoolean(params, 'edgeLabels');
  const junctions = readUrlBoolean(params, 'junctions');
  const edgeZoomActivation = readUrlBoolean(params, 'edgeZoomActivation');
  const hidePrerequisites = readUrlBoolean(params, 'hidePrereqs');
  const layoutValue = params.get('layout');
  const normalizedLayout = layoutValue === 'cose' ? 'cose-bilkent' : layoutValue;

  if (fields !== undefined) result.fields = fields;
  if (domains !== undefined) result.domains = domains;
  if (edgeTypes !== undefined) result.edgeTypes = edgeTypes;
  if (excludedFields !== undefined) result.excludedFields = excludedFields;
  if (excludedDomains !== undefined) result.excludedDomains = excludedDomains;
  if (isCrossFieldVisibility(crossFieldValue)) result.crossFieldVisibility = crossFieldValue;
  if (edgeLabels !== undefined) result.edgeLabels = edgeLabels;
  if (junctions !== undefined) result.junctions = junctions;
  if (edgeZoomActivation !== undefined) result.edgeZoomActivation = edgeZoomActivation;
  if (hidePrerequisites !== undefined) result.hidePrerequisites = hidePrerequisites;
  if (isLayoutName(normalizedLayout)) result.layout = normalizedLayout;
  return result;
}

export function createInitialState(
  url: UrlUiState,
  defaults: InitialStateDefaults
): AppState {
  return {
    selectedFields: new Set(url.fields ?? defaults.fields),
    selectedDomains: new Set(url.domains ?? defaults.domains),
    selectedEdgeTypes: new Set(url.edgeTypes ?? defaults.edgeTypes),
    excludedFields: new Set(url.excludedFields ?? defaults.excludedFields ?? []),
    excludedDomains: new Set(url.excludedDomains ?? defaults.excludedDomains ?? []),
    crossFieldVisibility: url.crossFieldVisibility ?? defaults.crossFieldVisibility ?? 'all',
    showEdgeLabels: url.edgeLabels ?? defaults.edgeLabels ?? true,
    showJunctions: url.junctions ?? defaults.junctions ?? true,
    edgeZoomActivation: url.edgeZoomActivation ?? defaults.edgeZoomActivation ?? true,
    hidePrerequisites: url.hidePrerequisites ?? defaults.hidePrerequisites ?? false,
    neighborhoodActive: false,
    neighborhoodElementId: null,
    layout: url.layout ?? defaults.layout ?? 'atlas',
    searchQuery: '',
    filtersOpen: false,
    detailsOpen: false
  };
}

export function addUiStateToParams(
  params: URLSearchParams,
  state: AppState,
  fieldOrder: readonly string[],
  domainOrder: readonly string[],
  edgeTypeOrder: readonly string[]
): void {
  const writeIds = (name: string, ids: readonly string[], selected: ReadonlySet<string>): void => {
    params.set(name, ids.filter((id) => selected.has(id)).join(','));
  };
  writeIds('fields', fieldOrder, state.selectedFields);
  writeIds('domains', domainOrder, state.selectedDomains);
  writeIds('edges', edgeTypeOrder, state.selectedEdgeTypes);
  writeIds('excludeFields', fieldOrder, state.excludedFields ?? new Set());
  writeIds('excludeDomains', domainOrder, state.excludedDomains ?? new Set());
  params.set('crossField', state.crossFieldVisibility);
  params.set('edgeLabels', state.showEdgeLabels ? '1' : '0');
  params.set('junctions', state.showJunctions ? '1' : '0');
  params.set('edgeZoomActivation', state.edgeZoomActivation ? '1' : '0');
  params.set('hidePrereqs', state.hidePrerequisites ? '1' : '0');
  params.set('layout', state.layout);
}

export function sameIdSet(current: ReadonlySet<string>, next: readonly string[]): boolean {
  return current.size === next.length && next.every((id) => current.has(id));
}
