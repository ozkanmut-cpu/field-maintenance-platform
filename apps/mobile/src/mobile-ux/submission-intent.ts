export class SubmissionIntentStore<Intent, Payload extends object> {
  private snapshot: { signature: string; payload: Readonly<Payload> } | null = null;

  retryPayload(intent: Intent): Readonly<Payload> | null {
    if (!this.snapshot) return null;
    if (this.snapshot.signature !== JSON.stringify(intent)) {
      this.snapshot = null;
      return null;
    }
    return this.snapshot.payload;
  }

  remember(intent: Intent, payload: Payload): Readonly<Payload> {
    const frozenPayload = Object.freeze({ ...payload }) as Readonly<Payload>;
    this.snapshot = { signature: JSON.stringify(intent), payload: frozenPayload };
    return frozenPayload;
  }

  clear() {
    this.snapshot = null;
  }

  clearIfIdle(writeActive: boolean) {
    if (writeActive) return false;
    this.clear();
    return true;
  }
}
