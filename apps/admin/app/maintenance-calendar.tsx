"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminIcon } from "./admin-icons";
type Technician = {
  id: string;
  name: string;
  username: string;
  role: "ADMIN" | "TECHNICIAN";
  active: boolean;
};
type DueItem = {
  pointId: string;
  pointCode: string;
  pointName: string;
  regionName: string;
  address?: string | null;
  maintenanceType: "STANDARD" | "SMARTCLEAN";
  maintenanceWeek?: number | null;
  dueStart: string;
  dueEnd: string;
  priority: "OVERDUE" | "CURRENT";
  overduePeriods: number;
  technicianId?: string | null;
  assignmentSource?: string | null;
  coolerCount?: number | null;
  towerCount?: number | null;
  tapCount?: number | null;
  smarttapCount?: number | null;
};
type ObligationHistory = {
  point: { id: string; code: string; name: string; maintenanceType: string };
  totals: { open: number; completed: number; missed: number };
  items: Array<{
    id: string;
    cycleKey: string;
    dueStart: string;
    dueEnd: string;
    status: "OPEN" | "COMPLETED" | "MISSED";
    completedAt?: string | null;
    visits: Array<{ id: string; performedAt: string; status: string }>;
  }>;
};
type QueueHandlers = {
  items: (items: DueItem[]) => void;
  technicians: (technicians: Technician[]) => void;
  error: (message: string) => void;
  loading: (loading: boolean) => void;
};

export function startMaintenanceQueueRequest(
  asOf: string,
  handlers: QueueHandlers,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  let cancelled = false;
  handlers.loading(true);
  handlers.error("");
  void (async () => {
    try {
      const suffix = asOf ? `?asOf=${encodeURIComponent(asOf)}` : "";
      const [dueResponse, usersResponse] = await Promise.all([
        fetcher(`/api/backend/maintenance/due${suffix}`, { signal: controller.signal }),
        fetcher("/api/backend/users", { signal: controller.signal }),
      ]);
      const [dueBody, usersBody] = await Promise.all([
        dueResponse.json().catch(() => null),
        usersResponse.json().catch(() => null),
      ]);
      if (!dueResponse.ok) throw new Error(Array.isArray(dueBody?.message) ? dueBody.message.join(", ") : dueBody?.message || `HTTP ${dueResponse.status}`);
      if (!usersResponse.ok) throw new Error(Array.isArray(usersBody?.message) ? usersBody.message.join(", ") : usersBody?.message || `HTTP ${usersResponse.status}`);
      if (cancelled) return;
      handlers.items((dueBody as { items: DueItem[] }).items);
      handlers.technicians((usersBody as Technician[]).filter((user) => user.role === "TECHNICIAN" && user.active));
    } catch (e) {
      if (!cancelled) handlers.error(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelled) handlers.loading(false);
    }
  })();
  return () => {
    cancelled = true;
    controller.abort();
  };
}

