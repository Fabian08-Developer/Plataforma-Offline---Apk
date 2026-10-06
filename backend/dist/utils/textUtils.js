"use strict";
/**
 * Utilidades para normalización, comparación y manipulación de texto y teléfonos.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeText = normalizeText;
exports.levenshtein = levenshtein;
exports.levenshteinAcotada = levenshteinAcotada;
exports.mergePhones = mergePhones;
function normalizeText(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Distancia de Levenshtein (mismo algoritmo que en el frontend / similarityUtils.ts)
 */
function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (a.length === 0)
        return b.length;
    if (b.length === 0)
        return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++)
        matrix[i] = [i];
    for (let j = 0; j <= a.length; j++)
        matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
    }
    return matrix[b.length][a.length];
}
/**
 * Distancia de Levenshtein acotada: devuelve la distancia exacta si es <= max,
 * o max + 1 en cuanto se sabe que la distancia supera el umbral.
 * Es mucho más rápida que levenshtein() cuando solo interesa saber si dos textos son "similares".
 */
function levenshteinAcotada(a, b, max) {
    if (a === b)
        return 0;
    if (Math.abs(a.length - b.length) > max)
        return max + 1;
    let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const actual = [i];
        let minimoFila = i;
        for (let j = 1; j <= b.length; j++) {
            const costo = a[i - 1] === b[j - 1] ? 0 : 1;
            actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + costo);
            if (actual[j] < minimoFila)
                minimoFila = actual[j];
        }
        // Si toda la fila supera el umbral, las siguientes filas también lo harán
        if (minimoFila > max)
            return max + 1;
        previa = actual;
    }
    return Math.min(previa[b.length], max + 1);
}
/**
 * Combina números de teléfono preservando los nuevos como prioritarios
 * y conservando hasta 3 números únicos.
 */
function mergePhones(incoming, existing) {
    const newOnes = incoming.map((p) => (p || '').trim()).filter(Boolean);
    const oldOnes = existing.map((p) => (p || '').trim()).filter(Boolean);
    const combined = [];
    for (const phone of newOnes) {
        if (!combined.includes(phone))
            combined.push(phone);
    }
    for (const phone of oldOnes) {
        if (!combined.includes(phone))
            combined.push(phone);
    }
    return [
        combined[0] || '',
        combined[1] || '',
        combined[2] || '',
    ];
}
