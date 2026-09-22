import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as requestTools from './latest-request.mjs';

const { LatestRequest, RequestActivity } = requestTools;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('a deferred older response cannot commit after a newer request wins', async () => {
  const requests = new LatestRequest();
  const oldResponse = deferred();
  const newResponse = deferred();
  const committed = [];
  const load = async (response) => {
    const epoch = requests.next();
    const value = await response.promise;
    if (requests.isCurrent(epoch)) committed.push(value);
  };

  const oldLoad = load(oldResponse);
  const newLoad = load(newResponse);
  newResponse.resolve('new');
  await newLoad;
  oldResponse.resolve('old');
  await oldLoad;

  assert.deepEqual(committed, ['new']);
});

test('invalidating an in-flight lane clears its activity and a stale finally cannot restore it', async () => {
  const activity = [];
  const lane = new RequestActivity((value) => activity.push(value));
  const response = deferred();
  const load = async () => {
    const epoch = lane.begin();
    await response.promise;
    lane.finish(epoch);
  };

  const pending = load();
  lane.invalidate();
  assert.deepEqual(activity, [true, false], 'invalidation must release the lane immediately');

  response.resolve();
  await pending;
  assert.deepEqual(activity, [true, false], 'the stale finally must not overwrite the reset activity state');
});

test('a replacement request retains lane activity when the invalidated request finally settles', async () => {
  const activity = [];
  const lane = new RequestActivity((value) => activity.push(value));
  const staleResponse = deferred();
  const currentResponse = deferred();
  const load = async (response) => {
    const epoch = lane.begin();
    await response.promise;
    lane.finish(epoch);
  };

  const stale = load(staleResponse);
  const current = load(currentResponse);
  staleResponse.resolve();
  await stale;
  assert.deepEqual(activity, [true, true], 'the stale finally must not clear the current request activity');

  currentResponse.resolve();
  await current;
  assert.deepEqual(activity, [true, true, false]);
});

test('bounded request mapping never exceeds its concurrency limit and preserves order', async () => {
  assert.equal(typeof requestTools.mapWithConcurrency, 'function', 'bounded mapper must be exported');
  let active = 0;
  let maximum = 0;
  const gates = Array.from({ length: 5 }, deferred);
  const pending = requestTools.mapWithConcurrency([0, 1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await gates[value].promise;
    active -= 1;
    return value * 10;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maximum, 2);
  gates[0].resolve();
  gates[1].resolve();
  await new Promise((resolve) => setImmediate(resolve));
  gates[2].resolve();
  gates[3].resolve();
  await new Promise((resolve) => setImmediate(resolve));
  gates[4].resolve();

  assert.deepEqual(await pending, [0, 10, 20, 30, 40]);
  assert.equal(maximum, 2);
});
