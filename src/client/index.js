/**
 * Sidebar plugin/global-panel section fold — client half.
 *
 * The sidebar `panelList` (`sidebar.panellist`) is the region that grows with
 * the number of installed plugins and crowds out the workspace browser below
 * it. This plugin adds a compact collapsible section header above that list:
 * with two or more entries in the expanded column, one click folds every panel
 * row away and returns the vertical space to the workspace region. The 56px
 * rail keeps its icon column unchanged; a single entry adds no chrome.
 *
 * The patch is deliberately framework-neutral: it observes the shipped
 * sidebar's `nav[aria-label]` landmark instead of importing any plugin's
 * components, so it composes with any sidebar revision (drawer, pins,
 * more-menu, shortcuts). Fold state is transient view state that resets on
 * reload, mirroring the shell's own collapse handling.
 */
const FOLD_ID = 'dsh-sidebar-fold-row'
const LIST_ID = 'dsh-sidebar-panel-list'
const LABEL = { zh: '面板', en: 'Panels' }
/** Package name doubles as the client module-table id. */
const MODULE_ID = 'dsh-sidebar-fold'
const OBSERVER_OPTIONS = {
  childList: true, subtree: true, attributes: true,
  attributeFilter: ['class', 'lang'],
}

/** @returns {'zh' | 'en'} active UI language, defaulting to English. */
function language() {
  return String(document.documentElement.lang || navigator.language || 'en')
    .toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * Whether the sidebar is in its narrow rail state.
 * @param {Element} anchor - the panel list element.
 * @returns {boolean}
 */
function isRail(anchor) {
  let node = anchor.parentElement
  while (node !== null) {
    if (typeof node.className === 'string' && node.className.includes('collapsed')) return true
    node = node.parentElement
  }
  return false
}

/**
 * Set an inline style only when its value differs (idempotent writes).
 * @param {HTMLElement} el - target element.
 * @param {string} key - CSS property name.
 * @param {string} value - desired value.
 * @returns {void}
 */
function setStyle(el, key, value) {
  if (el.style.getPropertyValue(key) !== value) el.style.setProperty(key, value)
}

/**
 * Build the fold header button once.
 * @param {Document} doc - owning document.
 * @param {(folded: boolean) => void} onToggle - click callback.
 * @returns {HTMLButtonElement}
 */
function makeHeader(doc, onToggle) {
  const header = doc.createElement('button')
  header.type = 'button'
  header.id = FOLD_ID
  header.setAttribute('aria-controls', LIST_ID)
  Object.assign(header.style, {
    display: 'flex', alignItems: 'center', gap: '6px', minHeight: '28px',
    margin: '0 2px 4px', padding: '4px 8px', boxSizing: 'border-box',
    border: 'none', borderRadius: '8px', background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)', font: 'inherit',
    fontSize: '12px', fontWeight: '500', lineHeight: '18px',
    textAlign: 'left', cursor: 'pointer',
  })
  const label = doc.createElement('span')
  label.dataset.label = 'true'
  Object.assign(label.style, {
    flex: '1', minWidth: '0', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  })
  const chevron = doc.createElement('span')
  chevron.dataset.chevron = 'true'
  chevron.setAttribute('aria-hidden', 'true')
  chevron.textContent = '▾'
  Object.assign(chevron.style, {
    flex: 'none', display: 'inline-flex',
    transition: 'transform .15s var(--ds-ease-in-out)',
  })
  header.append(label, chevron)
  header.addEventListener('click', () => {
    onToggle(header.getAttribute('aria-expanded') === 'true')
  })
  return header
}

/**
 * Reflect the folded state on the panel list and its header badge.
 * @param {Element} list - panel list element.
 * @param {HTMLButtonElement} header - fold header element.
 * @param {boolean} folded - whether rows are hidden.
 * @returns {void}
 */
