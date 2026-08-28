import { SetMetadata } from '@nestjs/common';

export const STEP_UP_REQUIRED = 'bloctrust.step-up-required';
export const RequireRecentStepUp = (): MethodDecorator & ClassDecorator =>
  SetMetadata(STEP_UP_REQUIRED, true);
