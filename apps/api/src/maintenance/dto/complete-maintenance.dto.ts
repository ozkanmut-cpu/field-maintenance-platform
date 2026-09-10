import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CompleteMaintenanceDto {
  @IsUUID()
  pointId!: string;

  @IsUUID()
  technicianId!: string;

  @IsOptional()
  @IsString()
  performedAt?: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  @IsString()
  locationCapturedAt!: string;

  @IsOptional()
  @IsString()
  deviceRecordedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lateEntryReason?: string;

  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;
}
