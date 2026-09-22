export class LatestRequest {
  #epoch = 0;

  next() {
    this.#epoch += 1;
    return this.#epoch;
  }

  isCurrent(epoch) {
    return epoch === this.#epoch;
  }
}

export async function mapWithConcurrency(items, limit, mapper) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer');
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export class RequestActivity {
  #requests = new LatestRequest();
  #setActive;

  constructor(setActive) {
    this.#setActive = setActive;
  }

  begin() {
    const epoch = this.#requests.next();
    this.#setActive(true);
    return epoch;
  }

  invalidate() {
    this.#requests.next();
    this.#setActive(false);
  }

  isCurrent(epoch) {
    return this.#requests.isCurrent(epoch);
  }

  finish(epoch) {
    if (!this.isCurrent(epoch)) return false;
    this.#setActive(false);
    return true;
  }
}
