import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRendererPreferences } from '../../.test-build/graph/create-graph.js';

function fakeGraph() {
  const renderer = { forcedPixelRatio: 1.5, motionBlurEnabled: false, motionBlur: false, hideEdgesOnViewport: true };
  const declarations = [];
  const movement = [];
  const nodes = {
    unpanify() { movement.push('unpanify'); },
    grabify() { movement.push('grabify'); },
    ungrabify() { movement.push('ungrabify'); },
    panify() { movement.push('panify'); }
  };
  const style = {
    selector(value) { declarations.push(['selector', value]); return this; },
    style(name, value) { declarations.push([name, value]); return this; },
    update() { declarations.push(['update']); return this; }
  };
  return {
    renderer,
    declarations,
    movement,
    resized: 0,
    rendered: 0,
    graph: {
      renderer: () => renderer,
      autoungrabify(value) { movement.push(['autoungrabify', value]); },
      nodes: () => nodes,
      style: () => style,
      resize() { this.owner.resized += 1; },
      forceRender() { this.owner.rendered += 1; },
      owner: null
    }
  };
}

test('renderer preferences change the live renderer and immediately redraw both resolutions', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 3 };
  try {
    const fixture = fakeGraph();
    fixture.graph.owner = fixture;
    applyRendererPreferences(fixture.graph, {
      version: 1, highResolution: true, transitions: true, motionBlur: true, formulaeInGraph: false,
      indicateOtherDomains: true, showGraphEdgeLabels: true, hideEdgesWhileMoving: false, allowNodeMovement: false, dimPrerequisites: true, highlightPrerequisites: false
    });
    assert.equal(fixture.renderer.forcedPixelRatio, null);
    assert.equal(fixture.renderer.motionBlurEnabled, true);
    assert.equal(fixture.renderer.motionBlur, true);
    assert.equal(fixture.renderer.hideEdgesOnViewport, false);
    assert.deepEqual(fixture.movement, [['autoungrabify', true], 'ungrabify', 'panify']);
    assert.ok(fixture.declarations.some(([name, value]) => name === 'transition-duration' && value === 120));

    applyRendererPreferences(fixture.graph, {
      version: 1, highResolution: false, transitions: false, motionBlur: false, formulaeInGraph: true,
      indicateOtherDomains: true, showGraphEdgeLabels: false, hideEdgesWhileMoving: true, allowNodeMovement: true, dimPrerequisites: false, highlightPrerequisites: true
    });
    assert.equal(fixture.renderer.forcedPixelRatio, 1.5);
    assert.equal(fixture.renderer.motionBlurEnabled, false);
    assert.equal(fixture.renderer.motionBlur, false);
    assert.equal(fixture.renderer.hideEdgesOnViewport, true);
    assert.deepEqual(fixture.movement.slice(3), [['autoungrabify', false], 'unpanify', 'grabify']);
    assert.equal(fixture.resized, 2);
    assert.equal(fixture.rendered, 2);
  } finally {
    globalThis.window = previousWindow;
  }
});
