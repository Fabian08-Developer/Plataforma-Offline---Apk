import type { Encuesta, Prisma } from '@prisma/client';
import { pool, prisma } from '../config/db';
import { mergePhones, levenshteinAcotada, normalizeText } from '../utils/textUtils';
import { esViolacionUnicidad } from '../utils/prismaErrors';
import { MENSAJE_CEDULA_AJENA, MENSAJE_SIMILAR_AJENO } from '../utils/visibilidad';
import { invalidarCacheDuplicados } from './duplicateService';

/** Máximo de encuestas por petición de sincronización (el cliente envía lotes de 100) */
export const MAX_LOTE_SYNC = 200;

export interface SyncSurveyInput {
  id?: number | string;
  encuestador_id?: number | string;
  encuestador_usuario?: string;
  tipo_documento?: string;
  documento_identidad?: string;
  nombres?: string;
  apellidos?: string;
  telefono_1?: string;
  telefono_2?: string;
  telefono_3?: string;
  direccion?: string;
  profesion?: string;
  fecha_registro?: string;
  creado_en?: string;
  actualizado_en?: string;
  [key: string]: any;
}

/** Autor de la sincronización: siempre el usuario del token */
export interface Autor {
  id: number;
  usuario: string;
  nombre: string;
}

/**
 * Coincidencia con otro registro. Si `ajeno` es true, el registro pertenece a otro encuestador
 * y los datos personales van vacíos: solo se informa el motivo.
 */
type Similar = { documento_identidad: string; nombres: string; apellidos: string; razon: string; ajeno?: boolean };

export interface SyncResult {
  message: string;
  procesadas: number;
  errores: number;
  sincronizadasLocalIds: any[];
  sincronizadas: Array<{
    localId: any;
    documento_identidad: string;
    telefono_1?: string;
    telefono_2?: string;
    telefono_3?: string;
  }>;
  eliminadas: Array<{ localId: any; documento_identidad: string }>;
  advertencias: Array<{ documento_identidad: string; similares: Similar[] }>;
  /** Encuestas donde el servidor tenía una modificación más reciente: se conservaron sus datos */
  conflictos: Array<{ documento_identidad: string; motivo: string }>;
}

/** Milisegundos de una fecha ISO, o null si no es válida */
function fechaValida(valor: unknown): number | null {
  if (!valor) return null;
  const ms = new Date(String(valor)).getTime();
  return Number.isNaN(ms) ? null : ms;
}

interface RegistroBase {
  documento_identidad: string;
  nombres: string;
  apellidos: string;
  encuestador_id: number;
}

/**
 * Busca registros con cédula o nombre parecido. Los de otro encuestador se informan sin datos personales
 * (un único aviso genérico, sin importar cuántos sean).
 */
function detectarSimilares(docNuevo: string, nombreNuevo: string, base: RegistroBase[], userId: number): Similar[] {
  const similares: Similar[] = [];
  let avisoAjeno = false;

  for (const ex of base) {
    if (!ex.documento_identidad || ex.documento_identidad === docNuevo) continue;

    const docDist = levenshteinAcotada(docNuevo, ex.documento_identidad, 2);
    const nombreExistente = normalizeText(`${ex.nombres || ''} ${ex.apellidos || ''}`);
    const nameDist = levenshteinAcotada(nombreNuevo, nombreExistente, 3);

    let razon = '';
    if (docDist <= 2) {
      razon = `Documento difiere en ${docDist} carácter(es)`;
    } else if (nombreNuevo.length > 3 && nombreExistente === nombreNuevo) {
      razon = 'Nombre completo idéntico con documento diferente';
    } else if (nombreNuevo.length > 5 && nombreExistente.length > 5 && nameDist <= 3) {
      razon = `Nombre muy similar (${nameDist} carácter(es) de diferencia)`;
    }
    if (!razon) continue;

    if (ex.encuestador_id === userId) {
      // Registro propio del encuestador: puede ver sus datos
      similares.push({ documento_identidad: ex.documento_identidad, nombres: ex.nombres, apellidos: ex.apellidos, razon });
    } else if (!avisoAjeno) {
      avisoAjeno = true;
      similares.push({ documento_identidad: '', nombres: '', apellidos: '', razon: MENSAJE_SIMILAR_AJENO, ajeno: true });
    }
  }
  return similares;
}

/**
 * Guarda la captura de un encuestador sobre una cédula que pertenece a OTRO encuestador.
 * El registro del dueño NO se modifica: el administrador decide después (mantener o usar la captura).
 * Si ya hay un aviso pendiente de ese mismo encuestador para la misma encuesta, se actualiza
 * (un reenvío no crea avisos duplicados).
 */
