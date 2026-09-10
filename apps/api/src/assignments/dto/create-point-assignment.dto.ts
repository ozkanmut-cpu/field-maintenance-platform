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

  @IsOptional()
  @IsUUID()
  adminUserId!: string;
}

export class DeactivatePointAssignmentDto {
  @IsOptional()
  @IsUUID()
  adminUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
