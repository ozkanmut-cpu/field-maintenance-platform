import { IsInt, Min } from 'class-validator';

export class UpdatePointEquipmentDto {
  @IsInt() @Min(0) coolerCount!: number;
  @IsInt() @Min(0) towerCount!: number;
  @IsInt() @Min(0) tapCount!: number;
  @IsInt() @Min(0) smarttapCount!: number;
}
