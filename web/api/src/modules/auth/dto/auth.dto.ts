import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsPhoneNumber,
  Length,
} from 'class-validator';

export class RegisterDto {
  @IsPhoneNumber('CN')
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  age?: number;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  account: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class SendLoginCodeDto {
  @IsPhoneNumber('CN')
  @IsNotEmpty()
  phone: string;
}

export class SendEmailLoginCodeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class CodeLoginDto {
  @IsPhoneNumber('CN')
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 6)
  code: string;
}

export class EmailCodeLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 6)
  code: string;
}

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  account: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
