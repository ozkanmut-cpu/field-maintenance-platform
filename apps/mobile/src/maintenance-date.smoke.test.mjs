import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

test('maintenance completion exposes an explicit performed date and optional GPS payload', () => {
  assert.match(api, /performedAt\?:\s*string/);
  assert.match(api, /latitude\?:\s*number/);
  assert.match(api, /locationCapturedAt\?:\s*string/);
});

test('equipment confirmation uses an Android-safe calendar and requires a late reason', () => {
  assert.match(app, /MaintenanceDatePicker/);
  assert.match(app, /<Modal[^>]+visible=\{open\}/);
  assert.match(app, /onRequestClose=\{closeCalendar\}/);
  assert.match(app, /edges=\{\['bottom'\]\}/);
  assert.match(app, /disabled=\{day\.disabled\}/);
  assert.match(app, /Geriye dönük bakım nedeni/);
  assert.match(app, /selectedDateKey/);
});

test('past-dated mobile completion bypasses every GPS and presence path', () => {
  const pastSave = app.slice(app.indexOf('async function savePastCompletedTask'), app.indexOf('async function completeTask'));
  assert.match(app, /if \(isPastMaintenanceDate\(selectedDateKey\)\)/);
  assert.doesNotMatch(pastSave, /Location\.|currentLocation|locationPresenceConfirmed|latitude|longitude|accuracyMeters/);
  assert.match(pastSave, /setSuccessPastDated\(true\)/);
});

test('past post-save refresh is location-free while today refresh keeps location enabled', () => {
  const loadTasks = app.slice(app.indexOf('async function loadTasks'), app.indexOf('async function refreshDeviceLocation'));
  const todaySave = app.slice(app.indexOf('async function saveCompletedTask'), app.indexOf('async function savePastCompletedTask'));
  const pastSave = app.slice(app.indexOf('async function savePastCompletedTask'), app.indexOf('async function completeTask'));

  assert.match(loadTasks, /async function loadTasks\(refreshLocation = true\)/);
  assert.match(loadTasks, /if \(refreshLocation\) void refreshDeviceLocation\(\)/);
  assert.match(todaySave, /await loadTasks\(\)/);
  assert.match(pastSave, /await loadTasks\(false\)/);
  assert.doesNotMatch(pastSave, /refreshDeviceLocation|Location\.|currentLocation/);
});
