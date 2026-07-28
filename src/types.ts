declare const __GRAPH_DATA_URL__: string;

type NodeKind = 'structure' | 'junction';
type LineStyle = 'solid' | 'dashed' | 'dotted';
type LayoutName = 'atlas' | 'breadthfirst' | 'cose-bilkent';
type CrossFieldVisibility = 'contextual' | 'all' | 'hidden';
type HistoryMode = 'push' | 'replace' | null;
type MathText = string; // Prose with inline LaTeX explicitly delimited by $...$.

interface GraphMeta {
  title: string;
  version: string;
  description: string;
  direction: string;
  scope: string;
  defaultField?: string;
  edgeTypeOrder?: string[];
  fieldOrder?: string[];
  domainOrder?: string[];
  [key: string]: unknown;
}

interface FieldDefinition {
  label: string;
  shortLabel?: string;
  color: string;
  order: number;
  path: string;
  description: MathText;
}

interface DomainDefinition {
  label: string;
  color: string;
  order: number;
  field: string;
}

interface EdgeTypeDefinition {
  label: string;
  short: string;
  description: MathText;
  color: string;
  endpointLabels: {
    source: string;
    target: string;
  };
  lineStyle?: LineStyle;
  activeInDataset?: boolean;
  defaultVisible?: boolean;
}

interface SourceDefinition {
  label: string;
  title: string;
  url: string;
  kind: string;
}

interface CombinationDefinition {
  inputs: string[];
  compatibility: MathText;
  output: string;
}

interface DetailSection {
  title: string;
  body?: MathText;
  items?: MathText[];
}

interface GraphNode {
  id: string;
  label: string;
  primaryField?: string;
  fields?: string[];
  primaryDomain: string;
  domains: string[];
  level: number;
  kind: NodeKind;
  conceptType?: string;
  scale?: string;
  status?: string;
  summary: MathText;
  sections?: DetailSection[];
  root?: boolean;
  carriers?: MathText[];
  data?: MathText[];
  axioms?: MathText[];
  induces?: MathText[];
  notes?: MathText;
  citations: string[];
  combination?: CombinationDefinition;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  detail: MathText;
  citations: string[];
  overview?: boolean;
  synthetic?: boolean;
  junctionId?: string;
}

interface GraphData {
  meta: GraphMeta;
  fields: Record<string, FieldDefinition>;
  domains: Record<string, DomainDefinition>;
  edgeTypes: Record<string, EdgeTypeDefinition>;
  citationLegend?: Record<string, string>;
  sources: Record<string, SourceDefinition>;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface AppState {
  selectedFields: Set<string>;
  selectedDomains: Set<string>;
  selectedEdgeTypes: Set<string>;
  crossFieldVisibility: CrossFieldVisibility;
  showEdgeLabels: boolean;
  showJunctions: boolean;
  edgeZoomActivation: boolean;
  neighborhoodActive: boolean;
  neighborhoodElementId: string | null;
  layout: LayoutName;
  searchQuery: string;
  filtersOpen: boolean;
  detailsOpen: boolean;
}

interface PersistedUiStateV1 {
  version: 1;
  fields?: string[];
  domains: string[];
  edgeTypes: string[];
  display: {
    edgeLabels: boolean;
    junctions: boolean;
    edgeZoomActivation?: boolean;
    crossFieldVisibility?: CrossFieldVisibility;
  };
  layout: LayoutName;
}

interface LabelMetrics {
  targetScreenPx: number;
  minGraphPx: number;
  maxGraphPx: number;
  maxWidth: number;
  maxHeight: number;
}

interface SelectionTarget {
  kind: 'node' | 'edge';
  id: string;
}

declare var GRAPH_DATA: GraphData;
declare const cytoscape: (options: unknown) => any;
declare const katex: {
  renderToString(expression: string, options?: {
    displayMode?: boolean;
    output?: 'html' | 'mathml' | 'htmlAndMathml';
    throwOnError?: boolean;
    strict?: boolean | 'ignore' | 'warn' | 'error';
    trust?: boolean;
  }): string;
};

interface Window {
  cy?: any;
}

declare module 'cytoscape' {
  const cytoscape: any;
  export default cytoscape;
}

declare module 'cytoscape-cose-bilkent' {
  const extension: any;
  export default extension;
}

declare module 'katex' {
  const katex: any;
  export default katex;
}
