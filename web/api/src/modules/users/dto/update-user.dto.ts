import { IsString, IsOptional, IsInt, IsArray, IsBoolean } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @IsOptional()
  age?: number;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  healthTags?: string[];

  @IsBoolean()
  @IsOptional()
  notifyAbnormal?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyMedication?: boolean;

  @IsBoolean()
  @IsOptional()
  voiceReminder?: boolean;
}
