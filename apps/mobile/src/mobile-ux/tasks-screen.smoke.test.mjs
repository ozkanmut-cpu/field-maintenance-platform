import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screenFile = new URL('./TasksScreen.tsx', import.meta.url);
const cardFile = new URL('./TaskCard.tsx', import.meta.url);
const appFile = new URL('../CorporateApp.tsx', import.meta.url);

function source(file) {
  assert.ok(fs.existsSync(file), `${file.pathname} must exist`);
  return fs.readFileSync(file, 'utf8');
}

test('Jobs derives its weekly summary and filters from the technician dashboard', () => {
  const screen = source(screenFile);

  assert.match(screen, /weeklyTaskCounts\(dashboard\)/);
  assert.match(screen, /filterTasks\(dashboard\.due, search\)/);
  assert.match(screen, /orderTasks\(filteredTasks, deviceLocation\)/);
  for (const label of ['Tümü', 'Gecikmiş', 'Bu hafta']) {
    assert.match(screen, new RegExp(label));
  }
  assert.doesNotMatch(screen, /dönem/i);
  assert.match(source(cardFile), /task\.overduePeriods\} dönem/);
  assert.doesNotMatch(source(cardFile), /task\.overduePeriods\} hafta/);
});

test('Jobs provides a help selector and keeps the selected technician visible', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /YARDIM MODU/);
  assert.match(screen, /DEĞİŞTİR/);
  assert.match(screen, /Yardım edilecek teknisyen/);
  assert.match(screen, /KENDİ İŞLERİM/);
  assert.doesNotMatch(screen, />YARDIM ET</);
  assert.match(app, /helpTargets\(\)/);
  assert.match(app, /technicianDashboard\(target\.id\)/);
  assert.match(app, /assistedForTechnicianId/);
});

test('Jobs exposes an explicit return to own work that clears help state and reloads the self dashboard', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /KENDİ İŞLERİME DÖN/);
  assert.match(screen, /onExitAssistance/);
  assert.match(app, /function exitAssistance\(\)/);
  assert.match(app, /dashboardRequests\.current!\.exitAssistance\(\);[\s\S]*setHelpDashboard/);
  assert.match(app, /emptyAssistanceState\(\)/);
  assert.match(app, /void loadTasks\(\)/);
  assert.match(app, /onExitAssistance=\{exitAssistance\}/);
});

test('Jobs ignores stale or no-longer-selected assisted dashboard requests', () => {
  const app = source(appFile);

  assert.match(app, /new DashboardRequestCoordinator\(\)/);
  assert.match(app, /beginRefresh\(technicianId\)/);
  assert.match(app, /if \(!request\) return false/);
  assert.match(app, /if \(!dashboardRequests\.current!\.commit\(request\)\) return false/);
  assert.match(app, /beginSelection\(target\.id\)/);
});

test('Jobs preserves the selected assistance technician when refreshing and opening task detail', () => {
  const app = source(appFile);

  assert.match(app, /function refreshTasks\(\) \{ void loadTasks\(assistedTechnicianId\(helpDashboard\)\); \}/);
  assert.match(app, /onOpenTask=\{task => openTaskDetail\(task, assistedTechnicianId\(helpDashboard\)\)\}/);
});

test('Jobs has loading, retry, and pull-to-refresh affordances', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /Görevler yükleniyor/);
  assert.match(screen, /Görevler yüklenemedi/);
  assert.match(screen, /TEKRAR DENE/);
  assert.match(app, /RefreshControl/);
  assert.match(app, /onRefresh=\{refresh\}/);
});

test('help selector retry repeats the help-target request rather than refreshing a dashboard', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /assistanceError/);
  assert.match(screen, /onRetryAssistance/);
  assert.match(screen, /Yardım listesi yüklenemedi/);
  assert.match(screen, /onRetry=\{onRetryAssistance\}/);
  assert.match(app, /setAssistanceError\(message\(e\)\)/);
  assert.match(app, /onRetryAssistance=\{\(\) => void openHelpSelector\(\)\}/);
});

test('Jobs controls meet the 48 px touch-target minimum', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /filterChip:\s*\{\s*minHeight:\s*48/);
  assert.match(screen, /style=\{styles\.clearSearchButton\}/);
  assert.match(screen, /clearSearchButton:\s*\{\s*width:\s*48,\s*height:\s*48/);
  assert.match(app, /backLink:\{[^}]*minHeight:48/);
});

test('compact task cards open a task-detail state before equipment confirmation', () => {
  const app = source(appFile);

  assert.match(app, /'TASK_DETAIL'/);
  assert.match(app, /function openTaskDetail\(task: DueTask, assistedForTechnicianId\?: string\)/);
  assert.match(app, /onOpenTask=\{task => openTaskDetail\(task, assistedTechnicianId\(helpDashboard\)\)\}/);
  assert.match(app, /screen === 'TASK_DETAIL' && pendingTask/);
});

test('task cards are compact detail entry points without list-level route, completion, or attempt actions', () => {
  const card = source(cardFile);

  assert.match(card, /accessibilityLabel=\{`\$\{task\.pointName\} iş detayını aç`\}/);
  assert.doesNotMatch(card, /Yol tarifi/);
  assert.doesNotMatch(card, /BAKIM YAPILDI/);
  assert.doesNotMatch(card, /Bakım yapılamadı/);
});
