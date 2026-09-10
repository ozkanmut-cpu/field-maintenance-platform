import { IsLatitude, IsLongitude, IsOptional, IsString, IsUUID } from 'class-validator';

export class EfesimExtractDto {
  @IsUUID()
  technicianId!: string;

  @IsString()
  imageBase64!: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
