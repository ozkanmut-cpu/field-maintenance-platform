const test = require('node:test');
const assert = require('node:assert/strict');

const {
  acquireExport2,
  captureActiveSearchState,
  configureExport2WithControls,
  verifyExport2,
  verifyExport2SearchDelta,
} = require('./export2_search_verify');

function export1State() {
  return {
    max: '1000',
    slots: [
      { slot: 1, key: 'DATE_RANGE', value1: '<- 14 gün ->', value2: null },
      { slot: 2, key: 'PRODUCT_ID', value1: '203', value2: null },
      { slot: 3, key: 'REGION', value1: 'İzmir', value2: '' },
      { slot: 4, key: 'STATUS', value1: 'Aktif', value2: null },
    ],
  };
}

function export2State() {
  return {
    max: '2.000',
    slots: export1State().slots.map((slot) => (
      slot.key === 'PRODUCT_ID' ? { ...slot, value1: '' } : { ...slot }
    )),
  };
}

test('Export 2 requires a blank product and max 2000', () => {
  assert.throws(
    () => verifyExport2({ date: '<- 14 gün ->', product: '203', max: '2000' }),
    /product-must-be-blank/,
  );

  assert.deepEqual(
    verifyExport2({ date: '<- 14 gün ->', product: '', max: '2.000' }),
    { date: '<- 14 gün ->', product: '', max: '2000' },
  );
});

test('Export 2 rejects a non-14-day range or another maximum', () => {
  assert.throws(
    () => verifyExport2({ date: 'Bugün', product: '', max: '2000' }),
    /date-not-14-days/,
  );
  assert.throws(
    () => verifyExport2({ date: '<- 14 gün ->', product: '', max: '1000' }),
    /max-not-2000/,
  );
});

test('Export 2 applies only blank product and max 2000 over the shared 14-day search', async () => {
  const written = [];
  const values = { date: '', product: '203', max: '1000' };
  const result = await configureExport2WithControls({
    select14Days: async () => { values.date = '<- 14 gün ->'; written.push(['date', '14-days']); },
    setProduct: async (value) => { values.product = value; written.push(['product', value]); },
    setMax: async (value) => { values.max = value; written.push(['max', value]); },
    read: async () => ({ ...values }),
  });

  assert.deepEqual(written, [['date', '14-days'], ['product', ''], ['max', '2000']]);
  assert.deepEqual(result, { date: '<- 14 gün ->', product: '', max: '2000' });
});

test('active search snapshot captures every slot key and both range values', async () => {
  const values = new Map([
    ['C19_W52_V53_V59_btqsrvcfm_PARAMETERS[1].VALUE1', '<- 14 gün ->'],
    ['C19_W52_V53_V59_btqsrvcfm_PARAMETERS[1].VALUE2', ''],
    ['C19_W52_V53_V59_btqsrvcfm_PARAMETERS[2].VALUE1', '203'],
    ['C19_W52_V53_V59_btqsrvcfm_PARAMETERS[2].VALUE2', null],
    ['C19_W52_V53_V59_btqsrvcfm_max_hits', '1.000'],
  ]);
  const state = await captureActiveSearchState({}, {
    detectFn: async () => [{ slot: 2, key: 'PRODUCT_ID' }, { slot: 1, key: 'DATE_RANGE' }],
    readValue: async (_frame, id) => values.get(id),
  });

  assert.deepEqual(state, {
    max: '1000',
    slots: [
      { slot: 1, key: 'DATE_RANGE', value1: '<- 14 gün ->', value2: '' },
      { slot: 2, key: 'PRODUCT_ID', value1: '203', value2: null },
    ],
  });
});

test('Export 2 retains every active Export 1 criterion except product and maximum', () => {
  assert.deepEqual(verifyExport2SearchDelta(export1State(), export2State()), {
    max: '2000',
    slots: [
      { slot: 1, key: 'DATE_RANGE', value1: '<- 14 gün ->', value2: null },
      { slot: 2, key: 'PRODUCT_ID', value1: '', value2: null },
      { slot: 3, key: 'REGION', value1: 'İzmir', value2: '' },
      { slot: 4, key: 'STATUS', value1: 'Aktif', value2: null },
    ],
  });
});

test('Export 2 permits only the cleared product slot to disappear from the live search form', () => {
  const after = export2State();
  after.slots = after.slots.filter((slot) => slot.key !== 'PRODUCT_ID');

  assert.deepEqual(verifyExport2SearchDelta(export1State(), after), {
    max: '2000',
    slots: [
      { slot: 1, key: 'DATE_RANGE', value1: '<- 14 gün ->', value2: null },
      { slot: 3, key: 'REGION', value1: 'İzmir', value2: '' },
      { slot: 4, key: 'STATUS', value1: 'Aktif', value2: null },
    ],
  });
});

