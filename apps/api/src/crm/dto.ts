import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  BankAccountVerificationStatus,
  ContractStatus,
  VendorStatus,
} from '../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const lower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class PageQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;
}

export class VendorPageQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @IsOptional()
  @IsUUID()
  buildingId?: string;
}

export class ContractPageQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;
}

export class AuditPageQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^(VENDOR|CONTRACT|BANK_ACCOUNT)$/u)
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class CreateBuildingDto {
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  name!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 200)
  addressLine1!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @Transform(trim)
  @IsString()
  @Length(2, 120)
  city!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 24)
  postalCode!: string;

  @Transform(upper)
  @Matches(/^[A-Z]{2}$/u)
  countryCode!: string;
}

export class UpdateBuildingDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  addressLine1?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  city?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 24)
  postalCode?: string;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/u)
  countryCode?: string;
}

export class CreateApartmentDto {
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  unitNumber!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  floor?: string;
}

export class GrantBuildingAccessDto {
  @IsUUID()
  membershipId!: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class CreateOccupancyDto {
  @IsUUID()
  membershipId!: string;

  @IsDateString()
  startsOn!: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string;
}

export class CreateVendorDto {
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  legalName!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  tradingName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  registrationNumber?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @IsOptional()
  @Transform(lower)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  tags?: string[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  buildingIds?: string[];
}

export class UpdateVendorDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  legalName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  tradingName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  registrationNumber?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @IsOptional()
  @Transform(lower)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  tags?: string[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  buildingIds?: string[];
}

export class CreateVendorContactDto {
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @Transform(lower)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}

export class CreateBankAccountVersionDto {
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  accountHolder!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  bankName?: string;

  @Transform(upper)
  @Matches(/^[A-Z]{2}$/u)
  countryCode!: string;

  @Transform(upper)
  @Matches(/^[A-Z0-9][A-Z0-9 -]{5,63}$/u)
  accountNumber!: string;
}

export class VerifyBankAccountDto {
  @IsEnum(BankAccountVerificationStatus)
  status!: BankAccountVerificationStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  evidenceReference?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RevealBankAccountDto {
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class CreateContractDto {
  @IsUUID()
  vendorId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 80)
  reference!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 200)
  title!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 120)
  serviceCategory!: string;

  @IsOptional()
  @Matches(/^\d{1,17}(?:\.\d{1,2})?$/u)
  valueLimit?: string;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/u)
  currency?: string;

  @IsDateString()
  startsOn!: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  documentReference?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  buildingIds!: string[];
}

export class UpdateContractDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  reference?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  serviceCategory?: string;

  @IsOptional()
  @Matches(/^\d{1,17}(?:\.\d{1,2})?$/u)
  valueLimit?: string;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/u)
  currency?: string;

  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  documentReference?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  buildingIds?: string[];
}
