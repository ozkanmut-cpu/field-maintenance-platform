const { spawnSync } = require('node:child_process');

const { acquireCoolerMovement } = require('./cooler_movement_search_verify');
const { persistCoolerMovement } = require('./cooler_movement_normalize');
const { acquireExport2, captureActiveSearchState } = require('./export2_search_verify');
const { persistExport2 } = require('./export2_normalize');
const { waitForCrm } = require('./sap_authenticated_flow');
const { validateData } = require('./sap_csv_safety');
const { validateCsvFile } = require('./sap_csv_validator');
const { exportAndFinalize } = require('./sap_export_download_orchestrator');
const { guardedLogout } = require('./sap_logout_gate');
const { submitLogin } = require('./sap_login_dom');
const { navigateToConfirmations } = require('./sap_navigation_executor');
const { configure } = require('./sap_real_search_live');
const { waitForResultsReady } = require('./sap_results_contract');
const { RunState } = require('./sap_run_state');
const { findSearchButton } = require('./sap_search_execute_guard');
const { buildDbArgs, buildImportEvidence } = require('./sap_import_metadata');

const RUNTIME_DIR = '/opt/field-maintenance/sap-runtime';

function allowLiveDbApply(env = process.env) {
  return env.SAP_ALLOW_LIVE_DB_APPLY === '1';
}

function requireCredentialEnv(env = process.env) {
  const username = env.SAP_USERNAME;
  const password = env.SAP_PASSWORD;
  if (!username || !password) throw new Error('SAFE_ABORT_LOGIN:credentials-missing');
  return { username, password };
}

function runDb(file, dryRun = false, evidence) {
  const result = spawnSync(`${RUNTIME_DIR}/sync_teyit_db.js`, buildDbArgs(file, dryRun, evidence), { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`SAFE_ABORT_DB:${(result.stderr || result.stdout || 'failed').trim()}`);
  }
  return JSON.parse((result.stdout || '').trim());
}

function requireExport1Validated(result) {
  if (!result?.file || result.downloadValidated !== true || result.csvValidated !== true) {
    throw new Error('SAFE_ABORT_CHAIN:export1-not-validated');
  }
  return result;
}

function requireStoredSource(result, source) {
  if (
    result?.source !== source
    || !/^[a-f0-9]{64}$/i.test(result?.checksum || '')
    || !Number.isInteger(result?.rowCount)
    || result.rowCount < 1
    || !result?.raw?.file
    || !result?.normalized?.file
  ) {
    throw new Error(`SAFE_ABORT_CHAIN:secondary-source-not-persisted:${source}`);
  }
  return result;
}

async function runSapChain(adapters) {
  const export1 = requireExport1Validated(await adapters.acquireExport1());
  const export2Download = await adapters.acquireExport2(export1);
  const export2 = requireStoredSource(await adapters.persistExport2(export2Download), 'SAP_EXPORT_2');
  const movementDownload = await adapters.acquireCoolerMovement(export2);
  const coolerMovement = requireStoredSource(
    await adapters.persistCoolerMovement(movementDownload),
    'SAP_COOLER_MOVEMENT',
  );
  const businessSync = await adapters.syncExport1(export1);
  return { export1, export2, coolerMovement, businessSync };
}

async function clickSearch(page) {
  const button = await findSearchButton(page);
  const frame = page.frames()[button.frame];
  if (!frame) throw new Error('SAFE_ABORT_SEARCH:search-frame-missing');
  await frame.locator(button.selector).nth(button.index).click();
}

async function resolveConfirmationFrame(page) {
  const frames = page.frames().filter((frame) => frame.url().includes('crm_ui_frame/BSPWDApplication.do'));
  if (frames.length !== 1) throw new Error(`SAFE_ABORT_SEARCH:app-frame-not-unique:${frames.length}`);
  return frames[0];
}

