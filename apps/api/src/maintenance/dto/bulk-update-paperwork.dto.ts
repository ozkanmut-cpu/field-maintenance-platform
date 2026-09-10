import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { UpdatePaperworkDto } from './update-paperwork.dto';

export class BulkUpdatePaperworkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => UpdatePaperworkDto)
  items!: UpdatePaperworkDto[];
}
