# dsh-sidebar-fold

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
makes the left sidebar's **plugin / global-panel entry section collapsible**.
When many plugins register a `sidebar.panellist` entry, that list grows and
squeezes the workspace/session browser below it. This plugin adds a compact
section header above the list: one click folds every entry away and returns the
vertical space to the workspace region; another click restores them.

- Works with the shipped 0.2.x sidebar (drawer, pins, "more" menu, shortcuts
  all keep working) — it observes the `nav[aria-label]` landmark instead of
  importing or replacing any plugin component.
- Only in the **expanded** column and only with **2+ entries**; the 56px rail
  keeps its icon column, and a single entry adds no chrome.
- The fold header shows a count badge while folded, carries
  `aria-expanded` / `aria-controls`, and localizes its label (中文 `面板` /
  English `Panels`).
- Fold state is transient view state that resets on reload, matching the
  shell's own collapse handling.
- No host-side behavior, no tools, no storage, no network. Client-only.

## Install

`lib/` is committed, so a Git install needs no dependency build scripts:

```sh
npx -p @deepseek-ai/dsh dsh plugin --profile web add github:Yazzyk/dsh-sidebar-fold
```

Then restart the target profile. Use your actual profile name in place of
`web` (for example `desktop`).

To install a local checkout instead:

```sh
npx -p @deepseek-ai/dsh dsh plugin --profile web add /path/to/dsh-sidebar-fold
```

## What it registers

The `cordis.patch.yml` layer inserts one row:

```yaml
- insert:
    - id: sidebar-fold
      name: dsh-sidebar-fold
      config: {}
```

The package declares `dsh.client.platform: web` and `exports["./client"]`, so
the browser module table picks up `lib/client.js`. The host entry
(`lib/index.js`) is an empty `apply()` — required so the Loader mounts the row,
but with no host-side effects.

## Verify locally

```sh
npm run build     # regenerate lib/ from src/
npm run verify    # check exports, module protocol, patch, factory contract
npm test          # behavior tests against a minimal DOM stub
```

`npm test` covers: no fold row for a single entry, no fold row in the rail,
fold/restores all rows with a count badge, and full cleanup on dispose.

## How it works

`apply(ctx)` installs a `MutationObserver` on `document.body`. On each sidebar
render it finds the panel list, inserts (or refreshes) the fold header before
it, and reflects the folded state with inline styles. The callback
disconnects before writing and reconnects afterwards, so its own DOM writes
never re-trigger it; every write is idempotent. `ctx.effect()` releases the
observer, the injected row, and all inline styles when the client fiber is
disposed (HMR safe).

## License

MIT
