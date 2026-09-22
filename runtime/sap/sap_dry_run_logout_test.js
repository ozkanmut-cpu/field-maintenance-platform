const test = require('node:test');
const assert = require('node:assert/strict');
const { firefox } = require('/tmp/pw-firefox-test/node_modules/playwright');
const { guardedLogout } = require('./sap_logout_gate');
const { RunState } = require('./sap_run_state');

function dryRunComplete() {
  const run = new RunState();
  for (const state of ['AUTHENTICATED', 'CRM_VERIFIED', 'SEARCH_VERIFIED', 'EXPORTED', 'CSV_VALIDATED', 'DRY_RUN_COMPLETE']) run.advance(state);
  return run;
}

test('guarded logout accepts a completed dry run without claiming DB_SYNCED', async () => {
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<title>SAP CRM</title><button onclick=\"document.title='Oturum açma'\">Oturumu kapat</button>");
    const run = dryRunComplete();
    const result = await guardedLogout(page, run, { downloadValidated: true, dryRunComplete: true });
    assert.equal(result.loggedOut, true);
    assert.equal(result.state, 'LOGGED_OUT');
    assert.deepEqual(run.history, ['INIT', 'AUTHENTICATED', 'CRM_VERIFIED', 'SEARCH_VERIFIED', 'EXPORTED', 'CSV_VALIDATED', 'DRY_RUN_COMPLETE', 'LOGGED_OUT']);
  } finally {
    await browser.close();
  }
});
