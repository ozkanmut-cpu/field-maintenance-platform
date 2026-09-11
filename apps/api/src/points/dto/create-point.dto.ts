import { MaintenanceType, PointStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class CreatePointDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;


  @IsUUID()
  regionId!: string;

  @IsOptional()
  @IsEnum(PointStatus)
  status?: PointStatus;

  @IsEnum(MaintenanceType)
  maintenanceType!: MaintenanceType;

  @IsInt()
  @Min(1)
  @Max(2)
  maintenanceWeek?: number;

  @ValidateIf((o) => o.maintenanceType === MaintenanceType.SMARTCLEAN)
  @IsString()
  smartcleanReferenceAt?: string;
}
