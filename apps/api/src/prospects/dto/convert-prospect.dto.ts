import { MaintenanceType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class ConvertProspectDto {
  @IsUUID()
  adminUserId!: string;

  @IsUUID()
  regionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pointCode?: string;

  @IsEnum(MaintenanceType)
  maintenanceType!: MaintenanceType;

  @ValidateIf((o) => o.maintenanceType === MaintenanceType.STANDARD)
  @IsInt()
  @Min(1)
  @Max(2)
  maintenanceWeek?: number;

  @ValidateIf((o) => o.maintenanceType === MaintenanceType.SMARTCLEAN)
  @IsString()
  smartcleanReferenceAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}
