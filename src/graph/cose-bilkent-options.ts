import type cytoscape from 'cytoscape';
import { organicIterationBudget } from './organic-layout-core.js';

export type CoseBilkentQuality = 'draft' | 'default' | 'proof';
export type CoseBilkentAnimation = 'during' | 'end' | false;

/**
 * Options supported by cytoscape-cose-bilkent 4.x.
 *
 * The extension does not publish TypeScript declarations, so its public option
 * surface is kept here instead of allowing untyped layout dictionaries to
 * spread through the application.
 */
export interface CoseBilkentLayoutOptions extends cytoscape.LayoutOptions {
  name: 'cose-bilkent';
  quality?: CoseBilkentQuality;
  ready?: () => void;
  stop?: () => void;
  nodeDimensionsIncludeLabels?: boolean;
  refresh?: number;
  fit?: boolean;
  padding?: number;
  randomize?: boolean;
  nodeRepulsion?: number;
  idealEdgeLength?: number;
  edgeElasticity?: number;
  nestingFactor?: number;
  gravity?: number;
  numIter?: number;
  tile?: boolean;
  animate?: CoseBilkentAnimation;
  animationDuration?: number;
  tilingPaddingVertical?: number | (() => number);
  tilingPaddingHorizontal?: number | (() => number);
  gravityRangeCompound?: number;
  gravityCompound?: number;
  gravityRange?: number;
  initialEnergyOnIncremental?: number;
}

export function createOrganicLayoutOptions(nodeCount: number): CoseBilkentLayoutOptions {
  return {
    name: 'cose-bilkent',
    quality: 'draft',
    animate: false,
    randomize: false,
    fit: false,
    padding: 60,
    nodeDimensionsIncludeLabels: false,
    refresh: 100,
    nodeRepulsion: 6500,
    idealEdgeLength: 130,
    edgeElasticity: 0.4,
    nestingFactor: 0.1,
    gravity: 0.2,
    numIter: organicIterationBudget(nodeCount),
    tile: true,
    tilingPaddingVertical: 24,
    tilingPaddingHorizontal: 24,
    initialEnergyOnIncremental: 0.45
  };
}
