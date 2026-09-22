import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const pointListPath = new URL('./point-list.tsx', import.meta.url);
const navigationPath = new URL('./admin-navigation.ts', import.meta.url);

test('point list is a read-only finding surface', () => {
  assert.equal(existsSync(pointListPath), true);
  const source = readFileSync(pointListPath, 'utf8');
  assert.match(source, /Detay/);
  assert.match(source, /Toplu İşlemler/);
  assert.match(source, /point\.aliases\.map\(\(item\) => item\.alias\)/,
    'alias records returned by GET /points must participate in search');
  assert.doesNotMatch(source, /method: 'PATCH'/);
  assert.doesNotMatch(source, /bulk-update/);
  assert.doesNotMatch(source, /onChange=.*point\.status/);
});

test('point list keeps real region and maintenance filters in the list-detail URL context', () => {
  const source = readFileSync(pointListPath, 'utf8');
  const navigation = readFileSync(navigationPath, 'utf8');

  assert.match(source, /region\?\.technician/);
  assert.match(source, /locationSource/);
  assert.match(source, /Bölge filtresi/);
  assert.match(source, /Bakım tipi filtresi/);
  assert.match(source, /scrollY/);
  assert.match(source, /pageSize = 25/);
  assert.match(source, /window\.history\.pushState/);
  assert.doesNotMatch(source, /function replaceListLocation/);
  assert.match(navigation, /region\?: string/);
  assert.match(navigation, /maintenanceType\?: string/);
  assert.match(navigation, /scrollY\?: string/);
  assert.match(navigation, /admin-navigation-runtime/,
    'the executable navigation helper owns URL parsing and building');
});

test('point list presents mockup-aligned human labels, filters, grouping and timestamps', () => {
  const source = readFileSync(pointListPath, 'utf8');

  assert.match(source, /AdminFilterToolbar/);
  assert.match(source, /resultLabel="sonuç"/);
  assert.match(source, /Aktif filtreler/);
  assert.match(source, /Filtreleri temizle/);
  assert.match(source, /stickyColumns=\{2\}/);
  assert.match(source, /pointRowGroup/);
  assert.match(source, /Aynı nokta/);
  assert.match(source, /formatShortDateTime/);
  assert.match(source, /Google doğrulandı/);
  assert.match(source, /Smart Clean/);
  assert.match(source, /<strong>\{point\.name\}<\/strong>/);
  assert.match(source, /\{point\.code\} · \{point\.address \?\? 'Adres yok'\}/);
  assert.doesNotMatch(source, />STANDARD</);
  assert.doesNotMatch(source, />SMARTCLEAN</);
  assert.doesNotMatch(source, />ACTIVE</);
});

test('point list restores safe filter preferences, formats compact timestamps, and paginates whole identity groups', () => {
  const source = readFileSync(pointListPath, 'utf8');

  assert.match(source, /pointListPreferencesKey/,
    'Point filters need a dedicated session preference key');
  assert.match(source, /sessionStorage\.getItem\(pointListPreferencesKey\)/,
    'Returning from another sidebar section must restore saved point filters');
  assert.match(source, /sessionStorage\.setItem\(pointListPreferencesKey/,
    'Every point filter change must persist the current safe preference set');
  assert.match(source, /const groupedVisible = groupPointsByIdentity\(visible\)/,
    'Duplicate point identities must be grouped before pagination');
  assert.match(source, /const visibleGroups = groupedVisible\.slice/,
    'Pagination must slice whole groups rather than individual duplicate rows');
  assert.match(source, /`\$\{day\} \$\{month\} · \$\{hour\}:\$\{minute\}`/,
    'List timestamps must use the exact compact 21 Eyl · 16:48 shape');
});
