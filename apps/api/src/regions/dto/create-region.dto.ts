import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateRegionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  technicianId?: string;
}
