"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidarCacheDuplicados = invalidarCacheDuplicados;
exports.findDuplicatesList = findDuplicatesList;
const db_1 = require("../config/db");
const textUtils_1 = require("../utils/textUtils");
/** Tiempo que se reutiliza el resultado del análisis de duplicados (los cambios lo invalidan) */
const TTL_MS = 30_000;
let cache = null;
let calculoEnCurso = null;
/** Llamar tras crear, editar, eliminar, aprobar o fusionar encuestas */
function invalidarCacheDuplicados() {
    cache = null;
}
/**
 * Devuelve los pares de posibles duplicados. El cálculo es costoso (compara todos los pares),
 * por eso se guarda en caché y se comparten las peticiones simultáneas.
 */
async function findDuplicatesList() {
    if (cache && Date.now() - cache.calculadoEn < TTL_MS)
        return cache.datos;
    if (!calculoEnCurso) {
        calculoEnCurso = calcularDuplicados()
            .then((datos) => {
            cache = { calculadoEn: Date.now(), datos };
            return datos;
        })
            .finally(() => {
            calculoEnCurso = null;
        });
    }
    return calculoEnCurso;
}
async function calcularDuplicados() {
    const revisadosSet = new Set();
    try {
        const revResult = await db_1.pool.query('SELECT survey_a_id, survey_b_id FROM duplicados_revisados');
        for (const row of revResult.rows) {
            revisadosSet.add(`${row.survey_a_id}-${row.survey_b_id}`);
            revisadosSet.add(`${row.survey_b_id}-${row.survey_a_id}`);
        }
    }
    catch {
        // Si la tabla aún no responde, continuar sin filtro de revisados
    }
    const encuestas = await db_1.prisma.encuesta.findMany({
        orderBy: { id: 'desc' },
        include: {
            encuestador: { select: { id: true, nombre: true, usuario: true } },
        },
    });
    // Normalizar una sola vez por registro, no por cada par
    const filas = encuestas.map((e) => ({
        registro: e,
        doc: (e.documento_identidad || '').trim(),
        nombre: (0, textUtils_1.normalizeText)(`${e.nombres || ''} ${e.apellidos || ''}`),
    }));
    const duplicados = [];
    for (let i = 0; i < filas.length; i++) {
        const a = filas[i];
        for (let j = i + 1; j < filas.length; j++) {
            const b = filas[j];
            let motivo = '';
            let nivel = 'medium';
            if (a.doc && b.doc && a.doc === b.doc) {
                motivo = 'Mismo número de documento de identidad exacto';
                nivel = 'high';
            }
            else if (a.doc && b.doc) {
                const docDist = (0, textUtils_1.levenshteinAcotada)(a.doc, b.doc, 2);
                if (docDist <= 2) {
                    motivo = `Cédula difiere en solo ${docDist} carácter${docDist > 1 ? 'es' : ''} (posible error de digitación)`;
                    nivel = docDist === 1 ? 'high' : 'medium';
                }
            }
            // Si no hubo coincidencia por cédula, comparar nombres
            if (!motivo && a.nombre.length > 5 && b.nombre.length > 5) {
                if (a.nombre === b.nombre) {
                    motivo = 'Nombre completo idéntico con diferente documento';
                    nivel = 'high';
                }
                else {
                    const nameDist = (0, textUtils_1.levenshteinAcotada)(a.nombre, b.nombre, 2);
                    if (nameDist <= 2) {
                        motivo = `Nombre completo muy similar (${nameDist} carácter(es) de diferencia)`;
                        nivel = 'medium';
                    }
                }
            }
            if (!motivo)
                continue;
            // Solo se consulta el filtro de revisados para los pares que sí coinciden
            const idPar = `${a.registro.id}-${b.registro.id}`;
            if (revisadosSet.has(idPar))
                continue;
            duplicados.push({
                id: idPar,
                surveyA: a.registro,
                surveyB: b.registro,
                motivo,
                nivel,
            });
        }
    }
    return duplicados;
}
