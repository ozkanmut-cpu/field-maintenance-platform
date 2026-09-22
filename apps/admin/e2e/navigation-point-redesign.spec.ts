import { expect, test } from '@playwright/test';
import { navigationItems } from '../app/admin-navigation';
const admin = { id: 'admin-1', name: 'Admin User', username: 'admin', role: 'ADMIN', active: true };
const point = { id: 'p1', name: 'Kordon Pub', code: '1001', address: 'İskele Cad. No:1', updatedAt: '2026-09-20T10:30:00Z', status: 'ACTIVE', maintenanceType: 'STANDARD', maintenanceWeek: 1, region: { id: 'r1', name: 'Urla' }, aliases: [], locationSource: 'GOOGLE', locationConfidence: 90 };
const metrics = { completedMaintenance: 4, fieldTechnicianCount: 2, attemptCount: 1, nonMaintenanceVisitCount: 0, currentOpen: 7, overdueOpen: 3, unassignedOpen: 0, paperworkPending: 2, serviceSlipPending: 1, confirmationPending: 1 };
const reviewTechnician = { id: 't1', name: 'Ege Usta', username: 'ege' };
const attemptQueue = [
  { id: 'q1', reason: 'BUSINESS_CLOSED', note: 'Kapı kapalıydı', attemptedAt: '2026-09-18T08:00:00Z', point, technician: reviewTechnician },
  { id: 'q2', reason: 'ACCESS_FAILED', note: null, attemptedAt: '2026-09-19T08:00:00Z', point: { ...point, id: 'p2', code: '1002', name: 'Alsancak Pub' }, technician: reviewTechnician },
];
test.beforeEach(async ({ page }) => {
  await page.route('**/api/session/me', route => route.fulfill({ json: admin }));
  await page.route('**/api/backend/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path.endsWith('/users')) json = [admin];
    else if (path.endsWith('/points/p1')) json = point;
    else if (path.endsWith('/points/p1/aliases')) json = [{ id: 'a1', alias: 'Eski Kordon' }, { id: 'a2', alias: 'Sahil Pub' }];
    else if (path.endsWith('/points')) json = [point];
    else if (path.endsWith('/assignments/effective/p1')) json = { technician: { id: 't1', name: 'Ege Usta' } };
    else if (path.endsWith('/point-timeline')) json = { events: [{ id: 'v1', at: '2026-09-20T10:00:00Z', type: 'MAINTENANCE', data: { technician: { name: 'Ege Usta' }, status: 'VALID', confirmationEnteredAt: '2026-09-20T10:05:00Z', maintainedCoolerCount: 3, totalCoolerCount: 4, serviceSlipStatus: 'PRESENT', adminDecision: 'APPROVED' } }] };
    else if (path.endsWith('/admin-daily-summary')) json = { date: '2026-09-21', generatedAt: '2026-09-21T10:00:00Z', metrics, technicians: [] };
    else if (path.endsWith('/admin-kpi-reporting')) json = { from: '2026-09-01', to: '2026-09-21', metrics: { ...metrics, ownMaintenance: 4, successRate: 80, prospectVisitCount: 0, enteredLate: 0, helpedMaintenance: 0, helpedAttempts: 0, receivedHelpMaintenance: 0, receivedHelpAttempts: 0 }, paperwork: { serviceSlip: { pending: 1, present: 3, missing: 0, approved: 0 }, confirmation: { pending: 1, present: 3, missing: 0, approved: 0 } }, daily: [], technicians: [] };
    else if (path.endsWith('/admin-period-summary')) json = { weekStart: '2026-09-21', weekEnd: '2026-09-27', metrics, technicians: [] };
    else if (path.endsWith('/setup-pending')) json = { count: 1, items: [{ ...point, setupReasons: ['REGION_MISSING'] }] };
    else if (path.endsWith('/attempt-review-queue')) json = { count: attemptQueue.length, items: attemptQueue };
    else if (path.endsWith('/attempt-review-history')) json = { count: 0, items: [] };
    else if (path.endsWith('/attempt-review')) json = { closedDueDate: null };
    return route.fulfill({ json });
  });
});
test('desktop shows every navigation label without opening groups', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Yönetim bölümleri' });
  for (const item of navigationItems) await expect(nav.getByRole('button', { name: item.label, exact: true })).toBeVisible();
});
test('dashboard leads with exactly three real priorities and keeps reports visible', async ({ page }) => {
  await page.goto('/');
  const priorities = page.getByRole('region', { name: 'Operasyon kuyrukları' });
  await expect(priorities.getByRole('button')).toHaveCount(3);
  await expect(priorities.getByRole('button', { name: /Ayar bekleyen: 1/ })).toBeVisible();
  await expect(priorities.getByRole('button', { name: /Bekleyen onay: 2/ })).toBeVisible();
  await expect(priorities.getByRole('button', { name: /Geciken açık iş: 3/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Günlük Operasyon Özeti' })).toBeVisible();
});
test('point list and detail use operational labels while preserving the deep link', async ({ page }) => {
  await page.goto('/?section=points&status=ACTIVE');
  await expect(page.getByText('1 sonuç', { exact: true })).toBeVisible();
  const table = page.getByRole('table', { name: 'Nokta listesi' });
  await expect(table.getByText('Kordon Pub', { exact: true })).toBeVisible();
  await expect(table.getByText('1001 · İskele Cad. No:1', { exact: true })).toBeVisible();
  await expect(table.getByText('Standart Bakım', { exact: true })).toBeVisible();
  await expect(table.getByText('Google doğrulandı · %90', { exact: true })).toBeVisible();
  await table.getByRole('button', { name: 'Detay', exact: true }).click();
  await expect(page).toHaveURL(/section=point-detail/);
  await expect(page.getByRole('navigation', { name: 'İçerik yolu' })).toContainText('Nokta Yönetimi / Noktalar / Kordon Pub');
  await expect(page.getByRole('button', { name: 'Geri dön: Noktalar', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Düzenle', exact: true })).toHaveCount(1);
  const summary = page.getByRole('region', { name: 'Son bakım özeti' });
  await expect(summary).toContainText('Teyit girilen bakım');
  await expect(summary).toContainText('3/4');
  await expect(summary).toContainText('Mevcut');
  await expect(summary).toContainText('Onaylandı');
});

test('all point tabs preserve identity, aliases, latest activity and one usable Edit action', async ({ page }) => {
  await page.goto('/?section=point-detail&pointId=p1&tab=general');
  for (const tab of ['Genel Bilgiler', 'Konum', 'Bakım', 'Görevlendirme', 'Ekipman', 'Evrak', 'Timeline', 'Audit / Geçmiş']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const summary = page.getByRole('region', { name: 'Nokta kimliği ve durum' });
    await expect(summary.getByRole('heading', { name: 'Kordon Pub' })).toBeVisible();
    await expect(summary.getByText('Ege Usta', { exact: true })).toBeVisible();
    await expect(summary.getByText('Eski Kordon', { exact: true })).toBeVisible();
    await expect(summary.getByText('Sahil Pub', { exact: true })).toBeVisible();
    await expect(summary.getByText(/Son hareket/)).toContainText('Bakım ziyaretleri');
    await expect(page.getByRole('button', { name: 'Düzenle', exact: true })).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Düzenle', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nokta adı', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'İptal', exact: true }).click();
  await page.getByRole('tab', { name: 'Genel Bilgiler' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Audit / Geçmiş' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Audit / Geçmiş' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Genel Bilgiler' })).toBeFocused();
});
test('desktop priorities fill three columns beside a wide text sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: 'Yönetim menüsü' });
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())!.width).toBeGreaterThanOrEqual(280);
  const priorities = page.getByRole('region', { name: 'Operasyon kuyrukları' });
  expect(await priorities.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(3);
});
test('compact point tabs and aliases stay inside the viewport with keyboard menu return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?section=point-detail&pointId=p1&tab=general');
  await expect(page.getByRole('heading', { name: 'Kordon Pub' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const menu = page.getByRole('button', { name: 'Menüyü Aç', exact: true });
  await menu.click();
  await expect(page.getByRole('dialog', { name: 'Yönetim menüsü' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
});

for (const report of [{ endpoint: 'admin-daily-summary', title: 'Günlük Operasyon Özeti' }, { endpoint: 'admin-period-summary', title: 'Haftalık / Dönem Sonu Özeti' }]) {
  test(`${report.endpoint} failure and retry do not hide loaded queue priorities`, async ({ page }) => {
    let fail = true;
    await page.route(`**/api/backend/maintenance/${report.endpoint}?*`, route =>
      fail ? route.fulfill({ status: 503, json: { message: 'Rapor geçici olarak kullanılamıyor' } }) : route.fallback());
    await page.goto('/');
    await expect(page.getByText('Rapor geçici olarak kullanılamıyor', { exact: true })).toBeVisible();
    const priorities = page.getByRole('region', { name: 'Operasyon kuyrukları' });
    await expect(priorities.getByRole('button', { name: /Ayar bekleyen: 1/ })).toBeVisible();
    await expect(priorities.getByRole('button', { name: /Bekleyen onay: 2/ })).toBeVisible();
    fail = false;
    const panel = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: report.title, exact: true }) });
    await panel.getByRole('button', { name: 'YENİLE', exact: true }).click();
    await expect(page.getByText('Rapor geçici olarak kullanılamıyor', { exact: true })).toHaveCount(0);
    await expect(priorities.getByRole('button', { name: /Ayar bekleyen: 1/ })).toBeVisible();
    await expect(priorities.getByRole('button', { name: /Bekleyen onay: 2/ })).toBeVisible();
  });
}
test('point latest activity ignores future scheduled obligations and assignments', async ({ page }) => {
  await page.route('**/api/backend/maintenance/point-timeline?*', route => route.fulfill({ json: { events: [
    { id: 'future-assignment', type: 'ASSIGNMENT', at: '2100-01-01T00:00:00Z', data: { kind: 'TEMPORARY' } },
    { id: 'future-obligation', type: 'OBLIGATION', at: '2099-01-01T00:00:00Z', data: { status: 'OPEN' } },
    { id: 'actual-visit', type: 'MAINTENANCE', at: '2020-01-01T10:00:00Z', data: { status: 'VALID' } },
  ] } }));
  await page.goto('/?section=point-detail&pointId=p1&tab=general');
  await expect(page.getByRole('region', { name: 'Nokta kimliği ve durum' }).getByText(/Son hareket/)).toContainText('Bakım ziyaretleri');
});
test('queue retry restores its own metrics without clearing a failed report', async ({ page }) => {
  let queueFails = true;
  await page.route('**/api/backend/regions', route => queueFails
    ? route.fulfill({ status: 503, json: { message: 'Kuyruk verisi kullanılamıyor' } }) : route.fallback());
  await page.route('**/api/backend/maintenance/admin-period-summary?*', route =>
    route.fulfill({ status: 503, json: { message: 'Dönem raporu kullanılamıyor' } }));
  await page.goto('/');
  await expect(page.getByText('Dönem raporu kullanılamıyor', { exact: true })).toBeVisible();
  const priorities = page.getByRole('region', { name: 'Operasyon kuyrukları' });
  await expect(priorities.getByText('Operasyon öncelikleri alınamadı', { exact: true })).toBeVisible();
  await expect(priorities.getByRole('button', { name: /Ayar bekleyen:/ })).toHaveCount(0);
  queueFails = false;
  await page.getByRole('button', { name: 'Kuyrukları tekrar yükle', exact: true }).click();
  await expect(priorities.getByRole('button', { name: /Ayar bekleyen: 1/ })).toBeVisible();
  await expect(priorities.getByRole('button', { name: /Bekleyen onay: 2/ })).toBeVisible();
  await expect(page.getByText('Dönem raporu kullanılamıyor', { exact: true })).toBeVisible();
});

test('point assignment and audit 503 failures recover independently without fictional data', async ({ page }) => {
  let assignmentFails = true, auditFails = true;
  await page.route('**/api/backend/assignments/effective/p1', route => assignmentFails ? route.fulfill({ status: 503, json: {} }) : route.fallback());
  await page.route('**/api/backend/audit?*', route => auditFails ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: [] }));
  await page.goto('/?section=point-detail&pointId=p1&tab=audit');
  await expect(page.getByRole('button', { name: 'Geçerli teknisyeni yeniden dene', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sekme verilerini yeniden dene', exact: true })).toBeVisible();
  await expect(page.getByText('Yükleniyor…', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Bu nokta için audit kaydı yok.', { exact: true })).toHaveCount(0);
  assignmentFails = false;
  await page.getByRole('button', { name: 'Geçerli teknisyeni yeniden dene', exact: true }).click();
  await expect(page.getByText('Ege Usta', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sekme verilerini yeniden dene', exact: true })).toBeVisible();
  auditFails = false;
  await page.getByRole('button', { name: 'Sekme verilerini yeniden dene', exact: true }).click();
  await expect(page.getByText('Bu nokta için audit kaydı yok.', { exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel').getByRole('alert')).toHaveCount(0);
});

test('bulk initial list 503 is recoverable and cannot appear as zero or empty results', async ({ page }) => {
  let failed = true;
  await page.route('**/api/backend/points', route => failed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: [point] }));
  await page.goto('/?section=bulk-operations');
  await expect(page.getByRole('button', { name: 'Noktaları yeniden dene', exact: true })).toBeVisible();
  await expect(page.locator('.filterCount')).toHaveCount(0);
  await expect(page.getByText('Eşleşen nokta yok.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Değişiklikleri Önizle', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Noktaları yeniden dene', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '1001 kodlu Kordon Pub noktasını seç' })).toBeVisible();
  await expect(page.locator('.filterCount')).toHaveText('1 / 1');
});
