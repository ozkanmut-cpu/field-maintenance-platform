import { PaperworkKind, PaperworkStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdatePaperworkDto {
  @IsUUID()
  visitId!: string;

  @IsUUID()
  adminUserId!: string;

  @IsEnum(PaperworkKind)
  kind!: PaperworkKind;

  @IsEnum(PaperworkStatus)
  status!: PaperworkStatus;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}
