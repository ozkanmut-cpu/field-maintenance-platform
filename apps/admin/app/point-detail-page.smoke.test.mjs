import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const path = new URL('./point-detail-page.tsx', import.meta.url);
test('point detail stays read only until explicit edit mode', () => {
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  assert.match(source, /useState\(false\)/);
  assert.match(source, /Düzenle/);
  const timelineStart = source.indexOf("if (activeTab === 'timeline')");
  const timelineEnd = source.indexOf('\n  return <section', timelineStart + 1);
  assert.doesNotMatch(source.slice(timelineStart, timelineEnd), /rowActions/,
    'Timeline is a read-only history view and must not offer a no-op edit control');
  assert.match(source, /Kaydet/);
  assert.match(source, /İptal/);
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /\/api\/backend\/regions/,
    'A missing region must be selectable from the real regions endpoint before PATCHing the point');
  assert.match(source, /regionId/,
    'Point Detail must PATCH the selected region id rather than accepting a free-form region name');
  assert.match(source, /<option value="1">Hafta 1<\/option><option value="2">Hafta 2<\/option>/,
    'Single-point schedule edits must constrain the maintenance week to the backend-supported 1/2 values');
  assert.match(source, /function scheduleWeekValue\(value: number \| null \| undefined\) \{ return value === 1 \|\| value === 2 \? String\(value\) : ''; \}/,
    'Missing or invalid weeks must render as an explicit blank selection, never as a misleading week 1');
  assert.match(source, /<option value="" disabled>Rut haftası seçin<\/option>/,
    'An invalid schedule must require an explicit supported week selection before it can be saved');
  assert.match(source, /value=\{scheduleWeekValue\(value\.maintenanceWeek\)\}/,
    'Selecting week 1 from an invalid schedule must create a real draft change and PATCH payload');
  assert.match(source, /const payload = Object\.fromEntries\(Object\.entries\(\{ name: draft\.name, status: draft\.status, regionId: draft\.region\?\.id, maintenanceWeek: draft\.maintenanceWeek, smartcleanReferenceAt: draft\.smartcleanReferenceAt \}\)/,
    'A shared draft must PATCH all supported changes together after switching detail tabs');
  assert.match(source, /scheduleTouched && !scheduleWeekValue\(draft\.maintenanceWeek\)/,
    'Editing a SmartClean reference alone must not submit an invalid inherited week');
  assert.match(source, /type="date"[\s\S]*SmartClean referans tarihi/,
    'SmartClean schedule corrections need a real reference-date control in the Maintenance tab');
  assert.match(source, /activeTab === 'maintenance'[\s\S]*Bakım ayarları/,
    'Schedule controls belong in the Maintenance tab, not the general point form');
  assert.match(source, /maintenance\/point-timeline\?pointId=/,
    'Timeline tab must use the real point timeline endpoint');
  assert.match(source, /Bakım ziyaretleri/,
    'Timeline tab must group the real event stream into meaningful operational event types');
  assert.match(source, /Soğutucu \$\{data\.maintainedCoolerCount\}\/\$\{data\.totalCoolerCount\}/,
    'Timeline maintenance summaries must show the maintained/operational cooler counts');
  assert.match(source, /Yapılamadı kaydı/,
    'Timeline tab must distinguish an attempt from a completed maintenance visit');
  assert.match(source, /Atama değişikliği/,
    'Timeline tab must expose assignment changes without creating assignment mutations');
  assert.match(source, /Zaman/,
    'Timeline tab must show each event time in a dedicated column');
  assert.match(source, /maintenance\/obligations\/point\/\$\{pointId\}\/history/,
    'Maintenance tab must use real obligation history');
  assert.match(source, /Açık yükümlülük/,
    'Maintenance tab must make the real obligation totals readable without exposing raw objects');
  assert.match(source, /Dönem/,
    'Maintenance tab must show the real obligation cycle');
  assert.match(source, /Vade aralığı/,
    'Maintenance tab must show the real obligation due window');
  assert.match(source, /Gerçekleşen ziyaretler/,
    'Maintenance tab must expose the visits linked to each obligation');
  assert.doesNotMatch(source, /completedAt \?\? item\.resolvedAt/,
    'A missed obligation resolution must not be presented as a completed maintenance');
  assert.match(source, /assignments\/point\/\$\{pointId\}/,
    'Assignments tab must use real point assignments');
  assert.match(source, /Görevlendirme türü/,
    'Assignments tab must give the real assignment kind a readable label');
  assert.match(source, /Başlangıç/,
    'Assignments tab must show the real assignment start time');
  assert.match(source, /Aktiflik/,
    'Assignments tab must expose whether the assignment remains active');
  assert.match(source, /audit\?entityId=/,
    'Audit tab must use the real audit endpoint filtered by point id');
  assert.match(source, /İşlem zamanı/,
    'Audit tab must present the real audit timestamp in a dedicated readable column');
  assert.match(source, /İşlemi yapan/,
    'Audit tab must expose the real audit actor rather than a raw object');
  assert.match(source, /Değişen alanlar/,
    'Audit tab must preserve before\/after values behind a focused disclosure');
  assert.match(source, /oldValue/,
    'Audit tab must retain the real previous value payload');
  assert.match(source, /newValue/,
    'Audit tab must retain the real new value payload');
  assert.match(source, /maintenance\/point\/\$\{pointId\}\/paperwork-history/,
    'Paperwork tab must use the real point-scoped paperwork history endpoint');
  assert.doesNotMatch(source, /Bu ayrıntılar mevcut Evrak Yönetimi ekranında korunur/,
    'Paperwork must be inspectable from the point detail rather than a placeholder');
  assert.match(source, /Evrak durumu/,
    'Paperwork must have a dedicated, readable operations table rather than raw object JSON');
  assert.match(source, /Servis fişi/);
  assert.match(source, /Teyit/);
  assert.match(source, /Değişiklik geçmişi/);
  assert.match(source, /formatDateTime/,
    'Paperwork dates must be rendered as readable timestamps');
  assert.match(source, /paperworkChanges/,
    'Each visit must expose the real per-visit paperwork changes, not only a count');
  assert.match(source, /previousStatus/,
    'Paperwork history must use the real Prisma previousStatus field');
  assert.match(source, /newStatus/);
  assert.match(source, /status: location\.status/);
  assert.match(source, /region: location\.region/);
  assert.match(source, /maintenanceType: location\.maintenanceType/);
  assert.match(source, /page: location\.page/);
  assert.match(source, /scrollY: location\.scrollY/);
});

