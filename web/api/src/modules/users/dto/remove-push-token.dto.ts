import { IsString } from 'class-validator';

export class RemovePushTokenDto {
  @IsString()
  token: string;
}
