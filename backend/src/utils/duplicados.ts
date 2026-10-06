import { normalizeText, levenshteinAcotada } from './textUtils';

export interface MotivoDuplicado {
  razon: string;
  nivel: 'high' | 'medium';
}

/**
 * Regla ÚNICA de posible duplicado. La usan el aviso que ve el encuestador al sincronizar
 * y la bandeja de duplicados del admin: así toda advertencia que vio el encuestador aparece también en la bandeja.
 * Devuelve null si los dos registros no son posibles duplicados.
 */
export function motivoPosibleDuplicado(docA: string, nombreA: string, docB: string, nombreB: string): MotivoDuplicado | null {
  const a = (docA || '').trim();
  const b = (docB || '').trim();
  const na = normalizeText(nombreA);
  const nb = normalizeText(nombreB);

  // 1. Cédula igual o con 1 o 2 caracteres de diferencia
  if (a && b) {
    if (a === b) return { razon: 'Mismo número de documento de identidad exacto', nivel: 'high' };
    const dist = levenshteinAcotada(a, b, 2);
    if (dist <= 2) {
      return {
        razon: `Documento difiere en ${dist} carácter(es) (posible error de digitación)`,
        nivel: dist === 1 ? 'high' : 'medium',
      };
    }
  }

  // 2. Nombre completo idéntico con cédula diferente
  if (na.length > 3 && na === nb) {
    return { razon: 'Nombre completo idéntico con documento diferente', nivel: 'high' };
  }

  // 3. Nombre muy parecido (hasta 3 caracteres de diferencia)
  if (na.length > 5 && nb.length > 5) {
    const dist = levenshteinAcotada(na, nb, 3);
    if (dist <= 3) {
      return { razon: `Nombre muy similar (${dist} carácter(es) de diferencia)`, nivel: 'medium' };
    }
  }

  return null;
}
