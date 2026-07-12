#!/usr/bin/env node
import { runCli } from './commands.js';

runCli(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(2);
});