export default function MaintenanceCalendar() {
  const [items, setItems] = useState<DueItem[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [history, setHistory] = useState<ObligationHistory | null>(null);
  const [historyStatus, setHistoryStatus] = useState<"IDLE" | "LOADING" | "READY" | "ERROR">("IDLE");
  const [asOf, setAsOf] = useState("");
  const [filter, setFilter] = useState<"ALL" | "OVERDUE" | "CURRENT">("ALL");
  const [technicianFilter, setTechnicianFilter] = useState("ALL");
  const [maintenanceTypeFilter, setMaintenanceTypeFilter] = useState<"ALL" | DueItem["maintenanceType"]>("ALL");
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const historyRequestId = useRef(0);
  const cancelQueueRequest = useRef<(() => void) | null>(null);
  async function api<T>(path: string): Promise<T> {
    const response = await fetch(path);
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        Array.isArray(body?.message)
          ? body.message.join(", ")
          : body?.message || `HTTP ${response.status}`,
      );
    return body as T;
  }
  function load() {
    cancelQueueRequest.current?.();
    cancelQueueRequest.current = startMaintenanceQueueRequest(asOf, {
      items: setItems,
      technicians: setTechnicians,
      error: setListError,
      loading: setListLoading,
    });
  }
  useEffect(() => {
    load();
    return () => {
      cancelQueueRequest.current?.();
      cancelQueueRequest.current = null;
    };
  }, [asOf]);
  async function openHistory(pointId: string) {
    const requestId = ++historyRequestId.current;
    setHistory(null);
    setHistoryStatus("LOADING");
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const nextHistory = await api<ObligationHistory>(
        `/api/backend/maintenance/obligations/point/${pointId}/history`,
      );
      if (historyRequestId.current === requestId) {
        setHistory(nextHistory);
        setHistoryStatus("READY");
      }
    } catch (e) {
      if (historyRequestId.current === requestId) {
        setHistoryError(e instanceof Error ? e.message : String(e));
        setHistoryStatus("ERROR");
      }
    } finally {
      if (historyRequestId.current === requestId) setHistoryLoading(false);
    }
  }
  const technicianNames = useMemo(
    () => new Map(technicians.map((t) => [t.id, t.name])),
    [technicians],
  );
  const visible = items.filter((item) => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return (
      (filter === "ALL" || item.priority === filter) &&
      (technicianFilter === "ALL" || item.technicianId === technicianFilter) &&
      (maintenanceTypeFilter === "ALL" || item.maintenanceType === maintenanceTypeFilter) &&
      (!q ||
        `${item.pointCode} ${item.pointName} ${item.regionName} ${item.address ?? ""}`
          .toLocaleLowerCase("tr-TR")
          .includes(q))
    );
  });
  const overdue = items.filter((item) => item.priority === "OVERDUE").length;
  const current = items.filter((item) => item.priority === "CURRENT").length;
  const unassigned = items.filter((item) => !item.technicianId).length;
  return (
    <>
      <section className="dashboardGrid">
        <button className="dashboardCard" onClick={() => setFilter("OVERDUE")}>
          <span>Geciken</span>
          <strong>{overdue}</strong>
          <small>Öncelikli yükümlülükler</small>
        </button>
        <button className="dashboardCard" onClick={() => setFilter("CURRENT")}>
          <span>Bu dönem</span>
          <strong>{current}</strong>
          <small>Aktif bakım penceresi</small>
        </button>
        <button className="dashboardCard" onClick={() => setFilter("ALL")}>
          <span>Toplam açık</span>
          <strong>{items.length}</strong>
          <small>Tüm açık bakım işleri</small>
        </button>
        <button className="dashboardCard" onClick={() => setFilter("ALL")}>
          <span>Atanmamış</span>
          <strong>{unassigned}</strong>
          <small>Teknisyen bekleyen işler</small>
        </button>
      </section>
      <section className="panel priorityPanel">
        <div className="panelHeader">
          <div>
            <h2>Bakım Yükümlülükleri</h2>
            <p>
              Geciken ve mevcut bakım pencerelerini teknisyen, bölge ve bakım
              tipine göre takip et.
            </p>
          </div>
          <div className="actions">
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
            <button
              className="ghost iconAction"
              disabled={listLoading}
              onClick={() => void load()}
            >
              <AdminIcon name="refresh" size={17} />
              <span>YENİLE</span>
            </button>
          </div>
        </div>
        {listError ? <div className="error banner">{listError}</div> : null}
        <div className="filterBar oneFilter">
          <label className="searchField">
            <AdminIcon name="search" size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nokta, müşteri no, bölge veya adres ara"
            />
          </label>
          <select aria-label="Bakım durumu filtresi" value={filter} onChange={(event) => setFilter(event.target.value as "ALL" | "OVERDUE" | "CURRENT")}> <option value="ALL">Tüm durumlar</option><option value="OVERDUE">Geciken</option><option value="CURRENT">Bu dönem</option></select>
          <select aria-label="Teknisyen filtresi" value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}><option value="ALL">Tüm teknisyenler</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select>
          <select aria-label="Bakım tipi filtresi" value={maintenanceTypeFilter} onChange={(event) => setMaintenanceTypeFilter(event.target.value as "ALL" | DueItem["maintenanceType"])}><option value="ALL">Tüm bakım tipleri</option><option value="STANDARD">STANDARD</option><option value="SMARTCLEAN">SMARTCLEAN</option></select>
          <span className="filterCount">
            {visible.length} / {items.length}
          </span>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Nokta</th>
                <th>Bölge</th>
                <th>Bakım</th>
                <th>Vade</th>
                <th>Durum</th>
                <th>Teknisyen</th>
                <th>Ekipman</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="emptyState compact">
                      <AdminIcon name="clock" />
                      <strong>Bakım takvimi yükleniyor</strong>
                      <span>Açık yükümlülükler hazırlanıyor.</span>
                    </div>
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="emptyState compact success">
                      <AdminIcon name="check" />
                      <strong>Açık iş bulunamadı</strong>
                      <span>
                        Seçili filtre ve aramada bakım yükümlülüğü yok.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                visible.map((item) => (
                  <tr key={`${item.pointId}-${item.dueStart}`}>
                    <td>
                      <strong>{item.pointName}</strong>
                      <div className="muted">
                        {item.pointCode} · {item.address || "Adres yok"}
                      </div>
                    </td>
                    <td>{item.regionName}</td>
                    <td>
                      {item.maintenanceType === "STANDARD"
                        ? `Standart / Hafta ${item.maintenanceWeek ?? "—"}`
                        : `SmartClean / Hafta ${item.maintenanceWeek ?? "—"}`}
                    </td>
                    <td>
                      {new Date(item.dueStart).toLocaleDateString("tr-TR")} —{" "}
                      {new Date(item.dueEnd).toLocaleDateString("tr-TR")}
                    </td>
                    <td>
                      <span
                        className={
                          item.priority === "OVERDUE" ? "pill" : "pill active"
                        }
                      >
                        {item.priority === "OVERDUE"
                          ? `GECİKMİŞ${item.overduePeriods > 1 ? ` · ${item.overduePeriods} dönem` : ""}`
                          : "BU DÖNEM"}
                      </span>
                    </td>
                    <td>
                      {item.technicianId
                        ? technicianNames.get(item.technicianId) ||
                          item.technicianId
                        : "Atanmamış"}
                      <div className="muted">
                        {item.assignmentSource || "—"}
                      </div>
                    </td>
                    <td>
                      {[
                        item.coolerCount,
                        item.towerCount,
                        item.tapCount,
                        item.smarttapCount,
                      ].every((v) => v != null) ? (
                        <span className="muted">
                          S:{item.coolerCount} K:{item.towerCount} M:
                          {item.tapCount} ST:{item.smarttapCount}
                        </span>
                      ) : (
                        <span className="muted">Profil eksik</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="small"
                        disabled={historyLoading}
                        onClick={() => void openHistory(item.pointId)}
                      >
                        GEÇMİŞ
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {historyStatus === "LOADING" || historyStatus === "ERROR" || history ? (
        <section className="panel">
          <div className="panelHeader">
            <div>
              <h2>{history ? `${history.point.name} · ` : ""}Yükümlülük Geçmişi</h2>
              {history ? (
                <p>
                  {history.point.code} · {history.point.maintenanceType}
                </p>
              ) : null}
            </div>
            <button className="ghost" onClick={() => {
              historyRequestId.current += 1;
              setHistory(null);
              setHistoryStatus("IDLE");
              setHistoryLoading(false);
              setHistoryError("");
            }}>
              KAPAT
            </button>
          </div>
          {historyStatus === "LOADING" ? (
            <div className="emptyState compact">
              <AdminIcon name="clock" />
              <strong>Yükümlülük geçmişi yükleniyor</strong>
              <span>Geçmiş bakım dönemleri hazırlanıyor.</span>
            </div>
          ) : historyStatus === "ERROR" ? (
            <div className="error banner">{historyError}</div>
          ) : historyStatus === "READY" && history && history.items.length === 0 ? (
            <div className="emptyState compact success">
              <AdminIcon name="check" />
              <strong>Yükümlülük geçmişi bulunamadı</strong>
              <span>Bu nokta için kayıtlı bakım dönemi yok.</span>
            </div>
          ) : history ? <>
          <div className="stats">
            <div className="stat">
              <strong>{history.totals.open}</strong>
              <span>Açık</span>
            </div>
            <div className="stat">
              <strong>{history.totals.completed}</strong>
              <span>Tamamlandı</span>
            </div>
            <div className="stat">
              <strong>{history.totals.missed}</strong>
              <span>Kaçırıldı</span>
            </div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Dönem</th>
                  <th>Vade</th>
                  <th>Durum</th>
                  <th>Ziyaret</th>
                </tr>
              </thead>
              <tbody>
                {history.items
                  .slice()
                  .reverse()
                  .map((item) => (
                    <tr key={item.id}>
                      <td>{item.cycleKey}</td>
                      <td>
                        {new Date(item.dueStart).toLocaleDateString("tr-TR")} —{" "}
                        {new Date(item.dueEnd).toLocaleDateString("tr-TR")}
                      </td>
                      <td>
                        <span
                          className={
                            item.status === "COMPLETED" ? "pill active" : "pill"
                          }
                        >
                          {item.status === "OPEN"
                            ? "AÇIK"
                            : item.status === "COMPLETED"
                              ? "TAMAMLANDI"
                              : "KAÇIRILDI"}
                        </span>
                      </td>
                      <td>
                        {item.visits.length
                          ? item.visits
                              .map((v) =>
                                new Date(v.performedAt).toLocaleDateString(
                                  "tr-TR",
                                ),
                              )
                              .join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          </> : null}
        </section>
      ) : null}
    </>
  );
}