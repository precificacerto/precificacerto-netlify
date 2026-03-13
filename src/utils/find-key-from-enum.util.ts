export function findKeyFromEnum<T extends string>(
  enumObj: Record<T, string>,
  value: string
): T | undefined {
  const keys = Object.keys(enumObj) as T[]

  for (const key of keys) {
    if (enumObj[key] === value) {
      return key
    }
  }
  return undefined
}
