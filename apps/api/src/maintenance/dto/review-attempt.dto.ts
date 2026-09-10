import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum AttemptAdminDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ReviewAttemptDto {
  @IsUUID()
  attemptId!: string;

  @IsEnum(AttemptAdminDecision)
  decision!: AttemptAdminDecision;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}
