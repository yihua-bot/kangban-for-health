import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BindFamilyDto {
  @ApiProperty({ description: '家属账号（邮箱或手机号）' })
  @IsOptional()
  @IsString()
  familyAccount?: string;

  @ApiProperty({ description: '兼容旧版：家属手机号', required: false })
  @IsOptional()
  @IsString()
  familyPhone?: string;

  @ApiProperty({ description: '关系', example: '子女' })
  @IsString()
  @IsNotEmpty()
  relationship: string; // 子女/配偶/其他

  @ApiProperty({ description: '家属验证码', example: '1888' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
