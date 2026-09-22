import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const stylesPath = new URL('./globals.css', import.meta.url);

test('phone filters and action rows stack controls instead of overflowing a narrow viewport', () => {
  const styles = readFileSync(stylesPath, 'utf8');
  assert.match(styles, /@media\(max-width:600px\)\{[^}]*\.filterBar,\.actions,\.rowActions\{[^}]*align-items:stretch/);
  assert.match(styles, /\.filterBar>\*\{flex-basis:100%/);
  assert.match(styles, /\.actions>button,\.rowActions>button\{width:100%/);
});

test('sticky table columns use independent measured offsets and opaque frozen surfaces', () => {
  const styles = readFileSync(stylesPath, 'utf8');
  assert.match(styles, /--sticky-column-1-width:/);
  assert.match(styles, /--sticky-column-2-width:/);
  assert.match(styles, /--sticky-column-3-width:/);
  assert.match(styles, /--sticky-column-2-offset:var\(--sticky-column-1-width\)/);
  assert.match(styles, /--sticky-column-3-offset:calc\(var\(--sticky-column-1-width\) \+ var\(--sticky-column-2-width\)\)/);
  assert.match(styles, /tbody :is\(td:first-child,td:nth-child\(2\),td:nth-child\(3\)\)\{background:var\(--surface\)\}/);
  assert.match(styles, /thead :is\(th:first-child,th:nth-child\(2\),th:nth-child\(3\)\)\{background:#f7f9fc/);
  assert.doesNotMatch(styles, /\.stickyTable[^\n]*background:inherit/);
});
