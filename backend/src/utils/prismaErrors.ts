/** Código de Prisma para violación de restricción única (P2002), p. ej. documento o usuario repetido */
export function esViolacionUnicidad(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}
