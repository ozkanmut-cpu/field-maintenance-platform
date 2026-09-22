"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminIcon } from "./admin-icons";
import { AccessibleTable } from "./accessible-table";
import { AdminFilterToolbar, AdminListState } from "./admin-primitives";
type Technician = {
  id: string;
  name: string;
  username: string;
  role: "ADMIN" | "TECHNICIAN";
  active: boolean;
};
type Item = {
  id: string;
  recordedAtServer: string;
  enteredLate: boolean;
  suspiciousBatch: boolean;
  reviewReason?: string | null;
  locationReviewRequired: boolean;
  locationPresenceConfirmed?: boolean | null;
  latitude: string | number;
  longitude: string | number;
  accuracyMeters?: string | number | null;
  technician: { id: string; name: string };
  point: {
    code: string;
    name: string;
    address?: string | null;
    canonicalLatitude?: string | number | null;
    canonicalLongitude?: string | number | null;
    locationSource: string;
    locationConfidence: number;
  };
};
type Decision = "NO_ISSUE" | "KEEP_LOCATION_EXCLUDED" | "NEEDS_FOLLOWUP";
type History = {
  history: Array<{
    id: string;
    decision: Decision;
    note?: string | null;
    resolvedAt: string;
    resolvedBy: { name: string };
  }>;
};
const label: Record<Decision, string> = {
  NO_ISSUE: "Sorun yok",
  KEEP_LOCATION_EXCLUDED: "Konumu dışla",
  NEEDS_FOLLOWUP: "Takip gerekli",
};
type AnomalyReviewType = "ALL" | "LOCATION" | "SUSPICIOUS" | "LATE";
export function filterAnomalyQueue(items: Item[], filters: { search: string; technicianId: string; reviewType: AnomalyReviewType }) {
  const q = filters.search.trim().toLocaleLowerCase("tr-TR");
  return items.filter((item) => {
    if (filters.technicianId && item.technician.id !== filters.technicianId) return false;
    if (filters.reviewType === "LOCATION" && !item.locationReviewRequired) return false;
    if (filters.reviewType === "SUSPICIOUS" && !item.suspiciousBatch) return false;
    if (filters.reviewType === "LATE" && !item.enteredLate) return false;
    const text = [item.point.code, item.point.name, item.technician.name, item.reviewReason ?? ""].join(" ").toLocaleLowerCase("tr-TR");
    return !q || text.includes(q);
  });
}
export default function AnomalyReview() {
  const [items, setItems] = useState<Item[]>([]),
    [techs, setTechs] = useState<Technician[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [history, setHistory] = useState<History | null>(null),
    [loading, setLoading] = useState(true),
    [historyLoading, setHistoryLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [technicianId, setTechnicianId] = useState(""),
    [reviewType, setReviewType] = useState<AnomalyReviewType>("ALL"),
    [lastUpdated, setLastUpdated] = useState("");
  const loadGeneration = useRef(0);
  const selectedItem = items.find((item) => item.id === selected),
    visible = useMemo(() => filterAnomalyQueue(items, { search, technicianId, reviewType }), [items, search, technicianId, reviewType]);
  const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const r = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      }),
      body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(body?.message || "HTTP " + r.status);
    return body as T;
  };
  async function load() {
    const generation = ++loadGeneration.current;
    setLoading(true); setError("");
    try {
      const [queue, users] = await Promise.all([
        api<Item[]>("/api/backend/maintenance/review-queue?limit=200"),
        api<Technician[]>("/api/backend/users"),
      ]);
      if (generation !== loadGeneration.current) return;
      setItems(queue);
      setTechs(
        users.filter((user) => user.role === "TECHNICIAN" && user.active),
      );
      setSelected((current) =>
        queue.some((item) => item.id === current)
          ? current
          : (queue[0]?.id ?? null),
      );
      setLastUpdated(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      if (generation === loadGeneration.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    const saved = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("admin.anomaly.filters");
    if (saved) try { const parsed = JSON.parse(saved); setSearch(parsed.search ?? ""); setTechnicianId(parsed.technicianId ?? ""); setReviewType(parsed.reviewType ?? "ALL"); } catch {}
    void load();
  }, []);
  useEffect(() => { if (typeof sessionStorage !== "undefined") sessionStorage.setItem("admin.anomaly.filters", JSON.stringify({ search, technicianId, reviewType })); }, [search, technicianId, reviewType]);
  useEffect(() => {
    if (!selected) {
      setHistory(null);
      setHistoryLoading(false);
      return;
    }
    const controller = new AbortController();
    setHistoryLoading(true);
    void api<History>(
      "/api/backend/maintenance/review-history?visitId=" +
        encodeURIComponent(selected),
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setHistory(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [selected]);
  async function decide(item: Item, decision: Decision) {
    if (
      !window.confirm(
        item.point.name + " için “" + label[decision] + "” kararı verilsin mi?",
      )
    )
      return;
    const note = window.prompt("Yönetici notu (opsiyonel):") ?? undefined;
    setBusy(true);
    try {
      await api("/api/backend/maintenance/review-resolve", {
        method: "POST",
        body: JSON.stringify({ visitId: item.id, decision, note }),
      });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelected((current) => current === item.id ? null : current);
      setNotice(`${item.point.name}: ${label[decision]} olarak kaydedildi.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function approve(item: Item) {
    if (
      !window.confirm(
        item.point.name +
          " için teknisyen GPS konumu onaylansın mı? Konum kararı bakım statüsünü değiştirmez ve başka anomali bayraklarını kapatmaz.",
      )
    )
      return;
    const note = window.prompt("Yönetici notu (opsiyonel):") ?? undefined;
    setBusy(true);
    try {
      await api("/api/backend/maintenance/location-review/approve-visit", {
        method: "POST",
        body: JSON.stringify({ visitId: item.id, note }),
      });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, locationReviewRequired: false, locationPresenceConfirmed: true } : entry));
      setNotice(`${item.point.name}: teknisyen konumu onaylandı.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function scan(id: string) {
    setBusy(true);
    try {
      await api(
        "/api/backend/maintenance/anomaly-scan?technicianId=" +
          encodeURIComponent(id) +
          "&lookbackHours=24",
        { method: "POST" },
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function scanAll() {
    setBusy(true);
    try {
      for (const tech of techs)
        await api(
          "/api/backend/maintenance/anomaly-scan?technicianId=" +
            encodeURIComponent(tech.id) +
            "&lookbackHours=24",
          { method: "POST" },
        );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const metric = (name: string, value: string | number, help: string) => (
    <div className="dashboardCard">
      <span>{name}</span>
      <strong>{loading ? "—" : value}</strong>
      <small>{help}</small>
    </div>
  );
  const location = items.filter((item) => item.locationReviewRequired).length,
    suspicious = items.filter((item) => item.suspiciousBatch).length,
    late = items.filter((item) => item.enteredLate).length;
  return (
    <>
      <section className="panel priorityPanel">
        <div className="panelHeader">
          <div>
            <h2>Konum & Anomali İnceleme</h2>
            <p>
              Teknisyen konumları ve açık anomali sinyalleri için bağımsız
              yönetici kararları.
            </p>
          </div>
        </div>
        {error && <AdminListState state="error" title="İnceleme kuyruğu güncellenemedi" description={`${error}. Mevcut kayıtlar korunuyor.`} onRetry={() => void load()} />}
        {notice && <div className="banner" role="status">Kaydedildi · {notice}</div>}
        <div className="dashboardGrid">
          {metric("İnceleme bekleyen", items.length, "Açık yönetici kuyruğu")}
          {metric("Konum incelemesi", location, "Teknisyen GPS’i için karar")}
          {metric("Şüpheli seri giriş", suspicious, "Otomatik anomali sinyali")}
          {metric("Geç giriş", late, "İnceleme desteği")}
        </div>
        <div className="banner">
          <strong>Karar sınırı:</strong> Teknisyen konum onayı yalnız resmi
          nokta konumunu günceller. Konum kararı bakım statüsünü değiştirmez,
          bakımı geri almaz ve diğer anomali bayraklarını otomatik kapatmaz.
        </div>
        <AdminFilterToolbar resultCount={visible.length} resultLabel="kayıt" lastUpdated={lastUpdated} refreshing={loading} onRefresh={() => void load()} onClear={() => { setSearch(""); setTechnicianId(""); setReviewType("ALL"); }} activeFilters={[...(search ? [{ id: "search", label: `Arama: ${search}`, onRemove: () => setSearch("") }] : []), ...(technicianId ? [{ id: "technician", label: techs.find((tech) => tech.id === technicianId)?.name ?? "Teknisyen", onRemove: () => setTechnicianId("") }] : []), ...(reviewType !== "ALL" ? [{ id: "type", label: reviewType === "LOCATION" ? "Konum incelemesi" : reviewType === "SUSPICIOUS" ? "Şüpheli seri giriş" : "Geç giriş", onRemove: () => setReviewType("ALL") }] : [])]}>
          <label className="searchField"><AdminIcon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="İnceleme kuyruğunda ara" placeholder="Nokta, kod, teknisyen veya neden ara" /></label>
          <select aria-label="Teknisyen filtresi" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}><option value="">Tüm teknisyenler</option>{techs.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select>
          <select aria-label="İnceleme türü filtresi" value={reviewType} onChange={(e) => setReviewType(e.target.value as AnomalyReviewType)}><option value="ALL">Tüm açık incelemeler</option><option value="LOCATION">Konum incelemesi</option><option value="SUSPICIOUS">Şüpheli seri giriş</option><option value="LATE">Geç giriş</option></select>
        </AdminFilterToolbar>
        <AccessibleTable caption="Konum ve anomali inceleme kuyruğu">
            <thead>
              <tr>
                <th>Nokta</th>
                <th>Teknisyen</th>
                <th>Neden</th>
                <th>Konum karşılaştırması</th>
                <th>Zaman</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Anomaliler yükleniyor.</td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6}>İnceleme kuyruğunda eşleşen kayıt yok.</td>
                </tr>
              ) : (
                visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.point.name}</strong>
                      <div className="muted">
                        {item.point.code} · {item.point.address || "Adres yok"}
                      </div>
                    </td>
                    <td>{item.technician.name}</td>
                    <td>
                      <span className="pill">
                        {item.locationReviewRequired
                          ? "Konum incelemesi"
                          : item.suspiciousBatch
                            ? "Şüpheli seri giriş"
                            : "İnceleme"}
                      </span>
                      <div className="muted">
                        {item.reviewReason || "Neden belirtilmedi"}
                      </div>
                    </td>
                    <td>
                      <strong>Resmi:</strong>{" "}
                      {item.point.canonicalLatitude == null
                        ? "Yok"
                        : Number(item.point.canonicalLatitude).toFixed(5) +
                          ", " +
                          Number(item.point.canonicalLongitude).toFixed(5)}
                      <div className="muted">
                        GPS: {Number(item.latitude).toFixed(5)},{" "}
                        {Number(item.longitude).toFixed(5)} ·{" "}
                        {item.accuracyMeters == null
                          ? "hassasiyet yok"
                          : "±" +
                            Math.round(Number(item.accuracyMeters)) +
                            " m"}
                      </div>
                      <div className="muted">
                        {item.point.locationSource} · güven %
                        {item.point.locationConfidence}
                      </div>
                    </td>
                    <td>
                      {new Date(item.recordedAtServer).toLocaleString("tr-TR")}
                    </td>
                    <td className="actions">
                      <button
                        className="small"
                        onClick={() => setSelected(item.id)}
                        disabled={busy}
                      >
                        İNCELE
                      </button>
                      {item.locationReviewRequired && (
                        <button
                          className="small"
                          onClick={() => void approve(item)}
                          disabled={busy}
                        >
                          KONUMU ONAYLA
                        </button>
                      )}
                      <button
                        className="small"
                        onClick={() => void decide(item, "NO_ISSUE")}
                        disabled={busy}
                      >
                        SORUN YOK
                      </button>
                      <button
                        className="small"
                        onClick={() =>
                          void decide(item, "KEEP_LOCATION_EXCLUDED")
                        }
                        disabled={busy}
                      >
                        KONUMU DIŞLA
                      </button>
                      <button
                        className="small"
                        onClick={() => void decide(item, "NEEDS_FOLLOWUP")}
                        disabled={busy}
                      >
                        TAKİP
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
        </AccessibleTable>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Teknisyen konum onayı · İnceleme geçmişi</h2>
            <p>
              {selectedItem
                ? selectedItem.point.name
                : "Kuyruktan bir kayıt seçin."}
            </p>
          </div>
        </div>
        {historyLoading ? (
          "Karar geçmişi yükleniyor."
        ) : history?.history.length ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Karar</th>
                  <th>Yönetici</th>
                  <th>Tarih</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                {history.history.map((entry) => (
                  <tr key={entry.id}>
                    <td>{label[entry.decision]}</td>
                    <td>{entry.resolvedBy.name}</td>
                    <td>
                      {new Date(entry.resolvedAt).toLocaleString("tr-TR")}
                    </td>
                    <td>{entry.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="emptyState compact">
            <strong>Önceki yönetici kararı yok.</strong>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>24 Saatlik Tarama</h2>
            <p>Teknisyen bazında gerçek anomaly scan çalıştır.</p>
          </div>
          <button
            className="ghost iconAction"
            onClick={() => void scanAll()}
            disabled={busy || loading || techs.length === 0}
          >
            <AdminIcon name="refresh" size={17} />
            <span>TÜMÜNÜ TARA</span>
          </button>
        </div>
        <div className="helpGrid">
          {techs.map((tech) => (
            <button
              className="helpOption"
              key={tech.id}
              onClick={() => void scan(tech.id)}
              disabled={busy}
            >
              <span>
                <strong>{tech.name}</strong>
                <small>@{tech.username} · son 24 saat</small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
