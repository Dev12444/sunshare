/**
 * Prisma client singleton — Rahi.
 *
 * Next.js hot-reloads route modules in dev; without the global cache each
 * reload opens a fresh pool and Neon starts refusing connections mid-build.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
