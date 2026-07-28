/** Convert a user-facing seed into the unsigned 32-bit value used by generation. */
export function normalizeSeed(seed: number | string): number {
  if (typeof seed === "number") return seed >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return mix32(hash);
}

/** A stable integer mixer. Generation never uses Math.random or mutable PRNG state. */
export function mix32(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

export function hashIntegers(seed: number, ...values: readonly number[]): number {
  let hash = mix32(seed);
  for (const value of values) hash = mix32(hash ^ mix32(value | 0));
  return hash;
}

/** Random-access value in [0, 1); call order cannot affect its result. */
export function hashFloat(seed: number, ...values: readonly number[]): number {
  return hashIntegers(seed, ...values) / 0x1_0000_0000;
}
