import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  datasource: {
    // CLI operations always use the direct connection (no PgBouncer)
    url: process.env.DIRECT_URL!,
  },
});