async function acquireExport1(page, run, options = {}) {
  const deps = {
    navigate: async (targetPage) => {
      await navigateToConfirmations(targetPage);
      await targetPage.waitForTimeout(800);
    },
    resolveFrame: resolveConfirmationFrame,
    configure,
    capture: captureActiveSearchState,
    clickSearch,
    waitForResults: waitForResultsReady,
    download: exportAndFinalize,
    validateCsv: validateCsvFile,
    validateRows: validateData,
    ...options.deps,
  };

  await deps.navigate(page);
  const frame = await deps.resolveFrame(page);
  const criteria = await deps.configure(frame);
  const searchState = await deps.capture(frame);
  const importEvidence = buildImportEvidence(new Date(options.now ?? Date.now()));
  await deps.clickSearch(page);
  run.advance('SEARCH_VERIFIED');
  const results = await deps.waitForResults(page, options.timeout ?? 20000);
  const download = await deps.download(page, results.export, {
    timeout: options.downloadTimeout ?? 10000,
    dir: options.downloadDir || `${RUNTIME_DIR}/downloads/export1`,
  });
  run.advance('EXPORTED');
  const csv = deps.validateCsv(download.file);
  const data = deps.validateRows(csv.rows);
  run.advance('CSV_VALIDATED');
  return {
    ...download,
    criteria,
    importEvidence,
    searchState,
    csv,
    data,
    downloadValidated: download.downloadValidated === true,
    csvValidated: true,
  };
}

async function syncExport1Result(export1, run, options = {}) {
  const runDbFn = options.runDbFn || runDb;
  const shadow = runDbFn(export1.file, true, export1.importEvidence);
  if (shadow.blockedDeletes > 0) throw new Error('SAFE_ABORT_DB:blocked-deletes');
  if (options.allowLiveApply !== true) {
    run.advance('DRY_RUN_COMPLETE');
    return { shadow, dryRunComplete: true };
  }
  const db = runDbFn(export1.file, false, export1.importEvidence);
  if (!db.ok) throw new Error('SAFE_ABORT_DB:not-ok');
  run.advance('DB_SYNCED');
  return { shadow, db };
}

async function executeProductionChain(page, run, options = {}) {
  const clock = options.clock || Date.now;
  const storeDir = options.storeDir || `${RUNTIME_DIR}/secondary-sources`;
  const allowLiveApply = allowLiveDbApply(options.env);
  return runSapChain({
    acquireExport1: () => acquireExport1(page, run),
    acquireExport2: (export1) => acquireExport2(page, {
      now: clock(),
      downloadDir: `${RUNTIME_DIR}/downloads/export2`,
      export1SearchState: export1.searchState,
    }),
    persistExport2: (download) => persistExport2({ ...download, storeDir }),
    acquireCoolerMovement: () => acquireCoolerMovement(page, {
      now: clock(),
      downloadDir: `${RUNTIME_DIR}/downloads/cooler-movement`,
    }),
    persistCoolerMovement: (download) => persistCoolerMovement({ ...download, storeDir }),
    syncExport1: (export1) => syncExport1Result(export1, run, { allowLiveApply }),
  });
}

async function main() {
  const { firefox } = require('/tmp/pw-firefox-test/node_modules/playwright');
  const credentials = requireCredentialEnv();
  const run = new RunState();
  const context = await firefox.launchPersistentContext('/tmp/sap-playwright-automation', {
    headless: true,
    acceptDownloads: true,
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://demirbas.efespilsen.com.tr/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => document.title.trim().length > 0, null, { timeout: 10000 });
    await submitLogin(page, credentials.username, credentials.password);
    await waitForCrm(page, 20000);
    run.advance('AUTHENTICATED');
    run.advance('CRM_VERIFIED');

    const result = await executeProductionChain(page, run);
    const db = result.businessSync.db;
    const logout = await guardedLogout(page, run, {
      downloadValidated: true,
      dbSyncSucceeded: db?.ok === true,
      dryRunComplete: result.businessSync.dryRunComplete === true,
    });
    console.log(JSON.stringify({
      ok: true,
      state: run.state,
      rows: result.export1.csv.rowCount,
      data: { oldest: result.export1.data.oldest, newest: result.export1.data.newest },
      db: db
        ? { mode: 'live', inserted: db.inserted, updated: db.updated, unchanged: db.unchanged, deleted: db.deleted }
        : { mode: 'dry-run', blockedDeletes: result.businessSync.shadow.blockedDeletes },
      secondary: {
        export2: {
          acquiredAt: result.export2.acquiredAt,
          checksum: result.export2.checksum,
          rows: result.export2.rowCount,
        },
        coolerMovement: {
          acquiredAt: result.coolerMovement.acquiredAt,
          checksum: result.coolerMovement.checksum,
          rows: result.coolerMovement.rowCount,
        },
      },
      logout: logout.loggedOut,
    }));
  } finally {
    await context.close();
  }
}

module.exports = {
  allowLiveDbApply,
  acquireExport1,
  buildDbArgs,
  executeProductionChain,
  main,
  requireCredentialEnv,
  requireExport1Validated,
  requireStoredSource,
  resolveConfirmationFrame,
  runDb,
  runSapChain,
  syncExport1Result,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }));
    process.exit(1);
  });
}
