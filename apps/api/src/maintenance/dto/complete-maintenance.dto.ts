import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CompleteMaintenanceDto {
  @IsUUID()
  pointId!: string;

  @IsUUID()
  technicianId!: string;

  @IsOptional()
  @IsUUID()
  assistedForTechnicianId?: string;

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

  @IsOptional() @IsInt() @Min(0) coolerCount?: number;
  @IsOptional() @IsInt() @Min(0) towerCount?: number;
  @IsOptional() @IsInt() @Min(0) tapCount?: number;
  @IsOptional() @IsInt() @Min(0) smarttapCount?: number;
  @IsBoolean() equipmentConfirmed!: boolean;

  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;
}
