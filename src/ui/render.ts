const renderedHtml = new WeakMap<Element, string>();

/**
 * Minimal retained renderer for the Atlas UI.
 *
 * The graph canvas remains owned by Cytoscape. HTML surfaces are updated only
 * when their rendered value changes, avoiding repeated parsing, DOM churn, and
 * framework scheduling overhead on desktop and mobile.
 */
export function renderHtml(target: Element, html: string): void {
  if (renderedHtml.get(target) === html) return;
  const ownerDocument = (target as any).ownerDocument ?? globalThis.document;
  const range = ownerDocument.createRange?.();
  if (range?.createContextualFragment) {
    range.selectNodeContents(target);
    target.replaceChildren(range.createContextualFragment(html));
  } else if ('innerHTML' in target) {
    (target as HTMLElement).innerHTML = html;
  } else {
    const fragment = ownerDocument.createDocumentFragment();
    const wrapper = ownerDocument.createElement('div');
    wrapper.innerHTML = html;
    fragment.append(...Array.from(wrapper.childNodes));
    const nodeTarget = target as Node;
    while (nodeTarget.firstChild) nodeTarget.removeChild(nodeTarget.firstChild);
    nodeTarget.appendChild(fragment);
  }
  renderedHtml.set(target, html);
}

export function renderText(target: Element, text: string): void {
  if (target.childNodes.length === 1 && target.firstChild?.nodeType === 3
      && target.textContent === text) return;
  target.textContent = text;
  renderedHtml.delete(target);
}

export function invalidateRender(target: Element): void {
  renderedHtml.delete(target);
}
