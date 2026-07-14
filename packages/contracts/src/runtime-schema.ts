export interface RuntimeSchema<T> {
  validate(value: unknown): value is T
}

type InferSchema<Schema> = Schema extends RuntimeSchema<infer Value> ? Value : never

export const runtimeSchema = {
  string: { validate: (value: unknown): value is string => typeof value === 'string' },
  number: { validate: (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) },
  boolean: { validate: (value: unknown): value is boolean => typeof value === 'boolean' },
  literal<const Value extends string | number | boolean | null>(literal: Value): RuntimeSchema<Value> {
    return { validate: (value: unknown): value is Value => value === literal }
  },
  optional<Value>(inner: RuntimeSchema<Value>): RuntimeSchema<Value | undefined> {
    return { validate: (value: unknown): value is Value | undefined => value === undefined || inner.validate(value) }
  },
  array<Value>(inner: RuntimeSchema<Value>): RuntimeSchema<Value[]> {
    return { validate: (value: unknown): value is Value[] => Array.isArray(value) && value.every((item) => inner.validate(item)) }
  },
  union<const Schemas extends readonly RuntimeSchema<unknown>[]>(...schemas: Schemas): RuntimeSchema<InferSchema<Schemas[number]>> {
    return { validate: (value: unknown): value is InferSchema<Schemas[number]> => schemas.some((schema) => schema.validate(value)) }
  },
  object<const Shape extends Readonly<Record<string, RuntimeSchema<unknown>>>>(
    shape: Shape,
  ): RuntimeSchema<{ [Key in keyof Shape]: InferSchema<Shape[Key]> }> {
    const keys = Object.keys(shape)
    const allowed = new Set(keys)
    return {
      validate(value: unknown): value is { [Key in keyof Shape]: InferSchema<Shape[Key]> } {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
        const record = value as Record<string, unknown>
        return Object.keys(record).every((key) => allowed.has(key))
          && keys.every((key) => shape[key]!.validate(record[key]))
      },
    }
  },
} as const

export function assertRuntimeSchema<T>(schema: RuntimeSchema<T>, value: unknown, label: string): asserts value is T {
  if (!schema.validate(value)) throw new Error(`invalid ${label}`)
}
