"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDescartarDuplicado = exports.handleFusionarDuplicado = exports.handleAprobarDuplicado = exports.handleGetDuplicados = void 0;
const db_1 = require("../config/db");
const duplicateService_1 = require("../services/duplicateService");
const eliminadas_1 = require("../services/eliminadas");
const prismaErrors_1 = require("../utils/prismaErrors");
/** Convierte un id recibido del cliente a entero positivo, o null si no es válido */
function idValido(valor) {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
}
/** Registra el par como revisado (mismo orden siempre: menor id primero) */
async function registrarRevision(a, b, accion) {
    await db_1.pool.query(`INSERT INTO duplicados_revisados (survey_a_id, survey_b_id, accion)
     VALUES ($1, $2, $3)
     ON CONFLICT (survey_a_id, survey_b_id) DO UPDATE SET accion = $3, revisado_en = NOW()`, [Math.min(a, b), Math.max(a, b), accion]);
}
const handleGetDuplicados = async (_req, res) => {
    try {
        const duplicados = await (0, duplicateService_1.findDuplicatesList)();
        res.json(duplicados);
    }
    catch (error) {
        console.error('Error obteniendo duplicados:', error);
        res.status(500).json({ error: 'Error al consultar posibles duplicados' });
    }
};
exports.handleGetDuplicados = handleGetDuplicados;
const handleAprobarDuplicado = async (req, res) => {
    const a = idValido(req.body?.surveyAId);
    const b = idValido(req.body?.surveyBId);
    if (!a || !b || a === b) {
        res.status(400).json({ error: 'Se requieren dos IDs de encuesta distintos' });
        return;
    }
    try {
        await registrarRevision(a, b, 'aprobado');
        (0, duplicateService_1.invalidarCacheDuplicados)();
        res.json({ message: 'Par de encuestas aprobado como legítimo' });
    }
    catch (error) {
        console.error('Error aprobando duplicado:', error);
        res.status(500).json({ error: 'Error al aprobar duplicado' });
    }
};
exports.handleAprobarDuplicado = handleAprobarDuplicado;
const handleFusionarDuplicado = async (req, res) => {
    const { datosFusionados } = req.body ?? {};
    const targetId = idValido(req.body?.targetId);
    const sourceId = idValido(req.body?.sourceId);
    if (!targetId || !sourceId || targetId === sourceId) {
        res.status(400).json({ error: 'Se requieren dos IDs de encuesta distintos (targetId y sourceId)' });
        return;
    }
    try {
        const target = await db_1.prisma.encuesta.findUnique({ where: { id: targetId } });
        const source = await db_1.prisma.encuesta.findUnique({ where: { id: sourceId } });
        if (!target || !source) {
            res.status(404).json({ error: 'Una de las encuestas no existe' });
            return;
        }
        // Teléfonos sin duplicar, máximo 3. El principal es el de la encuesta que se conserva (destino);
        // si el administrador eligió un teléfono en la fusión, ese tiene prioridad. Luego van los de la fuente.
        const allPhones = Array.from(new Set([
            datosFusionados?.telefono_1 || target.telefono_1,
            target.telefono_2,
            target.telefono_3,
            source.telefono_1,
            source.telefono_2,
            source.telefono_3,
        ].filter(Boolean)));
        const documentoFinal = datosFusionados?.documento_identidad || target.documento_identidad;
        const fusionada = await db_1.prisma.$transaction(async (tx) => {
            // Primero se elimina la fuente: así el documento final puede ser el de la fuente sin violar la unicidad
            await tx.encuesta.delete({ where: { id: source.id } });
            if (source.documento_identidad !== documentoFinal) {
                await (0, eliminadas_1.registrarEliminaciones)(tx, [source.documento_identidad]);
            }
            return tx.encuesta.update({
                where: { id: target.id },
                data: {
                    tipo_documento: datosFusionados?.tipo_documento || target.tipo_documento,
                    documento_identidad: documentoFinal,
                    nombres: datosFusionados?.nombres || target.nombres,
                    apellidos: datosFusionados?.apellidos || target.apellidos,
                    direccion: datosFusionados?.direccion || target.direccion || source.direccion,
                    profesion: datosFusionados?.profesion || target.profesion || source.profesion,
                    telefono_1: allPhones[0] || target.telefono_1,
                    telefono_2: allPhones[1] || '',
                    telefono_3: allPhones[2] || '',
                    actualizado_en: new Date(),
                },
            });
        });
        await registrarRevision(targetId, sourceId, 'fusionado').catch((err) => console.warn('No se pudo registrar la revisión de la fusión:', err));
        (0, duplicateService_1.invalidarCacheDuplicados)();
        res.json({ message: 'Encuestas fusionadas con éxito', encuesta: fusionada });
    }
    catch (error) {
        if ((0, prismaErrors_1.esViolacionUnicidad)(error)) {
            res.status(400).json({ error: 'El documento indicado ya pertenece a otra encuesta.' });
            return;
        }
        console.error('Error fusionando encuestas:', error);
        res.status(500).json({ error: 'Error al fusionar encuestas' });
    }
};
exports.handleFusionarDuplicado = handleFusionarDuplicado;
const handleDescartarDuplicado = async (req, res) => {
    const idToDelete = idValido(req.body?.surveyIdToDelete);
    if (!idToDelete) {
        res.status(400).json({ error: 'surveyIdToDelete es obligatorio' });
        return;
    }
    const otherId = idValido(req.body?.otherSurveyId);
    try {
        const eliminada = await db_1.prisma.$transaction(async (tx) => {
            const encuesta = await tx.encuesta.findUnique({ where: { id: idToDelete } });
            if (!encuesta)
                return false;
            await (0, eliminadas_1.registrarEliminaciones)(tx, [encuesta.documento_identidad]);
            await tx.encuesta.delete({ where: { id: idToDelete } });
            return true;
        });
        if (!eliminada) {
            res.status(404).json({ error: 'La encuesta ya no existe' });
            return;
        }
        if (otherId && otherId !== idToDelete) {
            await registrarRevision(idToDelete, otherId, 'descartado');
        }
        (0, duplicateService_1.invalidarCacheDuplicados)();
        res.json({ message: 'Encuesta duplicada eliminada con éxito' });
    }
    catch (error) {
        console.error('Error eliminando duplicado:', error);
        res.status(500).json({ error: 'Error al eliminar duplicado' });
    }
};
exports.handleDescartarDuplicado = handleDescartarDuplicado;
