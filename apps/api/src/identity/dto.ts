import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class OnboardOrganizationDto {
  @IsString()
  @Length(2, 160)
  organizationName!: string;

  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  organizationSlug!: string;

  @IsString()
  @Length(2, 120)
  displayName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Length(3, 80)
  organizationSlug!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class RegisterPasskeyDto {
  @IsObject()
  response!: object;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

export class VerifyStepUpDto {
  @IsObject()
  response!: object;
}
