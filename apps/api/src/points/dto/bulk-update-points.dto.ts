import { PointStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export enum BulkPointAction {
  SET_REGION = 'SET_REGION',
  SET_STATUS = 'SET_STATUS',
  SET_STANDARD_WEEK = 'SET_STANDARD_WEEK',
  SET_SMARTCLEAN = 'SET_SMARTCLEAN',
}

export class BulkUpdatePointsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  pointIds!: string[];

  @IsEnum(BulkPointAction)
  action!: BulkPointAction;

  @ValidateIf((o) => o.action === BulkPointAction.SET_REGION)
  @IsUUID()
  regionId?: string;

  @ValidateIf((o) => o.action === BulkPointAction.SET_STATUS)
  @IsEnum(PointStatus)
  status?: PointStatus;

  @ValidateIf((o) => o.action === BulkPointAction.SET_STANDARD_WEEK || o.action === BulkPointAction.SET_SMARTCLEAN)
  @IsInt()
  @Min(1)
  @Max(2)
  maintenanceWeek?: number;

  @ValidateIf((o) => o.action === BulkPointAction.SET_SMARTCLEAN)
  @IsDateString()
  smartcleanReferenceAt?: string;
}
