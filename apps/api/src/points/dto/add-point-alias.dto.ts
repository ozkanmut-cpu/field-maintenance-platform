import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AddPointAliasDto {
  @IsUUID()
  adminUserId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  alias!: string;
}
