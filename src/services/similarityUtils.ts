/**
 * similarityUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilidades para detectar posibles registros duplicados basándose en:
 *  1. Distancia de Levenshtein entre números de documento (≤ 2 → posible duplicado)
 *  2. Similitud de nombre completo normalizado (exacto o muy similar)
 *
 * Estas funciones corren 100 % en el cliente (sin red), por lo que funcionan
 * perfectamente en modo offline usando los datos del SQLite local.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SurveyLight {
  id?: number;
  documento_identidad: string;
  nombres: string;
  apellidos: string;
  tipo_documento?: string;
}

export interface SimilarityMatch {
  survey: SurveyLight;
  /** Razón principal por la que se marcó como posible duplicado */
  reason: string;
  /** Nivel de alerta: 'high' = casi seguro duplicado, 'medium' = sospechoso */
  level: 'high' | 'medium';
}

// ─── Distancia de Levenshtein ─────────────────────────────────────────────────

/**
 * Calcula la distancia de edición (Levenshtein) entre dos strings.
 * Complejidad: O(m × n) — aceptable para strings cortos como cédulas.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // sustitución
          matrix[i][j - 1] + 1,     // inserción
          matrix[i - 1][j] + 1      // eliminación
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ─── Normalización de texto ───────────────────────────────────────────────────

/**
 * Normaliza un texto para comparación:
 *  - Minúsculas
 *  - Sin tildes / diacríticos
 *  - Sin espacios múltiples (colapsados a uno)
 *  - Trim
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // eliminar diacríticos
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Verificador de similitud principal ──────────────────────────────────────

/**
 * Compara una nueva encuesta (aún no guardada) contra un listado de encuestas
 * existentes y devuelve los posibles duplicados con su motivo.
 *
 * @param newDoc      Número de documento que se intenta registrar
 * @param newNombres  Nombres del nuevo registro
 * @param newApellidos Apellidos del nuevo registro
 * @param existing    Lista de encuestas existentes a comparar
 * @returns           Array de posibles coincidencias (vacío = sin duplicados)
 */
export function checkSimilarity(
  newDoc: string,
  newNombres: string,
  newApellidos: string,
  existing: SurveyLight[]
): SimilarityMatch[] {
  const matches: SimilarityMatch[] = [];
  const docNorm = newDoc.trim();
  const fullNameNorm = normalizeText(`${newNombres} ${newApellidos}`);

  for (const survey of existing) {
    const existingDocNorm = survey.documento_identidad.trim();

    // Saltar coincidencias exactas (ya las maneja la búsqueda de duplicado exacto)
    if (existingDocNorm === docNorm) continue;

    const docDistance = levenshtein(docNorm, existingDocNorm);
    const existingFullName = normalizeText(`${survey.nombres} ${survey.apellidos}`);
    const nameDistance = levenshtein(fullNameNorm, existingFullName);

    // Criterio 1: Documento casi idéntico (1 o 2 caracteres diferentes)
    if (docDistance <= 2) {
      matches.push({
        survey,
        reason: `El número de documento difiere en solo ${docDistance} carácter${docDistance > 1 ? 'es' : ''} (posible error de digitación).`,
        level: docDistance === 1 ? 'high' : 'medium',
      });
      continue; // No acumular motivos múltiples para el mismo registro
    }

    // Criterio 2: Nombre completo exactamente igual con documento diferente
    if (fullNameNorm.length > 3 && existingFullName === fullNameNorm) {
      matches.push({
        survey,
        reason: 'El nombre completo coincide exactamente con un registro diferente.',
        level: 'high',
      });
      continue;
    }

    // Criterio 3: Nombre completo muy similar (Levenshtein ≤ 3 en el nombre completo)
    if (
      fullNameNorm.length > 5 &&
      existingFullName.length > 5 &&
      nameDistance <= 3
    ) {
      matches.push({
        survey,
        reason: `El nombre completo es muy similar al de un registro existente (${nameDistance} carácter${nameDistance > 1 ? 'es' : ''} de diferencia).`,
        level: 'medium',
      });
    }
  }

  // Ordenar: primero los de nivel 'high'
  return matches.sort((a, b) => (a.level === 'high' ? -1 : b.level === 'high' ? 1 : 0));
}
