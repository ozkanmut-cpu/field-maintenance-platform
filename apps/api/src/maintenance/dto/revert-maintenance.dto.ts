import { IsNotEmpty, IsUUID } from 'class-validator';

export class RevertMaintenanceDto {
  @IsUUID()
  visitId!: string;

  @IsUUID()
  userId!: string;

  @IsNotEmpty()
  reason!: string;
}
