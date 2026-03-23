// Runtime-generated Unicode symbols to work around Bun bundler UTF-8 bug
// where literal Unicode chars in bundled output get garbled at runtime.
// See: https://github.com/oven-sh/bun/issues/XXXXX
export const TICK = String.fromCodePoint(0x2713);   // ✓
export const CROSS = String.fromCodePoint(0x2717);  // ✗
export const BULLET = String.fromCodePoint(0xb7);   // ·
export const ARROW = String.fromCodePoint(0x2192);  // →
