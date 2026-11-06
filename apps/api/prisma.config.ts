import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` (build de imagem) não acessa o banco; migrate/seed exigem DATABASE_URL real
    url: process.env.DATABASE_URL ?? 'postgresql://indefinido:indefinido@localhost:5432/indefinido',
  },
});
