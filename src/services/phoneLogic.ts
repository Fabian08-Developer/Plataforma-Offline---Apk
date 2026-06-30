/**
 * Implementa la lógica de rotación de teléfonos (MRU - Most Recently Used)
 * 
 * Reglas:
 * 1. El teléfono nuevo o recién ingresado siempre va a la posición 1.
 * 2. Los teléfonos existentes se empujan hacia abajo (1 pasa a 2, 2 pasa a 3).
 * 3. Si se inserta un teléfono que ya estaba en la posición 2 o 3, se mueve a la 1
 *    y los demás bajan una posición ocupando el hueco.
 * 4. El máximo de teléfonos permitidos es 3. El excedente (antiguo 3) se elimina.
 */
export function updatePhonesList(currentPhones: (string | undefined)[], newPhone: string | undefined): string[] {
  // Limpiar lista actual de vacíos
  let phones = currentPhones.filter((p): p is string => p !== undefined && p.trim() !== '');
  
  if (!newPhone || newPhone.trim() === '') {
    return phones; // No hay cambio
  }
  
  newPhone = newPhone.trim();
  
  // Si el teléfono ya existe, lo quitamos de su posición actual
  const existingIndex = phones.indexOf(newPhone);
  if (existingIndex !== -1) {
    phones.splice(existingIndex, 1);
  }
  
  // Insertar en la posición 1 (inicio del array)
  phones.unshift(newPhone);
  
  // Mantener solo los últimos 3 teléfonos
  if (phones.length > 3) {
    phones = phones.slice(0, 3);
  }
  
  return phones;
}