test('Export 2 permits SAP to replace the cleared product row with a blank product slot', () => {
  const after = export2State();
  after.slots = after.slots
    .filter((slot) => slot.key !== 'PRODUCT_ID')
    .concat({ slot: 5, key: 'PRODUCT_ID', value1: '', value2: null });

  assert.deepEqual(verifyExport2SearchDelta(export1State(), after), {
    max: '2000',
    slots: [
      { slot: 1, key: 'DATE_RANGE', value1: '<- 14 gün ->', value2: null },
      { slot: 3, key: 'REGION', value1: 'İzmir', value2: '' },
      { slot: 4, key: 'STATUS', value1: 'Aktif', value2: null },
      { slot: 5, key: 'PRODUCT_ID', value1: '', value2: null },
    ],
  });
});

test('Export 2 rejects an added non-product criterion even when its values are blank', () => {
  const after = export2State();
  after.slots.push({ slot: 5, key: 'PLANT', value1: '', value2: null });

  assert.throws(
    () => verifyExport2SearchDelta(export1State(), after),
    /slot-added/,
  );
});

test('Export 2 records only structural evidence when a blank non-product criterion is added', () => {
  const after = export2State();
  after.slots.push({ slot: 5, key: 'PLANT', value1: '', value2: null });

  assert.throws(
    () => verifyExport2SearchDelta(export1State(), after),
    (error) => {
      assert.match(error.message, /slot-added/);
      assert.deepEqual(error.diagnostic, {
        reason: 'slot-added',
        addedSlots: [{ slot: 5, key: 'PLANT', value1State: 'empty', value2State: 'control-missing' }],
      });
      return true;
    },
  );
});

test('Export 2 permits exactly one empty BU_PARTNER slot added by SAP', () => {
  const after = export2State();
  after.slots.push({ slot: 7, key: 'BU_PARTNER', value1: '', value2: '' });

  assert.deepEqual(verifyExport2SearchDelta(export1State(), after), {
    max: '2000',
    slots: [...export2State().slots, { slot: 7, key: 'BU_PARTNER', value1: '', value2: '' }],
  });
});

test('Export 2 rejects duplicate blank product replacement slots', () => {
  const after = export2State();
  after.slots = after.slots
    .filter((slot) => slot.key !== 'PRODUCT_ID')
    .concat(
      { slot: 5, key: 'PRODUCT_ID', value1: '', value2: null },
      { slot: 6, key: 'PRODUCT_ID', value1: '', value2: null },
    );

  assert.throws(
    () => verifyExport2SearchDelta(export1State(), after),
    /product-slot-not-unique:2/,
  );
});

test('Export 2 fails closed when any non-product criterion changes', () => {
  const changed = export2State();
  changed.slots.find((slot) => slot.key === 'REGION').value1 = 'Aydın';

  assert.throws(
    () => verifyExport2SearchDelta(export1State(), changed),
    /unexpected-criterion-change:REGION/,
  );
});

test('Export 2 acquisition reopens normal search, verifies criteria and finalizes into its isolated download directory', async () => {
  const calls = [];
  const page = {};
  const result = await acquireExport2(page, {
    now: Date.UTC(2026, 8, 20, 12),
    downloadDir: '/runtime/downloads/export2',
    export1SearchState: export1State(),
    deps: {
      navigate: async (received) => { assert.equal(received, page); calls.push('navigate'); },
      resolveFrame: async () => { calls.push('frame'); return { id: 'frame' }; },
      configure: async () => { calls.push('configure'); return { date: '<- 14 gün ->', product: '', max: '2000' }; },
      capture: async () => { calls.push('capture'); return export2State(); },
      clickSearch: async () => { calls.push('search'); },
      waitForResults: async () => { calls.push('results'); return { export: { frame: 1, index: 0 } }; },
      download: async (_page, _meta, options) => {
        calls.push('download');
        assert.equal(options.dir, '/runtime/downloads/export2');
        return { file: '/runtime/downloads/export2/export.csv', downloadValidated: true };
      },
    },
  });

  assert.deepEqual(calls, ['navigate', 'frame', 'configure', 'capture', 'search', 'results', 'download']);
  assert.deepEqual(result.dateRange, { from: '2026-09-06', to: '2026-09-20' });
  assert.equal(result.acquiredAt, '2026-09-20T12:00:00.000Z');
  assert.equal(result.file, '/runtime/downloads/export2/export.csv');
});
