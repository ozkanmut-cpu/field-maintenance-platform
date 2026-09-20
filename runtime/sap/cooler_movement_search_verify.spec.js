const test = require('node:test');
const assert = require('node:assert/strict');

const { acquireCoolerMovement, configureMovementWithControls, verifyMovement } = require('./cooler_movement_search_verify');

const now = Date.UTC(2026, 8, 20, 12);

test('Cooler Movement Report requires a 14-day range, dealer 5000013 and max 5000', () => {
  assert.throws(
    () => verifyMovement({ startDate: '06.09.2026', endDate: '20.09.2026', dealer: 'x', max: '5000' }, { now }),
    /dealer-not-5000013/,
  );

  assert.deepEqual(
    verifyMovement(
      { startDate: '06.09.2026', endDate: '20.09.2026', dealer: '5000013', max: '5.000' },
      { now },
    ),
    { startDate: '06.09.2026', endDate: '20.09.2026', dealer: '5000013', max: '5000' },
  );
});

test('Cooler Movement Report rejects an incorrect range or maximum', () => {
  assert.throws(
    () => verifyMovement({ startDate: '07.09.2026', endDate: '20.09.2026', dealer: '5000013', max: '5000' }, { now }),
    /start-date-not-today-minus-14/,
  );
  assert.throws(
    () => verifyMovement({ startDate: '06.09.2026', endDate: '19.09.2026', dealer: '5000013', max: '5000' }, { now }),
    /end-date-not-today/,
  );
  assert.throws(
    () => verifyMovement({ startDate: '06.09.2026', endDate: '20.09.2026', dealer: '5000013', max: '2000' }, { now }),
    /max-not-5000/,
  );
});

test('Cooler Movement applies exact dated filters before reading them back', async () => {
  const values = {};
  const writes = [];
  const result = await configureMovementWithControls({
    set: async (name, value) => { values[name] = value; writes.push([name, value]); },
    read: async () => ({ ...values }),
  }, { now });

  assert.deepEqual(writes, [
    ['startDate', '06.09.2026'],
    ['endDate', '20.09.2026'],
    ['dealer', '5000013'],
    ['max', '5000'],
  ]);
  assert.deepEqual(result, {
    startDate: '06.09.2026',
    endDate: '20.09.2026',
    dealer: '5000013',
    max: '5000',
  });
});

test('Cooler Movement acquisition navigates only after Export 2 and finalizes into its isolated directory', async () => {
  const calls = [];
  const page = {};
  const result = await acquireCoolerMovement(page, {
    now,
    downloadDir: '/runtime/downloads/cooler-movement',
    deps: {
      navigate: async (received) => { assert.equal(received, page); calls.push('navigate'); },
      configure: async () => {
        calls.push('configure');
        return { startDate: '06.09.2026', endDate: '20.09.2026', dealer: '5000013', max: '5000' };
      },
      clickSearch: async () => { calls.push('search'); },
      waitForResults: async () => { calls.push('results'); return { export: { frame: 2, index: 1 } }; },
      download: async (_page, _meta, options) => {
        calls.push('download');
        assert.equal(options.dir, '/runtime/downloads/cooler-movement');
        return { file: '/runtime/downloads/cooler-movement/movement.csv', downloadValidated: true };
      },
    },
  });

  assert.deepEqual(calls, ['navigate', 'configure', 'search', 'results', 'download']);
  assert.deepEqual(result.dateRange, { from: '2026-09-06', to: '2026-09-20' });
  assert.equal(result.acquiredAt, '2026-09-20T12:00:00.000Z');
});
