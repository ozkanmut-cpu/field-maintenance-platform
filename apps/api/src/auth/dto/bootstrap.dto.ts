import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class BootstrapDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
