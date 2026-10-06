/**
 * Reglas de visibilidad de los datos de encuestas.
 * Un encuestador solo ve sus propias encuestas completas. Los datos de otros encuestadores
 * (nombres, cédula, teléfonos, dirección) nunca se envían a su dispositivo: solo se le informa que existe un registro.
 * El administrador ve todo.
 */

export const MENSAJE_CEDULA_AJENA = 'Esta cédula ya está registrada por otro encuestador. Consulte al administrador.';
export const MENSAJE_SIMILAR_AJENO = 'Posible duplicado con un registro de otro encuestador. Consulte al administrador.';

export interface UsuarioSesion {
  id: number;
  rol: string;
}

/** true si el usuario puede ver los datos completos de una encuesta de este encuestador */
export function esPropia(encuestadorId: number, usuario: UsuarioSesion | undefined): boolean {
  if (!usuario) return false;
  return usuario.rol === 'admin' || encuestadorId === usuario.id;
}
