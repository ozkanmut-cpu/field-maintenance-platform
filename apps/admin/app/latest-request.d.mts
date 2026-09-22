export class LatestRequest {
  next(): number;
  isCurrent(epoch: number): boolean;
}

export function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]>;

export class RequestActivity {
  constructor(setActive: (active: boolean) => void);
  begin(): number;
  invalidate(): void;
  isCurrent(epoch: number): boolean;
  finish(epoch: number): boolean;
}
