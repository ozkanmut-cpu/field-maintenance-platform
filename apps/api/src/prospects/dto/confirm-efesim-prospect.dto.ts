import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ConfirmEfesimProspectDto {
  @IsUUID()
  technicianId!: string;

  @IsString()
  @MaxLength(180)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  sapNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  googlePlaceId?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}
