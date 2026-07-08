import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  datasource: {
    // CLI operations (migrate, db push, generate) always use the direct connection.
    // App runtime uses DATABASE_URL (pooled) via the pg adapter in prisma.service.ts.
    url: process.env.DIRECT_URL!,
  },
});
