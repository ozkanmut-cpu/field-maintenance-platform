import { expect, test } from '@playwright/test';
import { navigationItems } from '../app/admin-navigation';
const admin = { id: 'admin-1', name: 'Admin User', username: 'admin', role: 'ADMIN', active: true };
const point = { id: 'p1', name: 'Kordon Pub', code: '1001', status: 'ACTIVE', maintenanceType: 'STANDARD', maintenanceWeek: 1, region: { id: 'r1', name: 'Urla' }, aliases: [], locationSource: 'GOOGLE', locationConfidence: 90 };
const metrics = { completedMaintenance: 4, fieldTechnicianCount: 2, attemptCount: 1, nonMaintenanceVisitCount: 0, currentOpen: 7, overdueOpen: 3, unassignedOpen: 0, paperworkPending: 2, serviceSlipPending: 1, confirmationPending: 1 };
test.beforeEach(async ({ page }) => {
  await page.route('**/api/session/me', route => route.fulfill({ json: admin }));
  await page.route('**/api/backend/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path.endsWith('/users')) json = [admin];
    else if (path.endsWith('/points/p1')) json = point;
    else if (path.endsWith('/points/p1/aliases')) json = [{ id: 'a1', alias: 'Eski Kordon' }, { id: 'a2', alias: 'Sahil Pub' }];
    else if (path.endsWith('/assignments/effective/p1')) json = { technician: { id: 't1', name: 'Ege Usta' } };
    else if (path.endsWith('/point-timeline')) json = { events: [{ id: 'v1', at: '2026-09-20T10:00:00Z', type: 'MAINTENANCE', data: { technician: { name: 'Ege Usta' }, status: 'VALID' } }] };
    else if (path.endsWith('/admin-daily-summary')) json = { date: '2026-09-21', generatedAt: '2026-09-21T10:00:00Z', metrics, technicians: [] };
    else if (path.endsWith('/admin-kpi-reporting')) json = { from: '2026-09-01', to: '2026-09-21', metrics: { ...metrics, ownMaintenance: 4, successRate: 80, prospectVisitCount: 0, enteredLate: 0, helpedMaintenance: 0, helpedAttempts: 0, receivedHelpMaintenance: 0, receivedHelpAttempts: 0 }, paperwork: { serviceSlip: { pending: 1, present: 3, missing: 0, approved: 0 }, confirmation: { pending: 1, present: 3, missing: 0, approved: 0 } }, daily: [], technicians: [] };
    else if (path.endsWith('/admin-period-summary')) json = { weekStart: '2026-09-21', weekEnd: '2026-09-27', metrics, technicians: [] };
    else if (path.endsWith('/setup-pending')) json = { count: 1, items: [{ ...point, setupReasons: ['REGION_MISSING'] }] };
    else if (path.endsWith('/attempt-review-queue')) json = { count: 2, items: [{ id: 'q1' }, { id: 'q2' }] };
    else if (path.endsWith('/attempt-review-history')) json = { count: 0, items: [] };
    return route.fulfill({ json });
  });
});
test('desktop shows every navigation label without opening groups', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Yönetim bölümleri' });
  for (const item of navigationItems) await expect(nav.getByRole('button', { name: item.label, exact: true })).toBeVisible();
});
test('dashboard leads with at most three real priorities and hides reports until requested', async ({ page }) => {
  await page.goto('/');
  const priorities = page.getByRole('region', { name: 'Operasyon kuyrukları' });
  await expect(priorities.getByRole('button')).toHaveCount(3);
  await expect(priorities.getByRole('button', { name: /Ayar bekleyen: 1/ })).toBeVisible();
  await expect(priorities.getByRole('button', { name: /Bekleyen onay: 2/ })).toBeVisible();
  await expect(priorities.getByRole('button', { name: /Geciken açık iş: 3/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Günlük Operasyon Özeti' })).toBeHidden();
  await page.getByText('Raporlar ve ayrıntılar', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Günlük Operasyon Özeti' })).toBeVisible();
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
