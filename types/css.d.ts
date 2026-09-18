/**
 * Author: Ali Quraishi
 *
 * Next's own type shim (next/types/global.d.ts) only declares
 * `*.module.css` (CSS Modules), not plain `*.css`. Side-effect imports of
 * a package's plain stylesheet — e.g. `import "tldraw/tldraw.css"` in
 * components/Whiteboard.tsx — have no matching ambient module
 * declaration in some TypeScript/tooling configurations, which is what
 * produces "Cannot find module or type declarations for side-effect
 * import". This covers any plain .css import project-wide.
 */
declare module "*.css";