async function registrarAvisoCedula(tx: Prisma.TransactionClient, existe: Encuesta, data: SyncSurveyInput, autor: Autor): Promise<void> {
  const datosRecibidos = {
    tipo_documento: String(data.tipo_documento || ''),
    nombres: String(data.nombres || ''),
    apellidos: String(data.apellidos || ''),
    telefono_1: String(data.telefono_1 || ''),
    telefono_2: String(data.telefono_2 || ''),
    telefono_3: String(data.telefono_3 || ''),
    direccion: String(data.direccion || ''),
    profesion: String(data.profesion || ''),
    fecha_registro: String(data.fecha_registro || ''),
    creado_en: String(data.creado_en || ''),
    actualizado_en: String(data.actualizado_en || ''),
    autor: { id: autor.id, usuario: autor.usuario, nombre: autor.nombre },
  };

  const pendiente = await tx.avisoCedula.findFirst({
    where: { encuesta_id: existe.id, encuestador_id: autor.id, resuelto: false },
  });
  if (pendiente) {
    await tx.avisoCedula.update({ where: { id: pendiente.id }, data: { datos_recibidos: datosRecibidos } });
    return;
  }

  await tx.avisoCedula.create({
    data: {
      documento_identidad: existe.documento_identidad,
      encuesta_id: existe.id,
      encuestador_id: autor.id,
      // Versión que existe en el servidor, tal como estaba al recibir la captura
      datos_previos: {
        encuestador_id: existe.encuestador_id,
        tipo_documento: existe.tipo_documento,
        nombres: existe.nombres,
        apellidos: existe.apellidos,
        telefono_1: existe.telefono_1,
        telefono_2: existe.telefono_2 ?? '',
        telefono_3: existe.telefono_3 ?? '',
        direccion: existe.direccion,
        profesion: existe.profesion ?? '',
        fecha_registro: existe.fecha_registro,
        actualizado_en: existe.actualizado_en?.toISOString() ?? null,
      },
      datos_recibidos: datosRecibidos,
    },
  });
}

/**
 * Actualiza una encuesta que ya existe en el servidor.
 * - Si pertenece a OTRO encuestador: no se modifica; se registra un aviso para el administrador.
 * - Si es del mismo encuestador: regla "gana el más reciente". Los teléfonos siempre se combinan.
 */
async function actualizarExistente(
  tx: Prisma.TransactionClient,
  existe: Encuesta,
  data: SyncSurveyInput,
  autor: Autor
): Promise<{ registro: Encuesta; conflicto: boolean; aviso: boolean }> {
  if (existe.encuestador_id !== autor.id) {
    await registrarAvisoCedula(tx, existe, data, autor);
    return { registro: existe, conflicto: false, aviso: true };
  }

  const [tel1, tel2, tel3] = mergePhones(
    [data.telefono_1, data.telefono_2, data.telefono_3],
    [existe.telefono_1, existe.telefono_2, existe.telefono_3]
  );

  const tsEntrante = fechaValida(data.actualizado_en);
  const tsServidor = existe.actualizado_en?.getTime() ?? 0;
  // Sin fecha (clientes antiguos) se mantiene el comportamiento anterior: el dispositivo gana
  const entranteGana = tsEntrante === null || tsEntrante >= tsServidor;

  const registro = await tx.encuesta.update({
    where: { id: existe.id },
    data: entranteGana
      ? {
          tipo_documento: String(data.tipo_documento || existe.tipo_documento),
          nombres: String(data.nombres || existe.nombres),
          apellidos: String(data.apellidos || existe.apellidos),
          telefono_1: tel1,
          telefono_2: tel2,
          telefono_3: tel3,
          direccion: String(data.direccion || existe.direccion),
          profesion: data.profesion ? String(data.profesion) : (existe.profesion || ''),
          fecha_registro: String(data.fecha_registro || existe.fecha_registro),
          actualizado_en: tsEntrante !== null ? new Date(Math.max(tsEntrante, tsServidor)) : new Date(),
          estado_sincronizacion: 'sincronizado',
        }
      : {
          telefono_1: tel1,
          telefono_2: tel2,
          telefono_3: tel3,
          estado_sincronizacion: 'sincronizado',
        },
  });

  return { registro, conflicto: !entranteGana, aviso: false };
}

/**
 * Procesa un lote de encuestas enviadas por un usuario autenticado.
 * La autoría siempre es el usuario del token: el cliente no puede atribuir encuestas a otra persona.
 */
