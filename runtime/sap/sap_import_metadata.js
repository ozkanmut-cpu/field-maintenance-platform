const istanbulDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateKey(date) {
  const parts = Object.fromEntries(
    istanbulDate.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function buildImportEvidence(acquiredAt = new Date()) {
  if (!(acquiredAt instanceof Date) || Number.isNaN(acquiredAt.getTime())) {
    throw new Error('SAP export acquisition time is invalid');
  }
  const windowEnd = new Date(`${dateKey(acquiredAt)}T00:00:00.000Z`);
  const windowStart = new Date(windowEnd);
  windowStart.setUTCDate(windowStart.getUTCDate() - 14);
  return {
    acquiredAt: acquiredAt.toISOString(),
    windowStart: windowStart.toISOString().slice(0, 10),
    windowEnd: windowEnd.toISOString().slice(0, 10),
  };
}

function buildDbArgs(file, dryRun, evidence) {
  if (!evidence?.acquiredAt) throw new Error('SAP export acquisition time is required');
  if (!evidence.windowStart || !evidence.windowEnd) throw new Error('SAP export window is required');
  return [
    ...(dryRun ? ['--dry-run'] : []),
    '--acquired-at', evidence.acquiredAt,
    '--window-start', evidence.windowStart,
    '--window-end', evidence.windowEnd,
    file,
  ];
}

function dateOnly(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error(`SAP export ${label} is invalid`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`SAP export ${label} is invalid`);
  }
  return parsed;
}

function parseSyncArgs(args) {
  let dryRun = false;
  let acquiredValue;
  let windowStartValue;
  let windowEndValue;
  let file;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (['--acquired-at', '--window-start', '--window-end'].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`SAP sync option ${arg} requires a value`);
      if (arg === '--acquired-at') acquiredValue = value;
      if (arg === '--window-start') windowStartValue = value;
      if (arg === '--window-end') windowEndValue = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown SAP sync option: ${arg}`);
    if (file) throw new Error('Only one CSV file argument is allowed');
    file = arg;
  }
  if (!acquiredValue) throw new Error('SAP export acquisition time is required');
  const acquiredAt = new Date(acquiredValue);
  if (Number.isNaN(acquiredAt.getTime())) throw new Error('SAP export acquisition time is invalid');
  const windowStart = dateOnly(windowStartValue, 'window start');
  const windowEnd = dateOnly(windowEndValue, 'window end');
  if (windowStart > windowEnd) throw new Error('SAP export window is invalid');
  const expected = buildImportEvidence(acquiredAt);
  if (windowStartValue !== expected.windowStart || windowEndValue !== expected.windowEnd) {
    throw new Error('SAP export window does not match acquisition time');
  }
  if (!file) throw new Error('CSV file argument missing');
  return { dryRun, file, acquiredAt, windowStart, windowEnd };
}

module.exports = { buildDbArgs, buildImportEvidence, parseSyncArgs };
