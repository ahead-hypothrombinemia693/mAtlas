import type {
  AppState,
  CrossFieldVisibility,
  LayoutName,
  PersistedUiStateV1,
  UrlUiState
} from '../types.js';

export const UI_STATE_STORAGE_KEY = 'human-knowledge-atlas:ui-state:v1';
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
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isKnownIdArray(value: unknown, knownIds: ReadonlySet<string>): value is string[] {
  return Array.isArray(value)
    && value.every((id) => typeof id === 'string' && knownIds.has(id))
    && new Set(value).size === value.length;
}

export function parseStoredUiState(raw: string | null, known: UiStateKnowledge): PersistedUiStateV1 | null {
  if (!raw) return null;
  try {
    const candidate: unknown = JSON.parse(raw);
    if (!isPlainObject(candidate) || !isPlainObject(candidate.display)) return null;
    const display = candidate.display;
    if (candidate.version !== 1
      || (candidate.fields !== undefined && !isKnownIdArray(candidate.fields, known.fieldIds))
      || !isKnownIdArray(candidate.domains, known.domainIds)
      || !isKnownIdArray(candidate.edgeTypes, known.edgeTypeIds)
      || typeof display.edgeLabels !== 'boolean'
      || typeof display.junctions !== 'boolean'
      || (display.edgeZoomActivation !== undefined && typeof display.edgeZoomActivation !== 'boolean')
      || (display.crossFieldVisibility !== undefined && !isCrossFieldVisibility(display.crossFieldVisibility))
      || !isLayoutName(candidate.layout)) {
      return null;
    }
    const parsed: PersistedUiStateV1 = {
      version: 1,
      domains: candidate.domains,
      edgeTypes: candidate.edgeTypes,
      display: {
        edgeLabels: display.edgeLabels,
        junctions: display.junctions
      },
      layout: candidate.layout
    };
    if (candidate.fields !== undefined) parsed.fields = candidate.fields;
    if (display.edgeZoomActivation !== undefined) parsed.display.edgeZoomActivation = display.edgeZoomActivation;
    if (display.crossFieldVisibility !== undefined) parsed.display.crossFieldVisibility = display.crossFieldVisibility;
    return parsed;
  } catch {
    return null;
  }
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
  const crossFieldValue = params.get('crossField');
  const edgeLabels = readUrlBoolean(params, 'edgeLabels');
  const junctions = readUrlBoolean(params, 'junctions');
  const edgeZoomActivation = readUrlBoolean(params, 'edgeZoomActivation');
  const layoutValue = params.get('layout');
  const normalizedLayout = layoutValue === 'cose' ? 'cose-bilkent' : layoutValue;

  if (fields !== undefined) result.fields = fields;
  if (domains !== undefined) result.domains = domains;
  if (edgeTypes !== undefined) result.edgeTypes = edgeTypes;
  if (isCrossFieldVisibility(crossFieldValue)) result.crossFieldVisibility = crossFieldValue;
  if (edgeLabels !== undefined) result.edgeLabels = edgeLabels;
  if (junctions !== undefined) result.junctions = junctions;
  if (edgeZoomActivation !== undefined) result.edgeZoomActivation = edgeZoomActivation;
  if (isLayoutName(normalizedLayout)) result.layout = normalizedLayout;
  return result;
}

export function createInitialState(
  url: UrlUiState,
  stored: PersistedUiStateV1 | null,
  defaults: InitialStateDefaults
): AppState {
  return {
    selectedFields: new Set(url.fields ?? stored?.fields ?? defaults.fields),
    selectedDomains: new Set(url.domains ?? stored?.domains ?? defaults.domains),
    selectedEdgeTypes: new Set(url.edgeTypes ?? stored?.edgeTypes ?? defaults.edgeTypes),
    crossFieldVisibility: url.crossFieldVisibility ?? stored?.display.crossFieldVisibility ?? 'all',
    showEdgeLabels: url.edgeLabels ?? stored?.display.edgeLabels ?? true,
    showJunctions: url.junctions ?? stored?.display.junctions ?? true,
    edgeZoomActivation: url.edgeZoomActivation ?? stored?.display.edgeZoomActivation ?? true,
    neighborhoodActive: false,
    neighborhoodElementId: null,
    layout: url.layout ?? stored?.layout ?? 'atlas',
    searchQuery: '',
    filtersOpen: false,
    detailsOpen: false
  };
}

export function serializeUiState(
  state: AppState,
  fieldOrder: readonly string[],
  domainOrder: readonly string[],
  edgeTypeOrder: readonly string[]
): PersistedUiStateV1 {
  return {
    version: 1,
    fields: fieldOrder.filter((id) => state.selectedFields.has(id)),
    domains: domainOrder.filter((id) => state.selectedDomains.has(id)),
    edgeTypes: edgeTypeOrder.filter((id) => state.selectedEdgeTypes.has(id)),
    display: {
      edgeLabels: state.showEdgeLabels,
      junctions: state.showJunctions,
      edgeZoomActivation: state.edgeZoomActivation,
      crossFieldVisibility: state.crossFieldVisibility
    },
    layout: state.layout
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
  params.set('crossField', state.crossFieldVisibility);
  params.set('edgeLabels', state.showEdgeLabels ? '1' : '0');
  params.set('junctions', state.showJunctions ? '1' : '0');
  params.set('edgeZoomActivation', state.edgeZoomActivation ? '1' : '0');
  params.set('layout', state.layout);
}

export function sameIdSet(current: ReadonlySet<string>, next: readonly string[]): boolean {
  return current.size === next.length && next.every((id) => current.has(id));
}
