import { Body, Controller, Header, Headers, Post } from '@nestjs/common';
import { Public } from '../common/public.decorator.js';
import { FakeBankWebhookDto } from './dto.js';
import { FakeBankService } from './fake-bank.service.js';

@Controller('integrations/fake-bank')
export class FakeBankController {
  constructor(private readonly fakeBank: FakeBankService) {}

  @Post('webhooks')
  @Public()
  @Header('Cache-Control', 'no-store')
  webhook(
    @Body() payload: FakeBankWebhookDto,
    @Headers('x-fake-bank-timestamp') timestamp: string | undefined,
    @Headers('x-fake-bank-signature') signature: string | undefined,
  ) {
    return this.fakeBank.process(payload, timestamp, signature);
  }
}
