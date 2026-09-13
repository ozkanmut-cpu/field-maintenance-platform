import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class RevertMaintenanceDto {
  @IsUUID()
  visitId!: string;

  @IsOptional()
  @IsUUID()
  userId!: string;

  @IsNotEmpty()
  reason!: string;
}
