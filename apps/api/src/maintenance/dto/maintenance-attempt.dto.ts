import { AttemptReason } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsUUID } from 'class-validator';

export class MaintenanceAttemptDto {
  @IsUUID()
  pointId!: string;

  @IsUUID()
  technicianId!: string;

  @IsEnum(AttemptReason)
  reason!: AttemptReason;

  @IsOptional()
  @IsNotEmpty()
  note?: string;

  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracyMeters?: number;

  @IsNotEmpty()
  locationCapturedAt!: string;

  @IsNotEmpty()
  idempotencyKey!: string;
}
