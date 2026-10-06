"use strict";
/**
 * Reglas de visibilidad de los datos de encuestas.
 * Un encuestador solo ve sus propias encuestas completas. Los datos de otros encuestadores
 * (nombres, cédula, teléfonos, dirección) nunca se envían a su dispositivo: solo se le informa que existe un registro.
 * El administrador ve todo.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MENSAJE_SIMILAR_AJENO = exports.MENSAJE_CEDULA_AJENA = void 0;
exports.esPropia = esPropia;
exports.MENSAJE_CEDULA_AJENA = 'Esta cédula ya está registrada por otro encuestador. Consulte al administrador.';
exports.MENSAJE_SIMILAR_AJENO = 'Posible duplicado con un registro de otro encuestador. Consulte al administrador.';
/** true si el usuario puede ver los datos completos de una encuesta de este encuestador */
function esPropia(encuestadorId, usuario) {
    if (!usuario)
        return false;
    return usuario.rol === 'admin' || encuestadorId === usuario.id;
}
