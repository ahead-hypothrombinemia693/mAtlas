import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const template = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
const bootstrapMatch = template.match(/<script>\s*([\s\S]*?window\.__atlasRecovery[\s\S]*?)<\/script>/);
if (!bootstrapMatch) throw new Error('Unable to find the inline cache-recovery bootstrap.');
const bootstrap = bootstrapMatch[1];

function createBrowser(href) {
  const listeners = new Map();
  const prepended = [];
  let replacement = null;
  let historyReplacement = null;

  class Element {
    constructor() {
      this.attributes = new Set();
      this.children = [];
      this.listeners = new Map();
      this.id = '';
    }
    hasAttribute(name) { return this.attributes.has(name); }
    setAttribute(name) { this.attributes.add(name); }
    append(...children) { this.children.push(...children); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
  }
  class HTMLScriptElement extends Element {
    constructor(src) {
      super();
      this.src = src;
      this.attributes.add('data-atlas-critical-asset');
    }
  }
  class HTMLLinkElement extends Element {
    constructor(hrefValue, relations = ['stylesheet']) {
      super();
      this.href = hrefValue;
      this.attributes.add('data-atlas-critical-asset');
      this.relList = { contains: (name) => relations.includes(name) };
    }
  }

  const location = {
    href,
    origin: new URL(href).origin,
    replace(target) {
      replacement = target;
      this.href = target;
    }
  };
  const body = new Element();
  body.prepend = (element) => prepended.unshift(element);
  const document = {
    body,
    baseURI: href,
    querySelector(selector) {
      return selector === 'meta[name="atlas:cache-bust-param"]' ? { content: '__atlas_refresh' } : null;
    },
    getElementById(id) {
      return prepended.find((element) => element.id === id) ?? null;
    },
    createElement(tag) {
      if (tag === 'script') return new HTMLScriptElement('');
      if (tag === 'link') return new HTMLLinkElement('');
      return new Element();
    }
  };
  const window = {
    location,
    history: {
      state: { retained: true },
      replaceState(_state, _title, target) {
        historyReplacement = target;
        location.href = target;
      }
    },
    crypto: {
      getRandomValues(values) {
        values[0] = 123456;
        values[1] = 789012;
        return values;
      }
    },
    addEventListener(name, listener) {
      listeners.set(name, listener);
    }
  };

  vm.runInNewContext(bootstrap, {
    window,
    document,
    Element,
    HTMLScriptElement,
    HTMLLinkElement,
    URL,
    Uint32Array,
    Date,
    Math
  });

  return {
    window,
    listeners,
    prepended,
    HTMLScriptElement,
    replacement: () => replacement,
    historyReplacement: () => historyReplacement
  };
}

test('a failed critical script triggers a one-shot random cache-busting reload', () => {
  const browser = createBrowser('https://atlas.madvay.com/concepts/set/?node=set#details');
  browser.listeners.get('error')({
    target: new browser.HTMLScriptElement('https://atlas.madvay.com/assets/app.OLDHASH.js')
  });
  const replacement = new URL(browser.replacement());
  assert.equal(replacement.pathname, '/concepts/set/');
  assert.equal(replacement.searchParams.get('node'), 'set');
  assert.match(replacement.searchParams.get('__atlas_refresh'), /^[a-z0-9]+-[a-z0-9]+$/);
  assert.equal(replacement.hash, '#details');
});

test('a second critical-asset failure does not enter an automatic reload loop', () => {
  const browser = createBrowser('https://atlas.madvay.com/math/?__atlas_refresh=first-attempt');
  browser.listeners.get('error')({
    target: new browser.HTMLScriptElement('https://atlas.madvay.com/assets/app.STILLMISSING.js')
  });
  assert.equal(browser.replacement(), null);
  assert.equal(browser.prepended.length, 1);
  assert.equal(browser.prepended[0].id, 'atlas-cache-recovery-error');
});

test('successful startup removes only the cache-busting parameter', () => {
  const browser = createBrowser('https://atlas.madvay.com/physics/?node=quantum_field&__atlas_refresh=random#graph');
  browser.window.__atlasRecovery.ready();
  const cleaned = new URL(browser.historyReplacement());
  assert.equal(cleaned.searchParams.has('__atlas_refresh'), false);
  assert.equal(cleaned.searchParams.get('node'), 'quantum_field');
  assert.equal(cleaned.hash, '#graph');
});
