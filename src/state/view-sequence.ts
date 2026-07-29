export function sequenceIndexForNode(
  nodeSequence: readonly string[],
  nodeId: string | null | undefined,
  currentIndex = 0
): number {
  if (nodeSequence.length === 0) return -1;
  const matchedIndex = nodeId ? nodeSequence.indexOf(nodeId) : -1;
  if (matchedIndex >= 0) return matchedIndex;
  return Math.min(Math.max(currentIndex, 0), nodeSequence.length - 1);
}

export function moveSequenceIndex(
  nodeSequence: readonly string[],
  currentIndex: number,
  direction: -1 | 1
): number | null {
  if (nodeSequence.length === 0) return null;
  const normalizedIndex = Math.min(Math.max(currentIndex, 0), nodeSequence.length - 1);
  const nextIndex = normalizedIndex + direction;
  return nextIndex >= 0 && nextIndex < nodeSequence.length ? nextIndex : null;
}
