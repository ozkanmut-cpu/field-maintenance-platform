import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const filename = new URL('./NearbyScreen.tsx', import.meta.url);

test('nearby screen uses one result set for list and map', () => {
  assert.ok(fs.existsSync(filename), 'NearbyScreen must exist');
  const source = fs.readFileSync(filename, 'utf8');
  assert.match(source, /import MapView, \{ Marker \} from 'react-native-maps'/);
  assert.match(source, /mode.*'LIST'.*'MAP'/s);
  assert.match(source, /items\.map\(point =>.*<Marker/s);
  assert.match(source, /selectedPointId/);
  assert.match(source, /Yol tarifi/);
});
