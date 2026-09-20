export type HelpUser = { id: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
export function createRequestGate(): { begin(): number; isCurrent(requestId: number): boolean };
export function createHelpLocationLifecycle(): {
  transition(): void;
  begin(): { requestId: number; locationVersion: number };
  isCurrent(request: { requestId: number; locationVersion: number }): boolean;
};
export function isActiveTechnician(users: HelpUser[], userId: string): boolean;
