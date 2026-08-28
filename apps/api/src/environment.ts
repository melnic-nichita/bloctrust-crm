import { config } from 'dotenv';
import { resolve } from 'node:path';

// Package scripts run with apps/api as their working directory. Resolve the
// workspace-level environment file from this module so dev, build output, and
// integration tests all load the same configuration.
config({
  path: resolve(__dirname, '../../../.env'),
  quiet: true,
});
