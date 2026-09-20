import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CompleteServiceSlipReviewDto {
  @IsUUID()
  visitId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}