export async function processSyncBatch(encuestas: SyncSurveyInput[], autor: Autor): Promise<SyncResult> {
  // Una sola lectura por lote para la detección de similitudes (antes se leía la tabla completa por cada encuesta)
  const base: RegistroBase[] = await prisma.encuesta.findMany({
    select: { documento_identidad: true, nombres: true, apellidos: true, encuestador_id: true },
  });

  const sincronizadas: SyncResult['sincronizadas'] = [];
  const eliminadas: SyncResult['eliminadas'] = [];
  const errores: Array<{ documento_identidad: string; error: string }> = [];
  const advertencias: SyncResult['advertencias'] = [];
  const conflictos: SyncResult['conflictos'] = [];

  for (const data of encuestas) {
    if (!data.documento_identidad) continue;
    const docIdentidad = String(data.documento_identidad).trim();
    if (!docIdentidad) continue;

    try {
      // 1. Encuestas que un administrador eliminó en el servidor
      const eliminadaCheck = await pool.query(
        'SELECT eliminado_en FROM encuestas_eliminadas WHERE documento_identidad = $1 LIMIT 1',
        [docIdentidad]
      );
      if (eliminadaCheck.rows.length > 0) {
        const eliminadoEn = new Date(eliminadaCheck.rows[0].eliminado_en).getTime();
        const creadoEn = fechaValida(data.creado_en);
        // Solo es legítima si se creó DESPUÉS de la eliminación. Sin fecha de creación se rechaza:
        // antes se aceptaba, y así volvían a aparecer encuestas borradas.
        if (creadoEn === null || creadoEn <= eliminadoEn) {
          eliminadas.push({ localId: data.id, documento_identidad: docIdentidad });
          continue;
        }
        await pool.query('DELETE FROM encuestas_eliminadas WHERE documento_identidad = $1', [docIdentidad]);
      }

      // 2. Upsert en transacción SERIALIZABLE: evita duplicados si dos dispositivos envían la misma cédula a la vez
      const resultado = await prisma.$transaction(
        async (tx) => {
          const existe = await tx.encuesta.findFirst({ where: { documento_identidad: docIdentidad } });

          if (existe) {
            const { registro, conflicto, aviso } = await actualizarExistente(tx, existe, data, autor);
            return { registro, creada: false, conflicto, aviso, similares: [] as Similar[] };
          }

          const nombreNuevo = normalizeText(`${data.nombres || ''} ${data.apellidos || ''}`);
          const similares = detectarSimilares(docIdentidad, nombreNuevo, base, autor.id);
          const ahora = new Date();
          const registro = await tx.encuesta.create({
            data: {
              encuestador_id: autor.id,
              tipo_documento: String(data.tipo_documento || 'C.C'),
              documento_identidad: docIdentidad,
              nombres: String(data.nombres || ''),
              apellidos: String(data.apellidos || ''),
              telefono_1: String(data.telefono_1 || ''),
              telefono_2: data.telefono_2 ? String(data.telefono_2) : '',
              telefono_3: data.telefono_3 ? String(data.telefono_3) : '',
              direccion: String(data.direccion || ''),
              profesion: data.profesion ? String(data.profesion) : '',
              fecha_registro: String(data.fecha_registro || ahora.toISOString().split('T')[0]),
              estado_sincronizacion: 'sincronizado',
              actualizado_en: fechaValida(data.actualizado_en) !== null ? new Date(String(data.actualizado_en)) : ahora,
            },
          });
          return { registro, creada: true, conflicto: false, aviso: false, similares };
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 }
      );

      // Solo tras confirmar la transacción se actualizan las estructuras en memoria del lote
      if (resultado.creada) {
        base.push({
          documento_identidad: docIdentidad,
          nombres: resultado.registro.nombres,
          apellidos: resultado.registro.apellidos,
          encuestador_id: autor.id,
        });
      }
      if (resultado.aviso) {
        // La cédula ya era de otro encuestador: el dispositivo recibe solo el aviso, sin datos de esa persona
        advertencias.push({
          documento_identidad: docIdentidad,
          similares: [{ documento_identidad: '', nombres: '', apellidos: '', razon: MENSAJE_CEDULA_AJENA, ajeno: true }],
        });
      } else if (resultado.similares.length > 0) {
        advertencias.push({ documento_identidad: docIdentidad, similares: resultado.similares });
      }
      if (resultado.conflicto) {
        conflictos.push({
          documento_identidad: docIdentidad,
          motivo: 'El servidor tenía una modificación más reciente; se conservaron sus datos y se combinaron los teléfonos.',
        });
      }

      // Teléfonos de respuesta: si el registro es de otro encuestador, se devuelven los de la captura
      // (no los del dueño), para no exponer datos de terceros al dispositivo.
      const telefonos = resultado.aviso
        ? { telefono_1: String(data.telefono_1 || ''), telefono_2: String(data.telefono_2 || ''), telefono_3: String(data.telefono_3 || '') }
        : { telefono_1: resultado.registro.telefono_1 || '', telefono_2: resultado.registro.telefono_2 || '', telefono_3: resultado.registro.telefono_3 || '' };

      sincronizadas.push({
        localId: data.id ?? resultado.registro.id,
        documento_identidad: docIdentidad,
        ...telefonos,
      });
    } catch (error) {
      console.error(`Error sincronizando encuesta con documento ${docIdentidad}:`, error);
      errores.push({
        documento_identidad: docIdentidad,
        error: esViolacionUnicidad(error)
          ? 'El documento se registró en paralelo; vuelva a sincronizar.'
          : 'No se pudo guardar el registro.',
      });
    }
  }

  if (sincronizadas.length > 0) invalidarCacheDuplicados();

  return {
    message: errores.length === 0 ? 'Sincronización exitosa' : 'Sincronización parcial',
    procesadas: sincronizadas.length,
    errores: errores.length,
    sincronizadasLocalIds: sincronizadas.map((s) => s.localId),
    sincronizadas,
    eliminadas,
    advertencias,
    conflictos,
  };
}
