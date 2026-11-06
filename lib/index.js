/**
 * Sidebar fold plugin, node half. This is a pure client-side UI contribution:
 * the empty apply exists so the Loader mounts the row and discovers the
 * browser half through exports["./client"] and the package.json dsh.client
 * declaration. There is deliberately no host-side behavior, tool, or storage.
 */

/** Host plugin body — no host-side behavior. */
export function apply() {}
