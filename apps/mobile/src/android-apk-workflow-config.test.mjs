import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/android-apk.yml'), 'utf8');

test('manual Android test builds can use an explicit API base URL while preserving production default', () => {
  assert.match(workflow, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+api_base_url:/);
  assert.match(workflow, /EXPO_PUBLIC_API_BASE_URL:\s*\$\{\{\s*inputs\.api_base_url\s*\|\|\s*'https:\/\/api\.field-maintenance-prod\.com\/api'\s*\}\}/);
});
