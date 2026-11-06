/**
 * Behavior tests for the fold logic using a minimal DOM/Context stub.
 * Run: node --test tests/*.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = readFileSync(join(ROOT, 'src/client/index.js'), 'utf8')
  .replace(/^export const /gm, 'const ')
  .replace(/^export function /gm, 'function ')

/** Minimal element with the members the fold logic touches. */
class El {
  constructor(tag, doc) {
    this.tagName = tag
    this.ownerDocument = doc
    this.children = []
    this.parentElement = null
    this.style = {
      _p: new Map(),
      setProperty(k, v) { this._p.set(k, v) },
      removeProperty(k) { this._p.delete(k) },
      getPropertyValue(k) { return this._p.get(k) ?? '' },
      get [Symbol.toStringTag]() { return 'CSSStyleDeclaration' },
    }
    this.dataset = {}
    this.attributes = {}
    this.listeners = {}
    this.textContent = ''
    this.className = ''
    this.id = ''
  }
  append(...kids) { for (const k of kids) this.appendChild(k) }
  appendChild(kid) { kid.parentElement = this; this.children.push(kid); return kid }
  insertBefore(node, ref) {
    const at = ref === null ? this.children.length : this.children.indexOf(ref)
    node.parentElement = this
    this.children.splice(at < 0 ? this.children.length : at, 0, node)
    return node
  }
  remove() {
    if (this.parentElement === null) return
    const i = this.parentElement.children.indexOf(this)
    if (i >= 0) this.parentElement.children.splice(i, 1)
    this.parentElement = null
  }
  setAttribute(k, v) { this.attributes[k] = String(v) }
  getAttribute(k) { return this.attributes[k] ?? null }
  removeAttribute(k) { delete this.attributes[k]; if (k === 'id') this.id = '' }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) }
  click() { for (const fn of this.listeners.click ?? []) fn() }
  querySelector(sel) {
    const all = this.querySelectorAll(sel)
    return all[0] ?? null
  }
  querySelectorAll(sel) {
    const out = []
    const match = (el) => {
      if (sel === '[data-label]' && el.dataset.label !== undefined) out.push(el)
      else if (sel === '[data-chevron]' && el.dataset.chevron !== undefined) out.push(el)
      else if (sel === '[data-badge]' && el.dataset.badge !== undefined) out.push(el)
      else if (sel === '#dsh-sidebar-fold-row' && el.id === 'dsh-sidebar-fold-row') out.push(el)
      for (const kid of el.children) match(kid)
    }
    for (const kid of this.children) match(kid)
    return out
  }
  includesCollapsed() {
    let node = this
    while (node !== null) {
      if (String(node.className).includes('collapsed')) return true
      node = node.parentElement
    }
    return false
  }
}

/** Minimal document with the members the fold logic touches. */
function makeDoc(lang = 'en') {
  const doc = new El('#document', null)
  doc.ownerDocument = doc
  doc.documentElement = new El('html', doc)
  doc.documentElement.lang = lang
  doc.body = new El('body', doc)
  doc.appendChild(doc.body)
  doc.createElement = (tag) => new El(tag, doc)
  doc.getElementById = (id) => {
    let found = null
    const walk = (el) => {
      if (el.id === id) found = el
      for (const kid of el.children) walk(kid)
    }
    walk(doc.body)
    return found
  }
  doc.querySelectorAll = (sel) => {
    const out = []
    const walk = (el) => {
      if (sel === 'nav[aria-label]' && el.tagName === 'nav' && el.attributes['aria-label'] !== undefined) out.push(el)
      if (sel === '[class*="panelList"]' && String(el.className).includes('panelList')) out.push(el)
      for (const kid of el.children) walk(kid)
    }
    walk(doc.body)
    return out
  }
  doc.querySelector = (sel) => doc.querySelectorAll(sel)[0] ?? null
  return doc
}

