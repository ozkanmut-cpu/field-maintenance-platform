import { NonMaintenanceVisitPurpose } from '@prisma/client';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const PUBLIC_NON_MAINTENANCE_VISIT_PURPOSES = [
  'BREAKDOWN', 'FAULTY_KEG', 'FACILITY_INSTALLATION', 'FACILITY_REMOVAL',
  'MOBILE_INSTALLATION', 'MOBILE_REMOVAL', 'SMART_TAP_INSTALLATION',
  'SMART_TAP_BREAKDOWN', 'SMART_TAP_REMOVAL', 'SURVEY',
] as const;

export class NonMaintenanceVisitDto {
  @IsOptional()
  @IsUUID()
  pointId?: string;

  @IsIn(PUBLIC_NON_MAINTENANCE_VISIT_PURPOSES)
  purpose!: NonMaintenanceVisitPurpose;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7_000_000)
  efesimImageBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  visualExplanation?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;
  @IsOptional()
  @IsString()
  locationCapturedAt?: string;

  @IsOptional()
  @IsString()
  visitedAt?: string;

  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;
}
