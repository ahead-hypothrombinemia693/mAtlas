declare const __GRAPH_DATA_URL__: string;

interface Window {
  cy?: import('cytoscape').Core;
}

declare module 'cytoscape-cose-bilkent' {
  const register: (cytoscape: typeof import('cytoscape')) => void;
  export default register;
}

declare const __VIEWS_DATA_URL__: string;
