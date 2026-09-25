import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetBooleanDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  value!: boolean;
}
