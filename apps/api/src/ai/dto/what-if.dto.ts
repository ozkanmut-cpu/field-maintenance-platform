import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class WhatIfDto {
  @IsUUID() technicianId!: string;
  @IsOptional() @IsUUID() targetTechnicianId?: string;
  @IsOptional() @IsUUID() regionId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) standardCurrentDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) standardCarryoverDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) smartcleanCurrentDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) smartcleanCarryoverDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) coolerDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) towerDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) tapDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) smarttapDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) equipmentUnknownPointDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) locatedPointDelta?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) unlocatedPointDelta?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2_000_000) routeEstimateMeters?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2_000_000) fieldP90RadiusMeters?: number;
}
