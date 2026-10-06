"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDocumentosFaltantes = exports.handleGetMisEncuestas = exports.handleBuscarSimilares = exports.handleVerificarDocumento = void 0;
const db_1 = require("../config/db");
const textUtils_1 = require("../utils/textUtils");
const visibilidad_1 = require("../utils/visibilidad");
/** Máximo de coincidencias que devuelve la búsqueda de similares */
const MAX_SIMILARES = 20;
/** Máximo de cédulas por consulta de reconciliación */
const MAX_DOCUMENTOS_CONSULTA = 1000;
// ENCUESTADOR - Verificar si un documento ya está registrado en el servidor
const handleVerificarDocumento = async (req, res) => {
    try {
        const doc = String(req.params.documento || '').trim();
        if (doc.length < 5) {
            res.status(400).json({ error: 'Documento demasiado corto' });
            return;
        }
        const encuesta = await db_1.prisma.encuesta.findFirst({
            where: { documento_identidad: doc },
        });
        if (!encuesta) {
            res.status(404).json(null);
            return;
        }
        // Registro de otro encuestador: solo se confirma que existe. Sus datos personales no salen del servidor.
        if (!(0, visibilidad_1.esPropia)(encuesta.encuestador_id, req.user)) {
            res.json({ documento_identidad: doc, ajeno: true, mensaje: visibilidad_1.MENSAJE_CEDULA_AJENA });
            return;
        }
        res.json(encuesta);
    }
    catch (error) {
        console.error('Error verificando documento:', error);
        res.status(500).json({ error: 'Error al verificar documento' });
    }
};
exports.handleVerificarDocumento = handleVerificarDocumento;
// ENCUESTADOR - Buscar registros con documento o nombre similar al indicado
const handleBuscarSimilares = async (req, res) => {
    try {
        const doc = String(req.params.documento || '').trim();
        if (doc.length < 4) {
            res.status(400).json({ error: 'Documento demasiado corto' });
            return;
        }
        const nombresQuery = String(req.query?.nombres || '').trim();
        const apellidosQuery = String(req.query?.apellidos || '').trim();
        const fullNameQuery = (0, textUtils_1.normalizeText)(`${nombresQuery} ${apellidosQuery}`);
        // Solo los campos necesarios para mostrar la advertencia
        const todos = await db_1.prisma.encuesta.findMany({
            select: {
                id: true,
                encuestador_id: true,
                documento_identidad: true,
                nombres: true,
                apellidos: true,
                tipo_documento: true,
            },
        });
        const similares = [];
        let avisoAjeno = false;
        for (const ex of todos) {
            if (similares.length >= MAX_SIMILARES)
                break;
            if (ex.documento_identidad === doc)
                continue;
            // Criterio 1: documento difiere en 1 o 2 caracteres. Criterio 2: nombre completo idéntico o muy similar
            const coincide = (0, textUtils_1.levenshteinAcotada)(doc, ex.documento_identidad, 2) <= 2 ||
                (fullNameQuery.length > 5 &&
                    ((0, textUtils_1.normalizeText)(`${ex.nombres} ${ex.apellidos}`) === fullNameQuery ||
                        ((0, textUtils_1.normalizeText)(`${ex.nombres} ${ex.apellidos}`).length > 5 &&
                            (0, textUtils_1.levenshteinAcotada)(fullNameQuery, (0, textUtils_1.normalizeText)(`${ex.nombres} ${ex.apellidos}`), 2) <= 2)));
            if (!coincide)
                continue;
            if ((0, visibilidad_1.esPropia)(ex.encuestador_id, req.user)) {
                similares.push({ id: ex.id, documento_identidad: ex.documento_identidad, nombres: ex.nombres, apellidos: ex.apellidos, tipo_documento: ex.tipo_documento });
            }
            else if (!avisoAjeno) {
                // Registros de otros encuestadores: un único aviso genérico, sin datos personales
                avisoAjeno = true;
                similares.push({ id: null, documento_identidad: '', nombres: '', apellidos: '', tipo_documento: '', ajeno: true, razon: visibilidad_1.MENSAJE_SIMILAR_AJENO });
            }
        }
        res.json(similares);
    }
    catch (error) {
        console.error('Error buscando similares:', error);
        res.status(500).json({ error: 'Error al buscar registros similares' });
    }
};
exports.handleBuscarSimilares = handleBuscarSimilares;
// ENCUESTADOR - Mis encuestas registradas
const handleGetMisEncuestas = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Usuario no autenticado' });
            return;
        }
        const encuestas = await db_1.prisma.encuesta.findMany({
            where: { encuestador_id: userId },
            orderBy: { id: 'desc' },
        });
        res.json(encuestas);
    }
    catch (error) {
        console.error('Error al obtener encuestas del encuestador:', error);
        res.status(500).json({ error: 'Error al consultar encuestas' });
    }
};
exports.handleGetMisEncuestas = handleGetMisEncuestas;
/**
 * RECONCILIACIÓN - El dispositivo envía las cédulas que tiene como sincronizadas
 * y el servidor responde cuáles ya no existen. Así no se expone el listado completo de la base.
 */
const handleDocumentosFaltantes = async (req, res) => {
    const { documentos } = req.body ?? {};
    if (!Array.isArray(documentos) ||
        documentos.length === 0 ||
        documentos.length > MAX_DOCUMENTOS_CONSULTA ||
        !documentos.every((d) => typeof d === 'string')) {
        res.status(400).json({ error: `Envíe entre 1 y ${MAX_DOCUMENTOS_CONSULTA} documentos como texto.` });
        return;
    }
    try {
        const solicitados = [...new Set(documentos.map((d) => d.trim()).filter(Boolean))];
        const encontrados = await db_1.prisma.encuesta.findMany({
            where: { documento_identidad: { in: solicitados } },
            select: { documento_identidad: true },
        });
        const existentes = new Set(encontrados.map((e) => e.documento_identidad));
        res.json(solicitados.filter((d) => !existentes.has(d)));
    }
    catch (error) {
        console.error('Error consultando documentos faltantes:', error);
        res.status(500).json({ error: 'Error al consultar documentos' });
    }
};
exports.handleDocumentosFaltantes = handleDocumentosFaltantes;
