export class LatestRequest {
  next(): number;
  isCurrent(epoch: number): boolean;
}

export class RequestActivity {
  constructor(setActive: (active: boolean) => void);
  begin(): number;
  invalidate(): void;
  isCurrent(epoch: number): boolean;
  finish(epoch: number): boolean;
}
