import { Controller, Get } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { Roles } from '../auth/roles.decorator';
@Controller('admin/sap-sync')
@Roles('ADMIN')
export class SapSyncController {
  @Get('status') async status() {
    const raw = await readFile('/opt/field-maintenance/sap-runtime/logs/import-runs/latest.json', 'utf8');
    const r = JSON.parse(raw);
    return { status:r.status, at:r.at, rows:r.rows, inserted:r.inserted, updated:r.updated, unchanged:r.unchanged, deleted:r.deleted, blockedDeletes:r.blockedDeletes, cutoff:r.cutoff, oldest:r.data?.oldest, newest:r.data?.newest, guard:r.deleteGuard?.reasons ?? [] };
  }
}
