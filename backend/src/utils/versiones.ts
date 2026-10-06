/**
 * Compara versiones con formato numérico (p. ej. "1.2.0", "3.0.1").
 * Devuelve > 0 si `a` es mayor, < 0 si es menor y 0 si son iguales.
 * Compara por partes (1.10.0 > 1.9.0), no como texto.
 */
export function compararVersiones(a: string, b: string): number {
  const partesA = a.trim().split('.').map((n) => parseInt(n, 10) || 0);
  const partesB = b.trim().split('.').map((n) => parseInt(n, 10) || 0);
  const largo = Math.max(partesA.length, partesB.length);
  for (let i = 0; i < largo; i++) {
    const diferencia = (partesA[i] ?? 0) - (partesB[i] ?? 0);
    if (diferencia !== 0) return diferencia;
  }
  return 0;
}
