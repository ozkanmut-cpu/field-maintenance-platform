import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PreviewRegionTechnicianChangeDto {
  @IsUUID()
  technicianId!: string;
}

export class ChangeRegionTechnicianDto extends PreviewRegionTechnicianChangeDto {
  @IsUUID()
  adminUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
