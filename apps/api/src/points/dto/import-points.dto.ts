import { IsArray } from 'class-validator';

export class ImportPointsDto {
  @IsArray()
  rows!: Array<Record<string, unknown>>;
}
