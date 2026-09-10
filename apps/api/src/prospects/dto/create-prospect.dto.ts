import { ProspectSource } from '@prisma/client';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateProspectDto {
  @IsUUID()
  technicianId!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsEnum(ProspectSource)
  source!: ProspectSource;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sapNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  googlePlaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}
