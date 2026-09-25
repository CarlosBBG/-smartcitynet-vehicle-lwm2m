import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateVehicleDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => String(value).trim())
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) =>
    value === null || value === '' ? null : String(value).trim().toUpperCase(),
  )
  @IsOptional()
  @Matches(/^[0-9A-F]{16}$/, {
    message: 'devEui debe contener 16 caracteres hexadecimales',
  })
  devEui?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => String(value).trim())
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => (value === null ? null : String(value).trim()))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
