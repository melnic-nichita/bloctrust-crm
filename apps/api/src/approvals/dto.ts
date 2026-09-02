import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SubmitInvoiceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class ApprovalDecisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  approvalVersion!: number;

  @IsIn(['APPROVE', 'REJECT'])
  outcome!: 'APPROVE' | 'REJECT';

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class UpdateRiskPolicyDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  mediumThreshold?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10_000)
  highThreshold?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  changedBankAccountScore?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  duplicateHashScore?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  duplicateInvoiceNumberScore?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  contractLimitScore?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  amountSpikeScore?: number;
}