/** Build a sidebar fixture with N panel rows. */
function sidebar(doc, count, collapsed = false) {
  const root = doc.createElement('div')
  root.className = collapsed ? 'sidebar collapsed' : 'sidebar expanded'
  const nav = doc.createElement('nav')
  nav.setAttribute('aria-label', 'Global panels')
  for (let i = 0; i < count; i++) {
    const row = doc.createElement('button')
    row.textContent = 'Panel ' + i
    nav.appendChild(row)
  }
  root.appendChild(nav)
  doc.body.appendChild(root)
  return { root, nav }
}

/** Evaluate the fold logic against a stub document and return its exports. */
function load(doc) {
  const observers = []
  class FakeObserver {
    constructor(cb) { this.cb = cb; observers.push(this) }
    observe() { this.connected = true }
    disconnect() { this.connected = false }
  }
  const ctx = { effect: (fn) => { ctx._dispose = fn() } }
  const body = SOURCE + '\nreturn { apply, sync, findList, inject, MODULE };'
  const factory = new Function(
    'document', 'navigator', 'MutationObserver', 'setInterval', 'clearInterval',
    body,
  )
  const exported = factory(doc, { language: doc.documentElement.lang }, FakeObserver, () => 0, () => {})
  exported.apply(ctx)
  return { ...exported, ctx, observers }
}

test('single entry: no fold row is added', () => {
  const doc = makeDoc()
  const { nav } = sidebar(doc, 1)
  const { sync } = load(doc)
  sync(nav)
  assert.equal(doc.getElementById('dsh-sidebar-fold-row'), null)
})

test('rail (collapsed) state: icons stay, no fold row', () => {
  const doc = makeDoc()
  const { nav } = sidebar(doc, 3, true)
  const { sync } = load(doc)
  sync(nav)
  assert.equal(doc.getElementById('dsh-sidebar-fold-row'), null)
  for (const row of nav.children) assert.equal(row.style.getPropertyValue('display'), '')
})

test('expanded 2+ entries: fold hides all rows, badge shows count, restore brings them back', () => {
  const doc = makeDoc('zh')
  const { nav } = sidebar(doc, 3)
  const { sync } = load(doc)
  sync(nav)

  const header = doc.getElementById('dsh-sidebar-fold-row')
  assert.ok(header, 'fold header inserted')
  assert.equal(header.getAttribute('aria-controls'), 'dsh-sidebar-panel-list')
  assert.equal(header.getAttribute('aria-expanded'), 'true')
  assert.equal(header.querySelector('[data-label]').textContent, '面板')
  assert.equal(nav.id, 'dsh-sidebar-panel-list')

  header.click()
  assert.equal(header.getAttribute('aria-expanded'), 'false')
  for (const row of nav.children) assert.equal(row.style.getPropertyValue('display'), 'none')
  assert.equal(nav.style.getPropertyValue('margin-bottom'), '0')
  assert.equal(header.querySelector('[data-badge]').textContent, '3')

  header.click()
  assert.equal(header.getAttribute('aria-expanded'), 'true')
  for (const row of nav.children) assert.equal(row.style.getPropertyValue('display'), '')
  assert.equal(header.querySelector('[data-badge]'), null)
})

test('language localization: English label', () => {
  const doc = makeDoc('en')
  const { nav } = sidebar(doc, 2)
  const { sync } = load(doc)
  sync(nav)
  assert.equal(doc.getElementById('dsh-sidebar-fold-row').querySelector('[data-label]').textContent, 'Panels')
})

test('dispose removes the row, styles, and disconnects the observer', () => {
  const doc = makeDoc()
  const { nav } = sidebar(doc, 3)
  const { ctx, observers, sync } = load(doc)
  sync(nav)
  doc.getElementById('dsh-sidebar-fold-row').click()
  ctx._dispose()
  assert.equal(doc.getElementById('dsh-sidebar-fold-row'), null)
  assert.equal(nav.id, '')
  for (const row of nav.children) assert.equal(row.style.getPropertyValue('display'), '')
  assert.equal(observers[0].connected, false)
})

test('module contract', () => {
  const doc = makeDoc()
  const { inject, MODULE } = load(doc)
  assert.ok(Array.isArray(inject))
  assert.equal(MODULE, 'dsh-sidebar-fold')
})
