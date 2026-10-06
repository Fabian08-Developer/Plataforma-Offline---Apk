"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.esViolacionUnicidad = esViolacionUnicidad;
/** Código de Prisma para violación de restricción única (P2002), p. ej. documento o usuario repetido */
function esViolacionUnicidad(error) {
    return typeof error === 'object' && error !== null && error.code === 'P2002';
}
