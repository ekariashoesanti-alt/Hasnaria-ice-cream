const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '../..');
const TOKEN_KEY = 'hasnaria-staff-session-v1';
const clone = value => JSON.parse(JSON.stringify(value));

// A small DOM fixture keeps these tests dependency-free and counts replacements.
// The source is instrumented inside its IIFE; production exports are unchanged.
class Element {
  constructor(tag, document, attributes = {}) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.attributes = attributes;
    this.childNodes = [];
    this.parentNode = null;
    this.writes = 0;
    this.value = attributes.value || '';
    this.defaultValue = this.value;
    this.checked = Object.hasOwn(attributes, 'checked');
    this.defaultChecked = this.checked;
    this.disabled = Object.hasOwn(attributes, 'disabled');
    this.dataset = new Proxy({}, {
      get: (_, key) => this.attributes['data-' + String(key).replace(/[A-Z]/g, c => '-' + c.toLowerCase())],
      set: (_, key, value) => { this.setAttribute('data-' + String(key).replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value); return true; }
    });
    this.classList = {
      contains: value => (this.className || '').split(/\s+/).includes(value),
      add: value => { if (!this.classList.contains(value)) this.className += ' ' + value; },
      remove: value => { this.className = this.className.split(/\s+/).filter(item => item !== value).join(' '); }
    };
  }
  get className() { return this.attributes.class || ''; }
  set className(value) { this.attributes.class = String(value); }
  get id() { return this.attributes.id || ''; }
  set id(value) { this.attributes.id = String(value); }
  get type() { return this.attributes.type || ''; }
  get readOnly() { return Object.hasOwn(this.attributes, 'readonly'); }
  get isConnected() { return this.ownerDocument.documentElement.contains(this); }
  get children() { return this.childNodes.filter(node => node instanceof Element); }
  get firstChild() { return this.childNodes[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get parentElement() { return this.parentNode; }
  get options() { return this.querySelectorAll('option'); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  appendChild(node) { node.parentNode = this; this.childNodes.push(node); return node; }
  insertBefore(node, reference) {
    if (!reference) return this.appendChild(node);
    const index = this.childNodes.indexOf(reference);
    assert.ok(index >= 0, "insertion target is attached");
    node.parentNode = this; this.childNodes.splice(index, 0, node); return node;
  }
  replaceChild(node, previous) {
    const index = this.childNodes.indexOf(previous);
    assert.ok(index >= 0, 'replacement target is attached');
    node.parentNode = this;
    previous.parentNode = null;
    this.childNodes[index] = node;
    this.writes++;
    return previous;
  }
  replaceWith(node) { this.parentNode.replaceChild(node, this); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector) {
    selector = selector.trim();
    if (!selector) return false;
    if (selector.includes(',')) return selector.split(',').some(value => this.matches(value));
    if (selector === ':focus') return this.ownerDocument.activeElement === this;
    const attrs = [...selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
    for (const [, key, value] of attrs) if (!this.hasAttribute(key) || (value !== undefined && this.getAttribute(key) !== value)) return false;
    selector = selector.replace(/\[[^\]]+\]/g, '');
    const id = selector.match(/#([\w-]+)/);
    if (id && this.id !== id[1]) return false;
    for (const [, value] of selector.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(value)) return false;
    const tag = selector.match(/^[\w-]+/);
    return !tag || this.tagName === tag[0].toUpperCase();
  }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(value => value.trim().split(/\s+/));
    const found = [];
    const visit = parent => parent.children.forEach(node => {
      if (selectors.some(parts => {
        if (!node.matches(parts[parts.length - 1])) return false;
        let ancestor = node.parentNode;
        for (let i = parts.length - 2; i >= 0; i--) {
          while (ancestor && !ancestor.matches(parts[i])) ancestor = ancestor.parentNode;
          if (!ancestor) return false;
          ancestor = ancestor.parentNode;
        }
        return true;
      })) found.push(node);
      visit(node);
    });
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get textContent() { return this.childNodes.map(node => typeof node === 'string' ? node : node.textContent).join(''); }
  set textContent(value) { this.childNodes = [String(value)]; }
  get innerHTML() { return this.childNodes.map(node => typeof node === 'string' ? node : node.outerHTML).join(''); }
  get outerHTML() {
    return '<' + this.tagName.toLowerCase() + Object.entries(this.attributes).map(([key, value]) => ' ' + key + '="' + value + '"').join('') + '>' + this.innerHTML + '</' + this.tagName.toLowerCase() + '>';
  }
  set innerHTML(value) {
    for (const node of this.children) node.parentNode = null;
    this.childNodes = [];
    this.writes++;
    const stack = [this];
    for (const match of String(value).matchAll(/<\/?[^>]+>|[^<]+/g)) {
      const token = match[0];
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (!token.startsWith('<')) { stack[stack.length - 1].childNodes.push(token); continue; }
      const tag = token.match(/^<([\w-]+)/);
      if (!tag) continue;
      const attributes = {};
      for (const attr of token.slice(tag[0].length, -1).matchAll(/([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attributes[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? '';
      const node = new Element(tag[1], this.ownerDocument, attributes);
      stack[stack.length - 1].appendChild(node);
      if (!/^(input|img|br|hr|meta|link)$/i.test(tag[1]) && !/\/>$/.test(token)) stack.push(node);
    }
    for (const select of this.querySelectorAll('select')) {
      const option = select.querySelector('option[selected]') || select.querySelector('option');
      select.value = option ? option.getAttribute('value') ?? option.textContent : '';
      select.defaultValue = select.value;
    }
    for (const textarea of this.querySelectorAll('textarea')) textarea.value = textarea.defaultValue = textarea.textContent;
  }
}

function browserFixture() {
  const listeners = new Map();
  const document = {
    readyState: 'loading', hidden: false, visibilityState: 'visible', activeElement: null,
    addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(listener); },
    createElement(tag) { return new Element(tag, document); },
    getElementById(id) { return document.documentElement.querySelector('#' + id); },
    querySelector(selector) { return document.documentElement.querySelector(selector); },
    querySelectorAll(selector) { return document.documentElement.querySelectorAll(selector); },
    emit(name, target) { for (const listener of listeners.get(name) || []) listener({ target }); },
    dispatchEvent(event) { document.emit(event.type, document); }
  };
  document.documentElement = document.createElement('html');
  document.head = document.documentElement.appendChild(document.createElement('head'));
  document.body = document.documentElement.appendChild(document.createElement('body'));
  const root = document.body.appendChild(document.createElement('div'));
  root.id = 'staffRoot';
  const storage = new Map([[TOKEN_KEY, 'session-a']]);
  const calls = [];
  const handlers = new Map();
  const db = {
    async rpc(name, args) {
      calls.push({ name, args: clone(args) });
      const handler = handlers.get(name);
      if (!handler) throw new Error('Unexpected fixture RPC: ' + name);
      const result = await handler(args);
      return result && (Object.hasOwn(result, 'error') || Object.hasOwn(result, 'data')) ? result : { data: result, error: null };
    },
    auth: { async getSession() { return { data: { session: { user: { id: 'owner-a' } } }, error: null }; } }
  };
  const windowListeners = new Map();
  const window = { supabase: { createClient() { return db; } },
    addEventListener(name, listener) { if (!windowListeners.has(name)) windowListeners.set(name, []); windowListeners.get(name).push(listener); },
    emit(name, event) { for (const listener of windowListeners.get(name) || []) listener(event); }, dispatchEvent() {} };
  const context = {
    window, document, navigator: { onLine: true }, localStorage: {
      getItem(key) { return storage.get(key) || null; }, setItem(key, value) { storage.set(key, String(value)); }, removeItem(key) { storage.delete(key); }
    },
    Date, Intl, console, Promise, Set, JSON, MutationObserver: function() { this.observe = () => {}; },
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    CustomEvent: function(name, detail) { this.type = name; this.detail = detail; }, prompt() { return 'test reason'; }
  };
  function run(file, exports) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /\}\)\(\);\s*$/, file + ' remains an IIFE');
    const exposed = source.replace(/\}\)\(\);\s*$/, '\nwindow.__runtimeTest = {' + exports + '};\n})();');
    vm.runInNewContext(exposed, context, { filename: file });
    return window.__runtimeTest;
  }
  return { document, window, root, storage, calls, handlers, run, context };
}

module.exports = { browserFixture, Element };
