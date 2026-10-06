"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_LOTE_SYNC = void 0;
exports.processSyncBatch = processSyncBatch;
const db_1 = require("../config/db");
const textUtils_1 = require("../utils/textUtils");
const prismaErrors_1 = require("../utils/prismaErrors");
const visibilidad_1 = require("../utils/visibilidad");
const duplicateService_1 = require("./duplicateService");
/** Máximo de encuestas por petición de sincronización (el cliente envía lotes de 100) */
exports.MAX_LOTE_SYNC = 200;
/** Milisegundos de una fecha ISO, o null si no es válida */
function fechaValida(valor) {
    if (!valor)
        return null;
    const ms = new Date(String(valor)).getTime();
    return Number.isNaN(ms) ? null : ms;
}
/**
 * Busca registros con cédula o nombre parecido. Los de otro encuestador se informan sin datos personales
 * (un único aviso genérico, sin importar cuántos sean).
 */
function detectarSimilares(docNuevo, nombreNuevo, base, userId) {
    const similares = [];
    let avisoAjeno = false;
    for (const ex of base) {
        if (!ex.documento_identidad || ex.documento_identidad === docNuevo)
            continue;
        const docDist = (0, textUtils_1.levenshteinAcotada)(docNuevo, ex.documento_identidad, 2);
        const nombreExistente = (0, textUtils_1.normalizeText)(`${ex.nombres || ''} ${ex.apellidos || ''}`);
        const nameDist = (0, textUtils_1.levenshteinAcotada)(nombreNuevo, nombreExistente, 3);
        let razon = '';
        if (docDist <= 2) {
            razon = `Documento difiere en ${docDist} carácter(es)`;
        }
        else if (nombreNuevo.length > 3 && nombreExistente === nombreNuevo) {
            razon = 'Nombre completo idéntico con documento diferente';
        }
        else if (nombreNuevo.length > 5 && nombreExistente.length > 5 && nameDist <= 3) {
            razon = `Nombre muy similar (${nameDist} carácter(es) de diferencia)`;
        }
        if (!razon)
            continue;
        if (ex.encuestador_id === userId) {
            // Registro propio del encuestador: puede ver sus datos
            similares.push({ documento_identidad: ex.documento_identidad, nombres: ex.nombres, apellidos: ex.apellidos, razon });
        }
        else if (!avisoAjeno) {
            avisoAjeno = true;
            similares.push({ documento_identidad: '', nombres: '', apellidos: '', razon: visibilidad_1.MENSAJE_SIMILAR_AJENO, ajeno: true });
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
async function registrarAvisoCedula(tx, existe, data, autor) {
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
async function actualizarExistente(tx, existe, data, autor) {
    if (existe.encuestador_id !== autor.id) {
        await registrarAvisoCedula(tx, existe, data, autor);
        return { registro: existe, conflicto: false, aviso: true };
    }
    const [tel1, tel2, tel3] = (0, textUtils_1.mergePhones)([data.telefono_1, data.telefono_2, data.telefono_3], [existe.telefono_1, existe.telefono_2, existe.telefono_3]);
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
async function processSyncBatch(encuestas, autor) {
    // Una sola lectura por lote para la detección de similitudes (antes se leía la tabla completa por cada encuesta)
    const base = await db_1.prisma.encuesta.findMany({
        select: { documento_identidad: true, nombres: true, apellidos: true, encuestador_id: true },
    });
    const sincronizadas = [];
    const eliminadas = [];
    const errores = [];
    const advertencias = [];
    const conflictos = [];
    for (const data of encuestas) {
        if (!data.documento_identidad)
            continue;
        const docIdentidad = String(data.documento_identidad).trim();
        if (!docIdentidad)
            continue;
        try {
            // 1. Encuestas que un administrador eliminó en el servidor
            const eliminadaCheck = await db_1.pool.query('SELECT eliminado_en FROM encuestas_eliminadas WHERE documento_identidad = $1 LIMIT 1', [docIdentidad]);
            if (eliminadaCheck.rows.length > 0) {
                const eliminadoEn = new Date(eliminadaCheck.rows[0].eliminado_en).getTime();
                const creadoEn = fechaValida(data.creado_en);
                // Solo es legítima si se creó DESPUÉS de la eliminación. Sin fecha de creación se rechaza:
                // antes se aceptaba, y así volvían a aparecer encuestas borradas.
                if (creadoEn === null || creadoEn <= eliminadoEn) {
                    eliminadas.push({ localId: data.id, documento_identidad: docIdentidad });
                    continue;
                }
                await db_1.pool.query('DELETE FROM encuestas_eliminadas WHERE documento_identidad = $1', [docIdentidad]);
            }
            // 2. Upsert en transacción SERIALIZABLE: evita duplicados si dos dispositivos envían la misma cédula a la vez
            const resultado = await db_1.prisma.$transaction(async (tx) => {
                const existe = await tx.encuesta.findFirst({ where: { documento_identidad: docIdentidad } });
                if (existe) {
                    const { registro, conflicto, aviso } = await actualizarExistente(tx, existe, data, autor);
                    return { registro, creada: false, conflicto, aviso, similares: [] };
                }
                const nombreNuevo = (0, textUtils_1.normalizeText)(`${data.nombres || ''} ${data.apellidos || ''}`);
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
            }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 });
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
                    similares: [{ documento_identidad: '', nombres: '', apellidos: '', razon: visibilidad_1.MENSAJE_CEDULA_AJENA, ajeno: true }],
                });
            }
            else if (resultado.similares.length > 0) {
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
        }
        catch (error) {
            console.error(`Error sincronizando encuesta con documento ${docIdentidad}:`, error);
            errores.push({
                documento_identidad: docIdentidad,
                error: (0, prismaErrors_1.esViolacionUnicidad)(error)
                    ? 'El documento se registró en paralelo; vuelva a sincronizar.'
                    : 'No se pudo guardar el registro.',
            });
        }
    }
    if (sincronizadas.length > 0)
        (0, duplicateService_1.invalidarCacheDuplicados)();
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