function applyFold(list, header, folded) {
  for (const child of list.children) setStyle(child, 'display', folded ? 'none' : '')
  setStyle(list, 'margin-bottom', folded ? '0' : '')
  const chevron = header.querySelector('[data-chevron]')
  if (chevron !== null) setStyle(chevron, 'transform', folded ? 'rotate(-90deg)' : 'none')
  let badge = header.querySelector('[data-badge]')
  if (folded) {
    if (badge === null) {
      badge = header.ownerDocument.createElement('span')
      badge.dataset.badge = 'true'
      badge.setAttribute('aria-hidden', 'true')
      Object.assign(badge.style, {
        flex: 'none', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', minWidth: '18px', height: '18px',
        padding: '0 5px', borderRadius: '9px',
        background: 'var(--dsw-alias-interactive-bg-hover)',
        color: 'var(--dsw-alias-label-secondary)', fontSize: '11px',
      })
      header.insertBefore(badge, chevron)
    }
    const count = String(list.children.length)
    if (badge.textContent !== count) badge.textContent = count
  } else if (badge !== null) {
    badge.remove()
  }
  header.setAttribute('aria-expanded', String(!folded))
}

/**
 * Synchronize the fold row for one panel list. Every write is idempotent.
 * @param {Element} list - the `nav[aria-label]` panel list.
 * @returns {void}
 */
function sync(list) {
  const parent = list.parentElement
  const wide = !isRail(list)
  const rows = list.children.length
  if (!wide || rows < 2 || parent === null) {
    parent?.querySelector('#' + FOLD_ID)?.remove()
    if (list.id === LIST_ID) list.removeAttribute('id')
    setStyle(list, 'margin-bottom', '')
    for (const child of list.children) setStyle(child, 'display', '')
    return
  }

  let header = parent.querySelector('#' + FOLD_ID)
  if (header === null) {
    header = makeHeader(list.ownerDocument, (folded) => applyFold(list, header, folded))
    parent.insertBefore(header, list)
  }
  const label = header.querySelector('[data-label]')
  const text = LABEL[language()]
  if (label !== null && label.textContent !== text) label.textContent = text
  if (list.id !== LIST_ID) list.id = LIST_ID
  applyFold(list, header, header.getAttribute('aria-expanded') === 'false')
}

/**
 * Find the global panel list. `nav[aria-label]` is the shipped sidebar's
 * stable accessible landmark; the class-hash fallback covers replacements.
 * @param {Document} doc - document to search.
 * @returns {Element | null}
 */
function findList(doc) {
  for (const nav of doc.querySelectorAll('nav[aria-label]')) {
    if (nav.children.length > 0 || nav.querySelector('[class*="panelRow"]') !== null) return nav
  }
  return doc.querySelector('[class*="panelList"]')
}

/** Services required by the client fiber (empty: pure DOM contribution). */
export const inject = []

/**
 * Install a MutationObserver that keeps the fold row in sync with the shipped
 * sidebar's renders. The callback disconnects before applying and reconnects
 * afterwards, so its own DOM writes can never re-trigger it. All resources
 * are released with the client fiber.
 * @param {import('@deepseek-ai/cordis').Context} ctx - client plugin context.
 * @returns {void}
 */
export function apply(ctx) {
  const doc = document
  const observer = new MutationObserver(() => {
    observer.disconnect()
    try {
      const list = findList(doc)
      if (list !== null) sync(list)
    } finally {
      observer.observe(doc.body, OBSERVER_OPTIONS)
    }
  })
  observer.observe(doc.body, OBSERVER_OPTIONS)
  const initial = findList(doc)
  if (initial !== null) {
    observer.disconnect()
    sync(initial)
    observer.observe(doc.body, OBSERVER_OPTIONS)
  }

  ctx.effect(() => () => {
    observer.disconnect()
    doc.getElementById(FOLD_ID)?.remove()
    const list = doc.getElementById(LIST_ID)
    if (list !== null) {
      list.removeAttribute('id')
      setStyle(list, 'margin-bottom', '')
      for (const child of list.children) setStyle(child, 'display', '')
    }
  }, 'sidebar-fold: dispose observer and injected row')
}

/** Module id used by the build wrapper (kept for the verify harness). */
export const MODULE = MODULE_ID
