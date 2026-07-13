type Validator = {
  type: string
  value?: unknown
}

type FunctionSpec = {
  identifier: string
  visibility: { kind: 'public' | 'internal' }
  args: Validator
  returns: Validator
}

type SpecDocument = {
  functions: FunctionSpec[]
}

export {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSpecDocument(value: unknown): SpecDocument {
  if (!isRecord(value) || !Array.isArray(value.functions)) {
    throw new Error('malformed function spec: expected a functions array')
  }
  for (const [index, fn] of value.functions.entries()) {
    if (
      !isRecord(fn)
      || typeof fn.identifier !== 'string'
      || !isRecord(fn.visibility)
      || (fn.visibility.kind !== 'public' && fn.visibility.kind !== 'internal')
      || !isRecord(fn.args)
      || typeof fn.args.type !== 'string'
      || !isRecord(fn.returns)
      || typeof fn.returns.type !== 'string'
    ) {
      throw new Error(`malformed function spec: invalid function at index ${index}`)
    }
  }
  return value as unknown as SpecDocument
}

const specPath = Bun.argv[2]
if (specPath === undefined) {
  throw new Error(
    'usage: bun scripts/assert-convex-function-spec.ts <function-spec.json>',
  )
}

let decoded: unknown
try {
  decoded = await Bun.file(specPath).json()
} catch (error) {
  throw new Error(
    `malformed function spec: ${error instanceof Error ? error.message : String(error)}`,
  )
}
const spec = parseSpecDocument(decoded)
const incomplete = spec.functions.filter(
  (fn) =>
    JSON.stringify(fn.args).includes('"type":"any"') ||
    JSON.stringify(fn.returns).includes('"type":"any"'),
)
if (incomplete.length > 0) {
  throw new Error(
    `functions missing complete validators: ${incomplete
      .map((fn) => fn.identifier)
      .join(', ')}`,
  )
}

const protectedFunctions = spec.functions.filter(
  (fn) =>
    fn.visibility.kind === 'public' &&
    (fn.identifier === 'commands.js:submit' ||
      fn.identifier === 'commands.js:cancel' ||
      fn.identifier.startsWith('worker.js:')),
)
const expectedProtectedFunctions = 12
if (protectedFunctions.length !== expectedProtectedFunctions) {
  throw new Error(
    `expected ${expectedProtectedFunctions} public worker/submit/cancel functions, found ${protectedFunctions.length}`,
  )
}

const forbiddenBookkeepingClocks = new Set([
  'now',
  'timestamp',
  'currentTime',
  'createdAt',
  'updatedAt',
  'startedAt',
  'finishedAt',
  'cancelledAt',
  'claimedAt',
  'eventAt',
])
const publicFunctions = spec.functions.filter(
  (fn) => fn.visibility.kind === 'public',
)
const clockViolations = publicFunctions.flatMap((fn) => {
  if (fn.args.type !== 'object' || typeof fn.args.value !== 'object') {
    return [`${fn.identifier}: non-object argument validator`]
  }
  return Object.keys(fn.args.value ?? {})
    .filter((key) => forbiddenBookkeepingClocks.has(key))
    .map((key) => `${fn.identifier}:${key}`)
})
if (clockViolations.length > 0) {
  throw new Error(
    `caller-controlled bookkeeping clocks remain: ${clockViolations.join(', ')}`,
  )
}

console.log(
  JSON.stringify({
    ok: true,
    functions: spec.functions.length,
    completeValidators: spec.functions.length,
    publicFunctions: publicFunctions.length,
    protectedFunctions: protectedFunctions.length,
    bookkeepingClockArgs: 0,
  }),
)
