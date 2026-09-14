import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecommendationFeedbackDto {
  @IsString()
  @MaxLength(200)
  recommendationId!: string;

  @IsIn(['ACCEPTED', 'REJECTED', 'NO_ACTION'])
  decision!: 'ACCEPTED' | 'REJECTED' | 'NO_ACTION';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
