import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetHelpTargetsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  targetIds!: string[];
}
