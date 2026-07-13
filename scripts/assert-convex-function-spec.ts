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

const specPath = Bun.argv[2]
if (specPath === undefined) {
  throw new Error(
    'usage: bun scripts/assert-convex-function-spec.ts <function-spec.json>',
  )
}

const spec = (await Bun.file(specPath).json()) as SpecDocument
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
