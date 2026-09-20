const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE_SLUGS = Object.freeze({
  EXPORT_1: 'export-1',
  EXPORT_2: 'export-2',
  COOLER_MOVEMENT: 'cooler-movement',
});

function safeRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) === path.parse(root).root) {
    throw new Error('SAFE_ABORT_SOURCE_STORE:unsafe-root');
  }
  const resolved = path.resolve(root);
  const parent = path.dirname(resolved);
  let realParent;
  try { realParent = fs.realpathSync.native(parent); } catch { throw new Error('SAFE_ABORT_SOURCE_STORE:unsafe-root'); }
  const canonical = path.join(realParent, path.basename(resolved));
  if (canonical === path.parse(canonical).root) throw new Error('SAFE_ABORT_SOURCE_STORE:unsafe-root');
  try {
    if (fs.lstatSync(resolved).isSymbolicLink()) throw new Error('SAFE_ABORT_SOURCE_STORE:unsafe-root');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return canonical;
}

function within(root, file) {
  const relative = path.relative(root, file);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('SAFE_ABORT_SOURCE_STORE:path-escapes-root');
  }
  return file;
}

function lstatDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('SAFE_ABORT_SOURCE_STORE:unsafe-directory');
  }
  return stat;
}

function ensureStoreRoot(root) {
  const parent = path.dirname(root);
  const realParent = fs.realpathSync.native(parent);
  if (realParent !== parent) throw new Error('SAFE_ABORT_SOURCE_STORE:unsafe-root');
  try { lstatDirectory(root); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    fs.mkdirSync(root, { mode: 0o700 });
    lstatDirectory(root);
  }
  const realRoot = fs.realpathSync.native(root);
  if (realRoot !== root) throw new Error('SAFE_ABORT_SOURCE_STORE:unsafe-root');
  return realRoot;
}

function safeMkdir(root, directory) {
  within(root, directory);
  lstatDirectory(root);
  let current = root;
  const relative = path.relative(root, directory);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { lstatDirectory(current); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fs.mkdirSync(current, { mode: 0o700 });
      lstatDirectory(current);
    }
    if (fs.realpathSync.native(current) !== current) {
      throw new Error('SAFE_ABORT_SOURCE_STORE:path-escapes-root');
    }
  }
  return directory;
}

function safeArtifactPath(root, file) {
  within(root, file);
  safeMkdir(root, path.dirname(file));
  return file;
}