test('point detail header uses real ownership data and preserves return-to-list context', () => {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /\/api\/backend\/assignments\/effective\/\$\{pointId\}/,
    'The header must load the effective technician from the authoritative assignment endpoint');
  assert.match(source, /Geri dön: Noktalar/,
    'Point Detail must offer a visible return to the originating points list');
  assert.match(source, /const returnToPoints = \(\) => onNavigate\('points', \{ query: location\.query, status: location\.status, region: location\.region, maintenanceType: location\.maintenanceType, page: location\.page, scrollY: location\.scrollY \}\)/,
    'Returning to the list must retain the complete filter, page, and scroll context');
  assert.match(source, /<button className="ghost" onClick=\{\(\) => returnToPoints\(\)\}>Geri dön: Noktalar<\/button>/,
    'The General-tab header return must use the complete context-preserving return path rather than dropping region or maintenance type');
  assert.doesNotMatch(source, /onClick=\{\(\) => onNavigate\('points'\)\}/,
    'The shared tab control must not duplicate the main return action');
  assert.equal((source.match(/Geri dön: Noktalar/g) ?? []).length, 1,
    'Point Detail must render exactly one return action');
  assert.equal((source.match(/<DetailTabs activeTab=\{activeTab\} onNavigate=\{navigateTab\} \/>/g) ?? []).length, 4,
    'General, audit, timeline, and the shared remaining-tab view must each expose the direct list return');
  assert.match(source, /Bakım tipi/,
    'The header must expose the point maintenance type');
  assert.match(source, /Geçerli teknisyen/,
    'The header must identify the effective technician rather than assuming the region technician');
});

