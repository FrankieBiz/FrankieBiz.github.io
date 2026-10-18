/**
 * Resolves to `promise`'s value, or to `fallback` if it rejects or takes longer than
 * `ms`. For optional boot steps (lazy chunks, the asset manifest) that must never
 * leave the loader hanging or take the 3D scene down with them.
 */
export function within<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}
