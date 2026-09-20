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
