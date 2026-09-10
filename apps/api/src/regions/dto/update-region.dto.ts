import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateRegionDto {
  @IsUUID()
  adminUserId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
}
