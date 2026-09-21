import { configure } from "@testing-library/dom";

// Testing Library's async helpers — waitFor, findBy* — carry their OWN 1000ms
// timeout that is independent of Vitest's testTimeout. On a loaded CI runner
// (every job shares a 2-core box) a React state update + refetch that normally
// settles in tens of milliseconds can be starved past that 1s window, and the
// waitFor fails with a stale assertion even though the app is behaving. That
// scheduler starvation — not any real defect — is what produced the
// intermittent component-test failures. Raising the async-utils ceiling gives
// those polls room to complete under contention; a genuinely stuck update still
// fails, just after a realistic wait rather than a fixed one second.
configure({ asyncUtilTimeout: 15_000 });

// jsdom ships no matchMedia, and components that adapt their layout to a
// breakpoint have to ask for one. Default to the DESKTOP answer (no match) so
// existing tests see what they always saw; a test that wants the narrow
// behaviour overrides window.matchMedia itself.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  });
}
