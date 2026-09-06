import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file
config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  CLIENT_ID: z.string().min(1, 'CLIENT_ID is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.format();
    console.error('❌ Environment validation failed:');
    for (const [key, value] of Object.entries(errors)) {
      if (key === '_errors') continue;
      const fieldErrors = value as { _errors: string[] };
      if (fieldErrors._errors?.length) {
        console.error(`  ${key}: ${fieldErrors._errors.join(', ')}`);
      }
    }
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
