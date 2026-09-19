/** Optional provider failures must not hide otherwise usable replay panels. */
export async function optionalData<T>(
  label: string,
  request: Promise<T[]>,
  warnings: string[],
): Promise<T[]> {
  try {
    return await request;
  } catch {
    warnings.push(label);
    return [];
  }
}
