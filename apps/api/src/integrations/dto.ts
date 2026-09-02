import { IsIn, IsUUID } from 'class-validator';

export class FakeBankWebhookDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  organizationId!: string;

  @IsUUID()
  vendorId!: string;

  @IsUUID()
  bankAccountVersionId!: string;

  @IsIn(['PENDING', 'VERIFIED', 'REJECTED'])
  status!: 'PENDING' | 'VERIFIED' | 'REJECTED';
}
