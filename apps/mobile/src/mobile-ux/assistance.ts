type AssistanceDashboard = { technician: { id: string } };

type DashboardRequest = {
  generation: number;
  technicianId?: string;
  selection: boolean;
  supersededRefresh: boolean;
};

export class DashboardRequestCoordinator {
  private generation = 0;
  private selectedId: string | undefined;
  private activeOperation: 'refresh' | 'selection' | null = null;

  get selectedTechnicianId() {
    return this.selectedId;
  }

  beginSelection(technicianId: string): DashboardRequest {
    const supersededRefresh = this.activeOperation === 'refresh';
    this.activeOperation = 'selection';
    return { generation: ++this.generation, technicianId, selection: true, supersededRefresh };
  }

  beginRefresh(technicianId?: string): DashboardRequest | null {
    if (this.activeOperation === 'selection') return null;
    if (technicianId !== this.selectedId) return null;
    this.activeOperation = 'refresh';
    return { generation: ++this.generation, technicianId, selection: false, supersededRefresh: false };
  }

  commit(request: DashboardRequest) {
    if (!this.isCurrent(request)) return false;
    if (request.selection) {
      this.selectedId = request.technicianId;
    }
    this.activeOperation = null;
    return true;
  }

  fail(request: DashboardRequest) {
    if (!this.isCurrent(request)) return false;
    this.activeOperation = null;
    return true;
  }

  isCurrent(request: DashboardRequest) {
    return request.generation === this.generation;
  }

  exitAssistance() {
    this.selectedId = undefined;
    this.activeOperation = null;
    this.generation += 1;
  }
}

export function assistedTechnicianId(dashboard: AssistanceDashboard | null) {
  return dashboard?.technician.id;
}

export function assistanceRequestFields(technicianId?: string) {
  return technicianId ? { assistedForTechnicianId: technicianId } : {};
}

export function emptyAssistanceState() {
  return {
    helpDashboard: null,
    pendingAssist: undefined,
    selectorVisible: false,
    error: null,
  } as const;
}
