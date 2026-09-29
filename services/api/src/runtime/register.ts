// Loaded with `node --import ./src/runtime/register.ts` before the app starts.
import { register } from 'node:module';

register('./ts-resolve-hooks.ts', import.meta.url);
