export interface CanonicalVector {
  readonly name: string
  readonly value: unknown
  readonly canonical: string
}

/** Shared adversarial corpus consumed unchanged by Bun, Node, Web, Expo, and Convex tests. */
export const CANONICAL_VECTORS: readonly CanonicalVector[] = Object.freeze([
  { name: 'ascii-order', value: { b: 2, a: 1 }, canonical: '{"a":1,"b":2}' },
  { name: 'utf16-order', value: { 'ä': 1, z: 2, '😀': 3, '🌍': 4 }, canonical: '{"z":2,"ä":1,"🌍":4,"😀":3}' },
  { name: 'undefined-omitted', value: { keep: [1, null, '雪'], omit: undefined }, canonical: '{"keep":[1,null,"雪"]}' },
  { name: 'sha-padding-55', value: { text: 'x'.repeat(44) }, canonical: `{"text":"${'x'.repeat(44)}"}` },
  { name: 'sha-padding-56', value: { text: 'x'.repeat(45) }, canonical: `{"text":"${'x'.repeat(45)}"}` },
  { name: 'sha-multiblock', value: { text: 'λ'.repeat(80) }, canonical: `{"text":"${'λ'.repeat(80)}"}` },
])
