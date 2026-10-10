import { defaultExperiencePreferences, experiencePreferencesSchema, hasPlaybackPreferences, type ExperiencePatch, type ExperienceResponse } from '@consumit/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { ApiError } from '../http/errors.ts'

export interface ExperienceRepository {
  read(memberId: string): Promise<ExperienceResponse>
  patch(memberId: string, patch: ExperiencePatch): Promise<ExperienceResponse>
}

export function createExperienceRepository(prisma: PrismaClient): ExperienceRepository {
  return {
    async read(memberId) {
      const rows = await prisma.$queryRaw<{ preferences: unknown }[]>`SELECT "preferences" FROM "ExperiencePreference" WHERE "memberId"=${memberId}`
      return { preferences: rows[0] ? experiencePreferencesSchema.parse(rows[0].preferences) : defaultExperiencePreferences(), saved: rows.length > 0 }
    },
    async patch(memberId, patch) {
      return prisma.$transaction(async tx => {
        // Same member lock as account tombstoning: a deleted account cannot be recreated by a late preference write.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`
        if (!await tx.member.findFirst({ where: { id: memberId, status: 'ACTIVE' } })) throw new ApiError('UNAUTHENTICATED', 'Sign in to save your preferences.')
        const rows = await tx.$queryRaw<{ preferences: unknown }[]>`SELECT "preferences" FROM "ExperiencePreference" WHERE "memberId"=${memberId}`
        const preferences = experiencePreferencesSchema.parse({ ...(rows[0] ? experiencePreferencesSchema.parse(rows[0].preferences) : defaultExperiencePreferences()), ...patch, ...(hasPlaybackPreferences(patch) ? { playbackConfigured: true } : {}) })
        const encoded = JSON.stringify(preferences)
        await tx.$executeRaw`INSERT INTO "ExperiencePreference" ("memberId","preferences","updatedAt") VALUES (${memberId},${encoded}::jsonb,NOW())
          ON CONFLICT ("memberId") DO UPDATE SET "preferences"=EXCLUDED."preferences","updatedAt"=NOW()`
        return { preferences, saved: true }
      })
    },
  }
}
