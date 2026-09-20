function normalize(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

const { pickDateOption } = require('./sap_date_option');
const { exportAndFinalize } = require('./sap_export_download_orchestrator');
const { navigateToConfirmations } = require('./sap_navigation_executor');
const { detect, selectField } = require('./sap_real_search_live');
const { requireUniqueSlots } = require('./sap_real_search');
const { waitForResultsReady } = require('./sap_results_contract');
const { findSearchButton } = require('./sap_search_execute_guard');

const escapeId = (value) => `#${value.replace(/([\\"#.;:[\](),>+~*^$|=])/g, '\\$1')}`;

function verifyExport2(values) {
  const date = normalize(values?.date);
  const product = normalize(values?.product);
  const max = normalize(values?.max).replace(/\D/g, '');

  if (product !== '') throw new Error('SAFE_ABORT_EXPORT2:product-must-be-blank');
  if (!date.includes('14') || !date.toLocaleLowerCase('tr-TR').includes('gün')) {
    throw new Error('SAFE_ABORT_EXPORT2:date-not-14-days');
  }
  if (max !== '2000') throw new Error('SAFE_ABORT_EXPORT2:max-not-2000');

  return { date, product: '', max: '2000' };
}

async function configureExport2WithControls(controls) {
  await controls.select14Days();
  await controls.setProduct('');
  await controls.setMax('2000');
  return verifyExport2(await controls.read());
}

async function readSearchValue(frame, id) {
  const locator = frame.locator(escapeId(id));
  const count = await locator.count();
  if (count === 0) return null;
  if (count !== 1) throw new Error(`SAFE_ABORT_EXPORT2_STATE:control-not-unique:${id}:${count}`);
  return locator.inputValue();
}

async function captureActiveSearchState(frame, options = {}) {
  const detectFn = options.detectFn || detect;
  const readValue = options.readValue || readSearchValue;
  const rows = (await detectFn(frame))
    .filter((row) => normalize(row.key) !== '')
    .sort((left, right) => left.slot - right.slot);
  if (!rows.length) throw new Error('SAFE_ABORT_EXPORT2_STATE:no-active-criteria');
  if (new Set(rows.map((row) => row.slot)).size !== rows.length) {
    throw new Error('SAFE_ABORT_EXPORT2_STATE:duplicate-slot');
  }

  const slots = [];
  for (const row of rows) {
    const base = `C19_W52_V53_V59_btqsrvcfm_PARAMETERS[${row.slot}]`;
    slots.push({
      slot: row.slot,
      key: normalize(row.key),
      value1: await readValue(frame, `${base}.VALUE1`),
      value2: await readValue(frame, `${base}.VALUE2`),
    });
  }
  const max = await readValue(frame, 'C19_W52_V53_V59_btqsrvcfm_max_hits');
  if (max === null) throw new Error('SAFE_ABORT_EXPORT2_STATE:max-control-missing');
  return { max: normalize(max).replace(/\D/g, ''), slots };
}

function canonicalSearchState(state) {
  if (!state || !Array.isArray(state.slots)) throw new Error('SAFE_ABORT_EXPORT2_STATE:snapshot-missing');
  const slots = state.slots.map((slot) => ({
    slot: Number(slot.slot),
    key: normalize(slot.key),
    value1: slot.value1 == null ? null : normalize(slot.value1),
    value2: slot.value2 == null ? null : normalize(slot.value2),
  })).sort((left, right) => left.slot - right.slot);
  if (slots.some((slot) => !Number.isInteger(slot.slot) || !slot.key)) {
    throw new Error('SAFE_ABORT_EXPORT2_STATE:invalid-slot');
  }
  return { max: normalize(state.max).replace(/\D/g, ''), slots };
}

function verifyExport2SearchDelta(export1State, export2State) {
  const before = canonicalSearchState(export1State);
  const after = canonicalSearchState(export2State);
  if (before.max !== '1000') throw new Error('SAFE_ABORT_EXPORT2_STATE:export1-max-not-1000');
  if (after.max !== '2000') throw new Error('SAFE_ABORT_EXPORT2_STATE:export2-max-not-2000');
  let productCount = 0;
  const afterBySlot = new Map(after.slots.map((slot) => [slot.slot, slot]));
  if (afterBySlot.size !== after.slots.length) {
    throw new Error('SAFE_ABORT_EXPORT2_STATE:duplicate-slot');
  }
  for (const previous of before.slots) {
    const current = afterBySlot.get(previous.slot);
    if (!current) {
      if (previous.key === 'PRODUCT_ID' && previous.value1 === '203') {
        productCount += 1;
        continue;
      }
      throw new Error(`SAFE_ABORT_EXPORT2_STATE:slot-missing:${previous.slot}`);
    }
    if (previous.key !== current.key) {
      throw new Error(`SAFE_ABORT_EXPORT2_STATE:slot-definition-changed:${previous.slot}`);
    }
    if (previous.key === 'PRODUCT_ID') {
      productCount += 1;
      if (previous.value1 !== '203' || current.value1 !== '') {
        throw new Error('SAFE_ABORT_EXPORT2_STATE:product-delta-invalid');
      }
      if (previous.value2 !== current.value2) {
        throw new Error('SAFE_ABORT_EXPORT2_STATE:unexpected-criterion-change:PRODUCT_ID');
      }
      continue;
    }
    if (previous.value1 !== current.value1 || previous.value2 !== current.value2) {
      throw new Error(`SAFE_ABORT_EXPORT2_STATE:unexpected-criterion-change:${previous.key}`);
    }
  }
  if (after.slots.some((slot) => !before.slots.some((previous) => previous.slot === slot.slot))) {
    throw new Error('SAFE_ABORT_EXPORT2_STATE:slot-added');
  }
  if (productCount !== 1) throw new Error(`SAFE_ABORT_EXPORT2_STATE:product-slot-not-unique:${productCount}`);
  return after;
}

function movementDateRange(now, timeZone = 'Europe/Istanbul') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const end = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return {
    from: new Date(end - 14 * 86400000).toISOString().slice(0, 10),
    to: new Date(end).toISOString().slice(0, 10),
  };
}

