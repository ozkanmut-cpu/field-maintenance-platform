import { NonMaintenanceVisitPurpose } from '@prisma/client';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class NonMaintenanceVisitDto {
  @IsUUID()
  pointId!: string;

  @IsUUID()
  technicianId!: string;

  @IsOptional()
  @IsEnum(NonMaintenanceVisitPurpose)
  purpose?: NonMaintenanceVisitPurpose;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;

  @IsString()
  locationCapturedAt!: string;

  @IsOptional()
  @IsString()
  visitedAt?: string;

  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;
}
