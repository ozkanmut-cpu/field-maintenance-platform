import { PointAssignmentKind } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePointAssignmentDto {
  @IsUUID()
  pointId!: string;

  @IsUUID()
  technicianId!: string;

  @IsEnum(PointAssignmentKind)
  kind!: PointAssignmentKind;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @IsUUID()
  adminUserId!: string;
}

export class DeactivatePointAssignmentDto {
  @IsUUID()
  adminUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
