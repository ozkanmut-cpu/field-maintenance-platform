import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApproveVisitLocationDto {
  @IsUUID()
  visitId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
