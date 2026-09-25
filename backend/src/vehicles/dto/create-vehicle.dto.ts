import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty({ example: 'Vehículo Norte' })
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'heltec-norte-01' })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, {
    message: 'deviceId debe usar minúsculas, números y guiones',
  })
  deviceId!: string;

  @ApiPropertyOptional({ example: '70B3D57ED0061234' })
  @Transform(({ value }) =>
    value === null || value === undefined || value === ''
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  @IsOptional()
  @Matches(/^[0-9A-F]{16}$/, {
    message: 'devEui debe contener 16 caracteres hexadecimales',
  })
  devEui?: string;

  @ApiProperty({ example: 'Heltec WiFi LoRa 32 V3' })
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model!: string;

  @ApiPropertyOptional({ example: 'Vehículo de pruebas del laboratorio' })
  @Transform(({ value }) =>
    value === null || value === undefined ? undefined : String(value).trim(),
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
