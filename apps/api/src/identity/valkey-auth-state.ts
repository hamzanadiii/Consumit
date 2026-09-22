import { Valkey } from 'iovalkey'
import { z } from 'zod'

import {
  CHALLENGE_COOLDOWN_MS,
  CHALLENGE_MAX_ATTEMPTS,
  CHALLENGE_TTL_MS,
  MAX_MEMBER_SESSIONS,
  challengeCodeHash,
  challengeLookup,
  type AuthChallenge,
  type AuthStateStore,
  type RegistrationChallenge,
  type SessionRecord,
} from './auth-state.ts'
import { IdentityError } from './errors.ts'
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_TTL_MS,
  hashSessionToken,
  newSessionToken,
} from './session.ts'

const keyPrefix = 'consumit:auth:v1:'
const sessionPrefix = `${keyPrefix}session:`
const usernameReservationPrefix = `${keyPrefix}username:`

const storedChallengeSchema = z.object({
  attempts: z.number().int().nonnegative(),
  codeHash: z.string().length(64),
  createdAt: z.number().int().nonnegative(),
  payload: z.discriminatedUnion('kind', [
    z.object({ email: z.string(), kind: z.literal('registration'), passwordHash: z.string(), username: z.string() }),
    z.object({ kind: z.literal('recovery'), memberId: z.string() }),
  ]),
})

const storedSessionSchema = z.object({
  absoluteExpiresAt: z.number().int().positive(),
  authVersion: z.number().int().positive(),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  lastSeenAt: z.number().int().positive(),
  memberId: z.string().min(1),
})

const beginChallengeLua = `
local current = redis.call('GET', KEYS[1])
if current then
  local parsed = cjson.decode(current)
  if tonumber(parsed.createdAt) + tonumber(ARGV[2]) > tonumber(ARGV[3]) then return 0 end
end
if ARGV[5] == '1' then
  local owner = redis.call('GET', KEYS[2])
  if owner and owner ~= ARGV[6] then return -1 end
  if current then
    local parsed = cjson.decode(current)
    if parsed.payload.kind == 'registration' and parsed.payload.username ~= ARGV[8] then
      local oldKey = ARGV[7] .. parsed.payload.username
      if redis.call('GET', oldKey) == ARGV[6] then redis.call('DEL', oldKey) end
    end
  end
  redis.call('SET', KEYS[2], ARGV[6], 'PX', ARGV[4])
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[4])
return 1
`

const consumeChallengeLua = `
local function release(parsed)
  if parsed.payload.kind == 'registration' then
    local key = ARGV[3] .. parsed.payload.username
    if redis.call('GET', key) == ARGV[4] then redis.call('DEL', key) end
  end
end
local current = redis.call('GET', KEYS[1])
if not current then return nil end
local parsed = cjson.decode(current)
if parsed.codeHash ~= ARGV[1] then
  parsed.attempts = tonumber(parsed.attempts) + 1
  if parsed.attempts >= tonumber(ARGV[2]) then
    release(parsed)
    redis.call('DEL', KEYS[1])
  else
    local ttl = redis.call('PTTL', KEYS[1])
    if ttl > 0 then redis.call('SET', KEYS[1], cjson.encode(parsed), 'PX', ttl) end
  end
  return nil
end
release(parsed)
redis.call('DEL', KEYS[1])
return current
`

const issueSessionLua = `
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[4], ARGV[1])
redis.call('PEXPIRE', KEYS[2], ARGV[5])
local overflow = redis.call('ZCARD', KEYS[2]) - tonumber(ARGV[6])
if overflow > 0 then
  local old = redis.call('ZRANGE', KEYS[2], 0, overflow - 1)
  for _, hash in ipairs(old) do redis.call('DEL', ARGV[7] .. hash) end
  redis.call('ZREMRANGEBYRANK', KEYS[2], 0, overflow - 1)
end
return 1
`

const readSessionLua = `
local current = redis.call('GET', KEYS[1])
if not current then return nil end
local parsed = cjson.decode(current)
local now = tonumber(ARGV[1])
if tonumber(parsed.expiresAt) <= now or tonumber(parsed.absoluteExpiresAt) <= now then
  redis.call('DEL', KEYS[1])
  return nil
end
if tonumber(parsed.expiresAt) - now < tonumber(ARGV[2]) / 2 then
  parsed.expiresAt = math.min(now + tonumber(ARGV[2]), tonumber(parsed.absoluteExpiresAt))
  parsed.lastSeenAt = now
  redis.call('SET', KEYS[1], cjson.encode(parsed), 'PX', parsed.expiresAt - now)
  return cjson.encode(parsed)
end
return current
`

