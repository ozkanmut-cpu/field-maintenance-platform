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
