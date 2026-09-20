function normalize(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

const { exportAndFinalize } = require('./sap_export_download_orchestrator');
const { clickExact, waitUnique } = require('./sap_navigation_executor');
const { exportCandidates } = require('./sap_results_contract');
const { findSearchButton } = require('./sap_search_execute_guard');
const { setEditable } = require('./sap_search_setters');

const EDITABLE_SELECTOR = 'input:not([type=hidden]),select,textarea';
const LABELS = {
  startDate: ['Başlangıç', 'Başlangıç Tarihi', 'Başlangıç tarihi'],
  endDate: ['Bitiş', 'Bitiş Tarihi', 'Bitiş tarihi'],
  dealer: ['Bayi / Taşeron / Nokta'],
  max: ['Azami Arama Sonuç Sayısı', 'Azami sonuç sayısı'],
};

function dateParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function formatSapDateFromParts({ year, month, day }) {
  return `${day}.${month}.${year}`;
}

function expectedMovementRange({ now = Date.now(), timeZone = 'Europe/Istanbul' } = {}) {
  const endParts = dateParts(now, timeZone);
  const endUtc = Date.UTC(Number(endParts.year), Number(endParts.month) - 1, Number(endParts.day));
  const start = new Date(endUtc - 14 * 24 * 60 * 60 * 1000);

  return {
    startDate: formatSapDateFromParts({
      year: String(start.getUTCFullYear()),
      month: String(start.getUTCMonth() + 1).padStart(2, '0'),
      day: String(start.getUTCDate()).padStart(2, '0'),
    }),
    endDate: formatSapDateFromParts(endParts),
  };
}

function verifyMovement(values, options = {}) {
  const expected = expectedMovementRange(options);
  const startDate = normalize(values?.startDate);
  const endDate = normalize(values?.endDate);
  const dealer = normalize(values?.dealer);
  const max = normalize(values?.max).replace(/\D/g, '');

  if (dealer !== '5000013') throw new Error('SAFE_ABORT_MOVEMENT:dealer-not-5000013');
  if (startDate !== expected.startDate) {
    throw new Error('SAFE_ABORT_MOVEMENT:start-date-not-today-minus-14');
  }
  if (endDate !== expected.endDate) throw new Error('SAFE_ABORT_MOVEMENT:end-date-not-today');
  if (max !== '5000') throw new Error('SAFE_ABORT_MOVEMENT:max-not-5000');

  return { startDate, endDate, dealer: '5000013', max: '5000' };
}

async function configureMovementWithControls(controls, options = {}) {
  const expected = expectedMovementRange(options);
  await controls.set('startDate', expected.startDate);
  await controls.set('endDate', expected.endDate);
  await controls.set('dealer', '5000013');
  await controls.set('max', '5000');
  return verifyMovement(await controls.read(), options);
}

async function locateMovementControl(page, labels) {
  const hits = [];
  for (const [frameIndex, frame] of page.frames().entries()) {
    const result = await frame.evaluate(({ expectedLabels, selector }) => {
      const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
      const expected = new Set(expectedLabels.map(normalizeText));
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const controls = Array.from(document.querySelectorAll(selector));
      const labelsFound = Array.from(document.querySelectorAll('label,th,td,span,div'))
        .filter((element) => visible(element) && element.children.length === 0 && expected.has(normalizeText(element.textContent)));
      return labelsFound.map((label) => {
        let control = label.htmlFor ? document.getElementById(label.htmlFor) : null;
        if (!control) control = label.parentElement?.querySelector(selector) || label.nextElementSibling?.matches?.(selector) && label.nextElementSibling;
        if (!control) {
          const labelRect = label.getBoundingClientRect();
          control = controls.filter(visible).sort((left, right) => {
            const leftRect = left.getBoundingClientRect();
            const rightRect = right.getBoundingClientRect();
            const leftDistance = Math.hypot(leftRect.left - labelRect.right, leftRect.top - labelRect.top);
            const rightDistance = Math.hypot(rightRect.left - labelRect.right, rightRect.top - labelRect.top);
            return leftDistance - rightDistance;
          })[0];
        }
        return control ? controls.indexOf(control) : -1;
      }).filter((index) => index >= 0);
    }, { expectedLabels: labels, selector: EDITABLE_SELECTOR }).catch(() => []);
    for (const index of result) hits.push({ frameIndex, index });
  }
  if (hits.length !== 1) throw new Error(`SAFE_ABORT_MOVEMENT:control-not-unique:${labels[0]}:${hits.length}`);
  return page.frames()[hits[0].frameIndex].locator(EDITABLE_SELECTOR).nth(hits[0].index);
}

async function createMovementControls(page) {
  const controls = {};
  for (const [name, labels] of Object.entries(LABELS)) controls[name] = await locateMovementControl(page, labels);
  return {
    set: async (name, value) => setEditable(controls[name], value),
    read: async () => ({
      startDate: await controls.startDate.inputValue(),
      endDate: await controls.endDate.inputValue(),
      dealer: await controls.dealer.inputValue(),
      max: await controls.max.inputValue(),
    }),
  };
}

async function navigateToCoolerMovement(page, timeout = 10000) {
  await clickExact(page, 'Raporlar');
  await waitUnique(page, 'Soğutucu Hareket Raporu', timeout);
  await clickExact(page, 'Soğutucu Hareket Raporu');
  const end = Date.now() + timeout;
  let last = '';
  while (Date.now() < end) {
    try { await createMovementControls(page); return { navigated: true, target: 'Soğutucu Hareket Raporu' }; }
    catch (error) { last = error.message; await page.waitForTimeout(200); }
  }
  throw new Error(`SAFE_ABORT_MOVEMENT:search-screen-timeout:${last}`);
}

async function configureCoolerMovement(page, options = {}) {
  return configureMovementWithControls(await createMovementControls(page), options);
}

async function clickSearch(page) {
  const button = await findSearchButton(page);
  const frame = page.frames()[button.frame];
  if (!frame) throw new Error('SAFE_ABORT_MOVEMENT:search-frame-missing');
  await frame.locator(button.selector).nth(button.index).click();
}

async function inspectMovementResults(page) {
  const exports = [];
  for (const [frameIndex, frame] of page.frames().entries()) exports.push(...await exportCandidates(frame, frameIndex));
  if (exports.length !== 1) throw new Error(`SAFE_ABORT_MOVEMENT:export-control-not-unique:${exports.length}`);
  return { ready: true, export: exports[0] };
}

async function waitForMovementResults(page, timeout = 20000) {
  const end = Date.now() + timeout;
  let last = '';
  while (Date.now() < end) {
    try { return await inspectMovementResults(page); }
    catch (error) { last = error.message; await page.waitForTimeout(250); }
  }
  throw new Error(`SAFE_ABORT_MOVEMENT:results-timeout:${last}`);
}

function isoRange(criteria) {
  const toIso = (value) => {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
    if (!match) throw new Error('SAFE_ABORT_MOVEMENT:invalid-date-format');
    return `${match[3]}-${match[2]}-${match[1]}`;
  };
  return { from: toIso(criteria.startDate), to: toIso(criteria.endDate) };
}

async function acquireCoolerMovement(page, options = {}) {
  const now = options.now ?? Date.now();
  const deps = {
    navigate: navigateToCoolerMovement,
    configure: configureCoolerMovement,
    clickSearch,
    waitForResults: waitForMovementResults,
    download: exportAndFinalize,
    ...options.deps,
  };

  await deps.navigate(page);
  const criteria = verifyMovement(await deps.configure(page, { now, timeZone: options.timeZone }), { now, timeZone: options.timeZone });
  await deps.clickSearch(page);
  const results = await deps.waitForResults(page, options.timeout ?? 20000);
  const download = await deps.download(page, results.export, {
    timeout: options.downloadTimeout ?? 10000,
    dir: options.downloadDir,
  });
  return {
    ...download,
    criteria,
    acquiredAt: new Date(now).toISOString(),
    dateRange: isoRange(criteria),
  };
}

module.exports = {
  acquireCoolerMovement,
  configureCoolerMovement,
  configureMovementWithControls,
  createMovementControls,
  expectedMovementRange,
  inspectMovementResults,
  navigateToCoolerMovement,
  verifyMovement,
  waitForMovementResults,
};
