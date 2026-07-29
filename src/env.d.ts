declare const __GRAPH_DATA_URL__: string;

interface AtlasRecoveryController {
  readonly parameterName: string;
  reload(): boolean;
  retry(): void;
  ready(): void;
  isReloading(): boolean;
}

interface Window {
  cy?: import('cytoscape').Core;
  __atlasRecovery?: AtlasRecoveryController;
}

declare module 'cytoscape-cose-bilkent' {
  const register: (cytoscape: typeof import('cytoscape')) => void;
  export default register;
}

declare const __VIEWS_DATA_URL__: string;
