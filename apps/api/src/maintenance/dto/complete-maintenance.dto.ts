import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CompleteMaintenanceDto {
  @IsUUID()
  pointId!: string;

  @IsOptional()
  @IsUUID()
  technicianId!: string;

  @IsOptional()
  @IsUUID()
  assistedForTechnicianId?: string;

  @IsOptional()
  @IsString()
  performedAt?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  @IsOptional()
  @IsBoolean()
  locationPresenceConfirmed?: boolean;

  @IsOptional()
  @IsString()
  locationCapturedAt?: string;

  @IsOptional()
  @IsString()
  deviceRecordedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lateEntryReason?: string;

  @IsOptional() @IsInt() @Min(0) coolerCount?: number;
  @IsOptional() @IsBoolean() equipmentCorrectionRequested?: boolean;
  @IsOptional() @IsInt() @Min(0) maintainedCoolerCount?: number;
  @IsOptional() @IsBoolean() partialMaintenanceConfirmed?: boolean;
  @IsOptional() @IsString() @MaxLength(500) missingMaintenanceExplanation?: string;
  @IsOptional() @IsInt() @Min(0) towerCount?: number;
  @IsOptional() @IsInt() @Min(0) tapCount?: number;
  @IsOptional() @IsInt() @Min(0) smarttapCount?: number;
  @IsBoolean() equipmentConfirmed!: boolean;

  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;
}
