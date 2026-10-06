"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registrarEliminaciones = registrarEliminaciones;
/**
 * Registra cédulas de encuestas eliminadas en el servidor.
 * Los dispositivos en campo consultan esta tabla al sincronizar para no volver a subir esos registros.
 * Si la cédula ya estaba registrada, se actualiza la fecha: una nueva eliminación debe prevalecer
 * sobre copias creadas antes de ella.
 * Debe llamarse dentro de la misma transacción que borra el registro, para que no queden datos a medias.
 */
async function registrarEliminaciones(cliente, documentos) {
    const unicos = [...new Set(documentos.map((d) => d.trim()).filter(Boolean))];
    for (const documento of unicos) {
        await cliente.$executeRaw `
      INSERT INTO encuestas_eliminadas (documento_identidad)
      VALUES (${documento})
      ON CONFLICT (documento_identidad) DO UPDATE SET eliminado_en = NOW()
    `;
    }
}