test('point detail exposes a single mockup-aligned identity and operations summary', () => {
  const source = readFileSync(path, 'utf8');

  assert.match(source, /aria-label="İçerik yolu"/);
  assert.match(source, /Nokta Yönetimi/);
  assert.match(source, /Noktalar/);
  assert.match(source, /maintenanceTypeLabel/);
  assert.match(source, /locationSummary/);
  assert.match(source, /Google doğrulandı/);
  assert.match(source, /Son bakım/);
  assert.match(source, /Teyit girilen bakım/);
  assert.match(source, /Soğutucu/);
  assert.match(source, /Servis fişi/);
  assert.match(source, /Admin kararı/);
  assert.match(source, /title=\{`Kaynak:/,
    'Technical source values may appear only as supplemental badge metadata');
  assert.equal((source.match(/>Düzenle</g) ?? []).length, 1,
    'Point detail has one primary edit action');
});

test('point detail manages aliases only through the supported list and add contract', () => {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /\/api\/backend\/points\/\$\{pointId\}\/aliases/,
    'Point Detail must list aliases from the dedicated GET endpoint');
  assert.match(source, /method: 'POST'[\s\S]*JSON\.stringify\(\{ alias: aliasDraft\.trim\(\) \}\)/,
    'Point Detail must add an alias using the supported POST body only');
  assert.match(source, /minLength=\{2\}[\s\S]*maxLength=\{160\}/,
    'Alias input must reflect the API validation range before submitting');
  assert.match(source, /<label htmlFor="point-alias">Yeni alias<\/label>/,
    'The alias input needs a persistent accessible label');
  assert.match(source, /Alias ekle/,
    'Adding an alias must be a deliberate submit action');
  assert.match(source, /aliases\.length === 0 \|\| editing/,
    'An empty alias state must expose Alias ekle without forcing point edit mode first');
  assert.doesNotMatch(source, /\/aliases'.*method: 'PATCH'|\/aliases'.*method: 'DELETE'/,
    'The UI must not advertise unsupported alias mutation endpoints');
});

test('paperwork rows keep confirmation and change history in their own columns', () => {
  const source = readFileSync(path, 'utf8');
  const paperworkStart = source.indexOf("activeTab === 'paperwork'");
  const paperworkEnd = source.indexOf(" : <div className=\"tableWrap\"><table><tbody>{rows.map", paperworkStart);
  const paperwork = source.slice(paperworkStart, paperworkEnd);
  assert.match(paperwork, /<th>Teyit<\/th><th>Değişiklik geçmişi<\/th>/,
    'Paperwork retains separate headers for confirmation and change history');
  assert.match(paperwork, /paperworkStatus\(item\.serviceSlipStatus\)\}<\/td><td>\{paperworkStatus\(item\.confirmationStatus\)\}<\/td><td>\{paperworkChanges/,
    'Each paperwork row needs a dedicated confirmation-status cell before its change history');
});

test('point detail localizes every paperwork lifecycle status', () => {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /PENDING_REVIEW: 'İnceleme bekliyor'/);
  assert.match(source, /APPROVED: 'Onaylandı'/);
});

test('point detail has keyboard-accessible tabs and Point Timeline and Prospects link into its real record', () => {
  const source = readFileSync(path, 'utf8');
  const timeline = readFileSync(new URL('./point-timeline.tsx', import.meta.url), 'utf8');
  const prospects = readFileSync(new URL('./prospects.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
  assert.match(source, /role="tab"[\s\S]*aria-controls=/,
    'Tabs must identify their controlled panel');
  assert.match(source, /role="tabpanel"[\s\S]*aria-labelledby=/,
    'Each detail tab needs an announced panel relationship');
  assert.match(source, /tabIndex=\{activeTab === id \? 0 : -1\}/,
    'Only the active tab may be reached in the normal tab sequence');
  assert.match(source, /document\.getElementById\(`point-detail-tab-\$\{detailTabs\[nextIndex\]\[0\]\}`\)\?\.focus\(\)/,
    'Arrow-key navigation must move focus to the newly selected tab');
  assert.match(styles, /\.pointDetailAliasForm[\s\S]*:focus-visible/,
    'Point Detail must give its alias form controls a visible focus treatment');
  assert.match(timeline, /onNavigate\('point-detail', \{ pointId: timeline\.point\.id, detailTab: 'timeline' \}\)/,
    'Timeline must open the point whose events are currently shown');
  assert.match(prospects, /onNavigate\('point-detail', \{ pointId: result\.point\.id, detailTab: 'general' \}\)/,
    'Converting a prospect must open its resulting point detail before the candidate disappears from the list');
});
