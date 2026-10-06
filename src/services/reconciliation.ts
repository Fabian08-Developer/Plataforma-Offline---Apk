import { dbService } from '../db';
import { BACKEND_URL } from '../config';

/** Cédulas por petición (coincide con el límite del backend) */
const LOTE_CONSULTA = 1000;

/**
 * Pregunta al servidor qué encuestas sincronizadas de este dispositivo ya no existen (fueron eliminadas)
 * y las borra localmente. Solo consulta las cédulas propias del dispositivo: no descarga el listado de la base.
 * Devuelve cuántas encuestas locales se borraron.
 */
export async function reconciliarEncuestasEliminadas(token: string | null): Promise<number> {
  if (!token) return 0;

  const documentos = await dbService.getSyncedDocumentos();
  let eliminadas = 0;

  for (let i = 0; i < documentos.length; i += LOTE_CONSULTA) {
    const lote = documentos.slice(i, i + LOTE_CONSULTA);
    try {
      const res = await fetch(`${BACKEND_URL}/api/encuestas/documentos-faltantes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ documentos: lote }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) break;

      const faltantes: string[] = await res.json();
      eliminadas += await dbService.deleteSyncedByDocumentos(faltantes);
    } catch {
      // Fallo de red o servidor: se reintenta en el siguiente ciclo
      break;
    }
  }

  return eliminadas;
}