const revokeSessionLua = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local parsed = cjson.decode(current)
redis.call('DEL', KEYS[1])
redis.call('ZREM', ARGV[1] .. parsed.memberId, ARGV[2])
return 1
`

const revokeAllLua = `
local hashes = redis.call('ZRANGE', KEYS[1], 0, -1)
for _, hash in ipairs(hashes) do redis.call('DEL', ARGV[1] .. hash) end
redis.call('DEL', KEYS[1])
return #hashes
`

function sessionRecord(value: z.infer<typeof storedSessionSchema>): SessionRecord {
  return {
    absoluteExpiresAt: new Date(value.absoluteExpiresAt),
    authVersion: value.authVersion,
    createdAt: new Date(value.createdAt),
    expiresAt: new Date(value.expiresAt),
    lastSeenAt: new Date(value.lastSeenAt),
    memberId: value.memberId,
  }
}

function stateFailure(error: unknown): IdentityError {
  return error instanceof IdentityError
    ? error
    : new IdentityError('AUTH_STATE_UNAVAILABLE', 'Authentication state is temporarily unavailable.', { cause: error, retryable: true })
}

export function createValkeyAuthState(url: string, codePepper: string): AuthStateStore {
  const client = new Valkey(url, {
    commandTimeout: 3_000,
    connectTimeout: 3_000,
    enableAutoPipelining: true,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  })
  client.on('error', () => {})
  // The first auth request can arrive before the socket is ready. Share the
  // initial handshake without queuing commands across later outages.
  const ready = client.connect()
  void ready.catch(() => undefined)

  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      if (client.status !== 'ready') await ready
      return await work()
    } catch (error) {
      throw stateFailure(error)
    }
  }

  function challengeKey(purpose: AuthChallenge['kind'], email: string) {
    return `${keyPrefix}challenge:${purpose}:${challengeLookup(codePepper, purpose, email)}`
  }

  function memberSessionsKey(memberId: string) {
    return `${keyPrefix}member-sessions:${memberId}`
  }

  function reservationOwner(email: string) {
    return challengeLookup(codePepper, 'registration', email)
  }

  function usernameReservationKey(username: string) {
    return `${usernameReservationPrefix}${username}`
  }

  return {
    beginChallenge: (input) => run(async () => {
      const now = Date.now()
      const stored = {
        attempts: 0,
        codeHash: challengeCodeHash(codePepper, input.purpose, input.email, input.code),
        createdAt: now,
        payload: input.payload,
      }
      const result = await client.eval(
        beginChallengeLua,
        2,
        challengeKey(input.purpose, input.email),
        input.payload.kind === 'registration' ? usernameReservationKey(input.payload.username) : `${keyPrefix}unused`,
        JSON.stringify(stored),
        CHALLENGE_COOLDOWN_MS,
        now,
        CHALLENGE_TTL_MS,
        input.payload.kind === 'registration' ? '1' : '0',
        reservationOwner(input.email),
        usernameReservationPrefix,
        input.payload.kind === 'registration' ? input.payload.username : '',
      )
      return Number(result) === 1 ? 'stored' : Number(result) === -1 ? 'username-unavailable' : 'cooldown'
    }),
    async close() {
      try {
        await client.quit()
      } catch {
        client.disconnect()
      }
    },
    consumeChallenge: (input) => run(async () => {
      const raw = await client.eval(
        consumeChallengeLua,
        1,
        challengeKey(input.purpose, input.email),
        challengeCodeHash(codePepper, input.purpose, input.email, input.code),
        CHALLENGE_MAX_ATTEMPTS,
        usernameReservationPrefix,
        reservationOwner(input.email),
      )
      if (typeof raw !== 'string') return null
      const parsed = storedChallengeSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data.payload : null
    }),
    health: () => run(async () => (await client.ping()) === 'PONG'),
    issueSession: (input) => run(async () => {
      const token = newSessionToken()
      const hash = hashSessionToken(token)
      const now = Date.now()
      const value = {
        absoluteExpiresAt: now + SESSION_ABSOLUTE_TTL_MS,
        authVersion: input.authVersion,
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
        lastSeenAt: now,
        memberId: input.memberId,
      }
      await client.eval(
        issueSessionLua,
        2,
        `${sessionPrefix}${hash}`,
        memberSessionsKey(input.memberId),
        hash,
        JSON.stringify(value),
        SESSION_TTL_MS,
        now,
        SESSION_ABSOLUTE_TTL_MS,
        MAX_MEMBER_SESSIONS,
        sessionPrefix,
      )
      return { record: sessionRecord(value), token }
    }),
    isUsernameReserved: (username) => run(async () => (await client.exists(usernameReservationKey(username))) === 1),
    pendingRegistration: (email) => run(async () => {
      const raw = await client.get(challengeKey('registration', email))
      if (!raw) return null
      const parsed = storedChallengeSchema.safeParse(JSON.parse(raw))
      return parsed.success && parsed.data.payload.kind === 'registration'
        ? parsed.data.payload as RegistrationChallenge
        : null
    }),
    readSession: (token) => run(async () => {
      const hash = hashSessionToken(token)
      const raw = await client.eval(readSessionLua, 1, `${sessionPrefix}${hash}`, Date.now(), SESSION_TTL_MS)
      if (typeof raw !== 'string') return null
      const parsed = storedSessionSchema.safeParse(JSON.parse(raw))
      return parsed.success ? sessionRecord(parsed.data) : null
    }),
    revokeMemberSessions: (memberId) => run(async () => {
      await client.eval(revokeAllLua, 1, memberSessionsKey(memberId), sessionPrefix)
    }),
    revokeSession: (token) => run(async () => {
      const hash = hashSessionToken(token)
      await client.eval(revokeSessionLua, 1, `${sessionPrefix}${hash}`, `${keyPrefix}member-sessions:`, hash)
    }),
  }
}
