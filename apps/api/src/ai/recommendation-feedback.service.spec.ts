import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RecommendationFeedbackService } from './recommendation-feedback.service';

function sut() {
  const created: any[] = [];
  const prisma = {
    adminAuditLog: {
      create: async ({ data }: any) => {
        const row = { id: `a${created.length + 1}`, ...data, createdAt: new Date('2026-09-14T10:00:00Z') };
        created.push(row);
        return row;
      },
      findMany: async () => created.map((row) => ({ ...row, actor: { id: row.actorId, name: 'Admin' } })).reverse(),
    },
  } as any;
  return { service: new RecommendationFeedbackService(prisma), created };
}
test('records accepted recommendation feedback in the existing admin audit stream', async () => {
  const { service, created } = sut();
  const result = await service.record('admin-1', {
    recommendationId: 'tech-1:REVIEW_ROUTE',
    decision: 'ACCEPTED',
    note: 'Rota yeniden incelendi',
  });
  assert.equal(result.decision, 'ACCEPTED');
  assert.equal(created[0].entityType, 'AI_RECOMMENDATION');
  assert.equal(created[0].entityId, 'tech-1:REVIEW_ROUTE');
  assert.equal(created[0].actorId, 'admin-1');
});

test('feedback history is reusable as a recommendation outcome dataset', async () => {
  const { service } = sut();
  await service.record('admin-1', { recommendationId: 't1:REVIEW_ROUTE', decision: 'REJECTED' });
  await service.record('admin-1', { recommendationId: 't2:PRIORITIZE_CARRYOVER', decision: 'ACCEPTED' });
  const history = await service.list(20);
  assert.equal(history.length, 2);
  assert.equal(history[0].decision, 'ACCEPTED');
});
