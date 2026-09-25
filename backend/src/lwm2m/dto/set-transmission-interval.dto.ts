import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class SetTransmissionIntervalDto {
  @ApiProperty({ example: 30, minimum: 15, maximum: 86_400 })
  @IsInt()
  @Min(15)
  @Max(86_400)
  value!: number;
}
