import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class ClaimRecheckActionDto {
  @ApiProperty({
    description: '家属认领的动作类型',
    example: 'booking',
    enum: ['booking', 'visit', 'reminder'],
  })
  @IsString()
  @IsIn(['booking', 'visit', 'reminder'])
  actionType: 'booking' | 'visit' | 'reminder';
}
