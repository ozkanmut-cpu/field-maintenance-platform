import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./paperwork-management.tsx', import.meta.url), 'utf8');

test('paperwork center defaults to last week through this week and pending-only', () => {
  assert.match(source, /function defaultPaperworkRange\(\)/,
    'the page needs one Istanbul-aware default range contract');
  assert.match(source, /shiftDateKey\(thisMonday, -7\)/,
    'the default must begin on the previous Monday');
  assert.match(source, /shiftDateKey\(thisMonday, 6\)/,
    'the default must end on the current Sunday');
  assert.match(source, /useState<PaperworkFilterStatus>\('PENDING'\)/,
    'the initial list must show pending work only');
});

test('paperwork filters cover range, technician, region, customer and both document states', () => {
  for (const label of [
    'Evrak başlangıç tarihi',
    'Evrak bitiş tarihi',
    'Evrak teknisyeni filtresi',
    'Evrak bölgesi filtresi',
    'Müşteri ara',
    'Teyit durumu filtresi',
    'Servis fişi durumu filtresi',
  ]) assert.match(source, new RegExp(`aria-label="${label}"`), `missing ${label}`);
  assert.match(source, /sessionStorage\.setItem\(PAPERWORK_FILTERS_KEY/,
    'filter changes must persist for a return to the page in this session');
  assert.match(source, /sessionStorage\.getItem\(PAPERWORK_FILTERS_KEY/,
    'the page must restore its prior session filters');
});

test('persisted missing labels remain neutral in summaries and filters', () => {
  assert.match(source, /MISSING: 'Eksik \/ yok'/);
  assert.match(source, /<span>Teyit Eksik \/ Yok<\/span>/);
  assert.doesNotMatch(source, /<span>Teyit Eksik<\/span>/,
    'the summary must not imply which MISSING decision was persisted');
});

test('paperwork center has no selection or bulk-apply affordance', () => {
  assert.doesNotMatch(source, /type="checkbox"/);
  assert.doesNotMatch(source, /Toplu Evrak İşlemi/);
  assert.doesNotMatch(source, /SEÇİLİLERİ GÜNCELLE/);
  assert.doesNotMatch(source, /paperwork\/bulk/);
});

test('paperwork rows expose counts, final single-record decisions and audit detail', () => {
  assert.match(source, /Teyit \/ Girilen Bakım \/ Soğutucu/);
  assert.match(source, /Teyit adedi kaynak veride yok/,
    'an unavailable confirmation count must be identified honestly');
  assert.doesNotMatch(source, /confirmationCount|confirmationApprovalSource|Manuel final/,
    'the UI must not rely on fields absent from technician-history');
  assert.match(source, /Teyit Onaylandı/);
  assert.match(source, /Teyit Yok/);
  assert.match(source, /Teyit Eksik/);
  assert.match(source, /Fiş Var/);
  assert.match(source, /Fiş Yok/);
  assert.match(source, /kind: 'CONFIRMATION', status: 'APPROVED'/);
  assert.match(source, /kind: 'CONFIRMATION', status: 'MISSING'/);
  assert.match(source, /kind: 'SERVICE_SLIP', status: 'APPROVED'/);
  assert.match(source, /kind: 'SERVICE_SLIP', status: 'MISSING'/);
  assert.match(source, />Detay</);
});

test('successful actions patch only the saved row while failures retain it with retry', () => {
  assert.match(source, /setVisits\(\(current\) => current\.map\(\(visit\) => visit\.id === visitId/,
    'a successful mutation must update the saved row in place');
  assert.doesNotMatch(source, /await loadVisits\(\);[\s\S]{0,120}if \(historyVisitId === visitId\)/,
    'single-record success must not reload the entire table');
  assert.match(source, /setRowErrors\(\(current\) => \(\{[\s\S]{0,300}\[visitId\]: \{ message:/,
    'a failed action must remain attached to its row');
  assert.match(source, /Tekrar dene/,
    'the failed row must expose a retry action');
  assert.match(source, /Kaydedildi/,
    'success feedback must be a saved toast');
});
