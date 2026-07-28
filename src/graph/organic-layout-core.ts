import { stableStringHash } from '../core/hash.js';
import type { Point } from '../types.js';

export function organicSeedPosition(nodeId: string, index: number): Point {
  if (index <= 0) return { x: 0, y: 0 };
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const spacing = 76;
  const hash = stableStringHash(nodeId);
  const angleJitter = (((hash & 0xffff) / 0xffff) - 0.5) * 0.16;
  const radiusJitter = 0.92 + (((hash >>> 16) & 0xffff) / 0xffff) * 0.16;
  const radius = spacing * Math.sqrt(index) * radiusJitter;
  const angle = index * goldenAngle + angleJitter;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function organicIterationBudget(nodeCount: number): number {
  if (nodeCount > 500) return 450;
  if (nodeCount > 250) return 600;
  if (nodeCount > 100) return 800;
  return 1000;
}
