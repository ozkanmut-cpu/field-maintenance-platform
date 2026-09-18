import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

test('nearby API exposes typed results and explicit HTTP errors', () => {
  assert.match(api, /export class ApiError extends Error/);
  assert.match(api, /export type NearbyPoint =/);
  assert.match(api, /export type NearbyPointsResult =/);
  assert.match(api, /export async function jsonRequest/);
});

test('nearby screen handles location states and renders server distance', () => {
  assert.match(app, /'NEARBY'/);
  assert.match(app, /Yakınımdakiler/);
  assert.match(app, /Konum izni gerekli/);
  assert.match(app, /Telefonun konum servisini açmalısın/);
  assert.match(app, /Yakınında atanmış aktif nokta yok/);
  assert.match(app, /distanceMeters/);
});
