import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AdminAiController } from './admin-ai.controller';
import { AiModule } from './ai.module';

test('AiModule resolves the complete Admin AI controller dependency graph', async () => {
  const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), AiModule] }).compile();
  try {
    assert.ok(moduleRef.get(AdminAiController));
  } finally {
    await moduleRef.close();
  }
});