async function resolveExport2Frame(page) {
  const frames = page.frames().filter((frame) => frame.url().includes('crm_ui_frame/BSPWDApplication.do'));
  if (frames.length !== 1) throw new Error(`SAFE_ABORT_EXPORT2:app-frame-not-unique:${frames.length}`);
  return frames[0];
}

async function configureExport2(frame) {
  let rows = await detect(frame);
  let slots;
  try {
    slots = requireUniqueSlots(rows);
  } catch (error) {
    if (!/product-slot/.test(error.message)) throw error;
    const free = rows.find((row) => !['DATE_RANGE', 'PRODUCT_ID'].includes(row.key));
    if (!free) throw error;
    await selectField(frame, free.slot, 'PRODUCT_ID');
    rows = await detect(frame);
    slots = requireUniqueSlots(rows);
  }

  const dateBase = `C19_W52_V53_V59_btqsrvcfm_PARAMETERS[${slots.date}]`;
  const productBase = `C19_W52_V53_V59_btqsrvcfm_PARAMETERS[${slots.product}]`;
  const date = frame.locator(escapeId(`${dateBase}.VALUE1`));
  const product = frame.locator(escapeId(`${productBase}.VALUE1`));
  const max = frame.locator(escapeId('C19_W52_V53_V59_btqsrvcfm_max_hits'));

  return configureExport2WithControls({
    select14Days: async () => {
      const button = frame.locator(escapeId(`${dateBase}.VALUE1-btn`));
      if (await button.count() !== 1) throw new Error('SAFE_ABORT_EXPORT2:date-button-not-unique');
      await button.click();
      const options = frame.locator(`${escapeId(`${dateBase}.VALUE1__items`)} a`);
      const found = [];
      for (let index = 0; index < await options.count(); index += 1) {
        const option = options.nth(index);
        found.push({ text: await option.innerText(), key: await option.getAttribute('key') });
      }
      const selected = pickDateOption(found);
      const choice = frame.locator(`${escapeId(`${dateBase}.VALUE1__items`)} a[key="${selected.key}"]`);
      if (await choice.count() !== 1) throw new Error('SAFE_ABORT_EXPORT2:date-choice-not-unique');
      await choice.click();
      await frame.waitForTimeout(250);
    },
    setProduct: async (value) => { await product.fill(value); await product.press('Tab'); },
    setMax: async (value) => { await max.fill(value); await max.press('Tab'); },
    read: async () => ({ date: await date.inputValue(), product: await product.inputValue(), max: await max.inputValue() }),
  });
}

async function clickSearch(page) {
  const button = await findSearchButton(page);
  const frame = page.frames()[button.frame];
  if (!frame) throw new Error('SAFE_ABORT_EXPORT2:search-frame-missing');
  await frame.locator(button.selector).nth(button.index).click();
}

async function acquireExport2(page, options = {}) {
  const now = options.now ?? Date.now();
  const deps = {
    navigate: navigateToConfirmations,
    resolveFrame: resolveExport2Frame,
    configure: configureExport2,
    capture: captureActiveSearchState,
    clickSearch,
    waitForResults: waitForResultsReady,
    download: exportAndFinalize,
    ...options.deps,
  };

  await deps.navigate(page);
  const frame = await deps.resolveFrame(page);
  const criteria = verifyExport2(await deps.configure(frame));
  const searchState = await deps.capture(frame);
  verifyExport2SearchDelta(options.export1SearchState, searchState);
  await deps.clickSearch(page);
  const results = await deps.waitForResults(page, options.timeout ?? 20000);
  const download = await deps.download(page, results.export, {
    timeout: options.downloadTimeout ?? 10000,
    dir: options.downloadDir,
  });

  return {
    ...download,
    criteria,
    searchState,
    acquiredAt: new Date(now).toISOString(),
    dateRange: movementDateRange(now, options.timeZone),
  };
}

module.exports = {
  acquireExport2,
  captureActiveSearchState,
  canonicalSearchState,
  configureExport2,
  configureExport2WithControls,
  movementDateRange,
  resolveExport2Frame,
  verifyExport2SearchDelta,
  verifyExport2,
};
