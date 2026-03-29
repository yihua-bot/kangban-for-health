import { IsIn, IsOptional, IsString } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  token: string;

  @IsString()
  @IsOptional()
  @IsIn(['ios'])
  platform?: string;

  @IsString()
  @IsOptional()
  appBundleId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['production', 'sandbox'])
  environment?: string;

  @IsString()
  @IsOptional()
  deviceName?: string;
}
