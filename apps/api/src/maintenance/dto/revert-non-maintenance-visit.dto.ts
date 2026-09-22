import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class RevertNonMaintenanceVisitDto {
  @IsUUID()
  visitId!: string;

  @IsOptional()
  @IsUUID()
  userId!: string;

  @IsNotEmpty()
  reason!: string;
}
