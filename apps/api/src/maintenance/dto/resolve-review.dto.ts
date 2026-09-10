import { ReviewDecision } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ResolveReviewDto {
  @IsUUID()
  visitId!: string;

  @IsUUID()
  adminUserId!: string;

  @IsEnum(ReviewDecision)
  decision!: ReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