function removeArtifact(root, file) {
  within(root, file);
  safeMkdir(root, path.dirname(file));
  try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function pruneEmptyDirectories(root, directory) {
  let current = directory;
  while (current !== root) {
    safeMkdir(root, current);
    try { fs.rmdirSync(current); } catch (error) {
      if (error.code === 'ENOTEMPTY' || error.code === 'ENOENT') return;
      throw error;
    }
    current = path.dirname(current);
  }
}

function requireSource(source) {
  if (!Object.hasOwn(SOURCE_SLUGS, source)) throw new Error('SAFE_ABORT_SOURCE_STORE:unknown-source');
  return SOURCE_SLUGS[source];
}

function isoTimestamp(value) {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error('SAFE_ABORT_SOURCE_STORE:invalid-acquired-at');
  return timestamp.toISOString();
}

function sourceBytes(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('SAFE_ABORT_SOURCE_STORE:source-not-regular-file');
  return fs.readFileSync(file);
}

function validateReceiptInput(validation) {
  if (!validation || !Number.isInteger(validation.rowCount) || validation.rowCount < 1) {
    throw new Error('SAFE_ABORT_SOURCE_STORE:validation-not-receiptable');
  }
  const records = validation.normalized ?? validation.records;
  if (!Array.isArray(records)) throw new Error('SAFE_ABORT_SOURCE_STORE:normalized-records-missing');
  return records;
}

function createSourceStore({ root, now = () => new Date(), audit = () => {} }) {
  const storeRoot = safeRoot(root);

  function recordValidated({ source, file, validation, acquiredAt = now() }) {
    const root = ensureStoreRoot(storeRoot);
    const slug = requireSource(source);
    const records = validateReceiptInput(validation);
    const bytes = sourceBytes(file);
    const timestamp = isoTimestamp(acquiredAt);
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    const id = `${timestamp.replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
    const sourceRoot = path.join(root, slug);
    const raw = safeArtifactPath(root, path.join(sourceRoot, 'raw', `${id}.csv`));
    const normalized = safeArtifactPath(root, path.join(sourceRoot, 'normalized', `${id}.json`));
    const receiptFile = safeArtifactPath(root, path.join(sourceRoot, 'receipts', `${id}.json`));
    const auditFile = safeArtifactPath(root, path.join(root, 'audit', `${id}.json`));
    const metadata = {
      schemaVersion: 1,
      source,
      acquiredAt: timestamp,
      checksum,
      rowCount: validation.rowCount,
    };
    const document = { ...metadata, records };
    const receipt = {
      ...metadata,
      metadata,
      validated: true,
      raw: { file: raw, size: bytes.length },
      normalized: { file: normalized },
      receipt: { file: receiptFile },
      audit: { recorded: true, file: auditFile },
    };

    try {
      fs.writeFileSync(raw, bytes, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(normalized, `${JSON.stringify(document)}\n`, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(receiptFile, `${JSON.stringify(receipt)}\n`, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(auditFile, `${JSON.stringify({ event: 'SAP_SOURCE_RECEIPTED', source, receipt })}\n`, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      for (const artifact of [auditFile, receiptFile, normalized, raw]) {
        removeArtifact(root, artifact);
        pruneEmptyDirectories(root, path.dirname(artifact));
      }
      throw error;
    }
    return receipt;
  }

  function rollbackReceipt(receipt) {
    const root = ensureStoreRoot(storeRoot);
    for (const artifact of [receipt?.audit?.file, receipt?.receipt?.file, receipt?.normalized?.file, receipt?.raw?.file]) {
      if (!artifact) continue;
      removeArtifact(root, artifact);
      pruneEmptyDirectories(root, path.dirname(artifact));
    }
  }

  return { root: storeRoot, recordValidated, rollbackReceipt, audit };
}

async function runStep({ source, acquire, validate, store }) {
  let receipt;
  try {
    const acquisition = await acquire();
    if (!acquisition?.file) throw new Error('SAFE_ABORT_CHAIN:acquisition-file-missing');
    const validation = await validate(acquisition);
    receipt = store.recordValidated({ source, file: acquisition.file, validation });
    await store.audit({ event: 'SAP_SOURCE_RECEIPTED', source, receipt });
    return receipt;
  } catch (error) {
    if (receipt) store.rollbackReceipt(receipt);
    if (String(error.message).startsWith('SAFE_ABORT_CHAIN:')) throw error;
    throw new Error(`SAFE_ABORT_CHAIN:${source}:${error.message}`);
  }
}

async function runFullChain({
  store,
  acquireExport1,
  validateExport1,
  acquireExport2,
  validateExport2,
  acquireCoolerMovement,
  validateCoolerMovement,
}) {
  if (!store || typeof store.recordValidated !== 'function' || typeof store.rollbackReceipt !== 'function' || typeof store.audit !== 'function') {
    throw new Error('SAFE_ABORT_CHAIN:source-store-missing');
  }
  const receipts = [];
  receipts.push(await runStep({ source: 'EXPORT_1', acquire: acquireExport1, validate: validateExport1, store }));
  receipts.push(await runStep({ source: 'EXPORT_2', acquire: acquireExport2, validate: validateExport2, store }));
  receipts.push(await runStep({ source: 'COOLER_MOVEMENT', acquire: acquireCoolerMovement, validate: validateCoolerMovement, store }));
  return { ok: true, receipts };
}

module.exports = { SOURCE_SLUGS, createSourceStore, ensureStoreRoot, runFullChain, runStep, safeMkdir, safeRoot, within };
