import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: process.env.DATABASE_URL.startsWith('postgres') ? 'postgresql' : 'sqlite',
  dbCredentials: process.env.DATABASE_URL.startsWith('postgres')
    ? { url: process.env.DATABASE_URL }
    : { url: process.env.DATABASE_URL.replace('file:', '') }
});