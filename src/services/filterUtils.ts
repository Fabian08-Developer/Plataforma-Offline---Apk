/**
 * Utilidades para el filtrado avanzado de encuestas:
 * - Filtros por fecha (Hoy, Ayer, Esta Semana, Este Mes, Rango personalizado)
 * - Filtros por franja horaria (Hora inicio a Hora fin)
 * - Filtros por estado de sincronización y encuestador
 */

export type DatePreset = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';
export type SyncStatusFilter = 'all' | 'sincronizado' | 'pendiente';

export interface FilterState {
  preset: DatePreset;
  fechaDesde: string; // YYYY-MM-DD
  fechaHasta: string; // YYYY-MM-DD
  horaDesde: string;  // HH:mm
  horaHasta: string;  // HH:mm
  encuestador: string; // 'all' o ID
  estadoSync: SyncStatusFilter;
  searchTerm: string;
}

export const INITIAL_FILTER_STATE: FilterState = {
  preset: 'all',
  fechaDesde: '',
  fechaHasta: '',
  horaDesde: '',
  horaHasta: '',
  encuestador: 'all',
  estadoSync: 'all',
  searchTerm: '',
};

/** Formatea una fecha local Date como YYYY-MM-DD */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Obtiene rango para "Hoy" */
export function getTodayRange(): { desde: string; hasta: string } {
  const today = formatLocalDate(new Date());
  return { desde: today, hasta: today };
}

/** Obtiene rango para "Ayer" */
export function getYesterdayRange(): { desde: string; hasta: string } {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = formatLocalDate(d);
  return { desde: yesterday, hasta: yesterday };
}

/** Obtiene rango para "Esta Semana" (Lunes a Domingo de la semana actual) */
export function getThisWeekRange(): { desde: string; hasta: string } {
  const now = new Date();
  const day = now.getDay(); // 0 = Domingo, 1 = Lunes, ...
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    desde: formatLocalDate(monday),
    hasta: formatLocalDate(sunday),
  };
}

/** Obtiene rango para "Este Mes" (Primer al último día del mes en curso) */
export function getThisMonthRange(): { desde: string; hasta: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  
  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);

  return {
    desde: formatLocalDate(firstDay),
    hasta: formatLocalDate(lastDay),
  };
}

/** Extrae la hora local en formato HH:mm de un registro de encuesta */
export function getSurveyTime(survey: any): string | null {
  // 1. Si tiene hora_registro explícita (ej. "14:35" o "14:35:10")
  if (survey.hora_registro) {
    const parts = String(survey.hora_registro).split(':');
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }
  }

  // 2. Si tiene timestamp creado_en o sincronizado_en
  const timestamp = survey.creado_en || survey.sincronizado_en;
  if (timestamp) {
    try {
      const d = new Date(timestamp);
      if (!isNaN(d.getTime())) {
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${min}`;
      }
    } catch {
      // Ignorar error de parsing
    }
  }

  return null;
}

/** Evalúa si una encuesta cumple todos los filtros activos */
export function matchesFilters(survey: any, filters: FilterState): boolean {
  // 1. Filtro por Encuestador
  if (filters.encuestador !== 'all') {
    const encId = survey.encuestador_id ? String(survey.encuestador_id) : '';
    const encUser = survey.encuestador_usuario || survey.encuestador?.usuario || '';
    if (encId !== filters.encuestador && encUser !== filters.encuestador) {
      return false;
    }
  }

  // 2. Filtro por Estado de Sincronización
  if (filters.estadoSync !== 'all') {
    const sync = survey.estado_sincronizacion || 'pendiente';
    if (sync !== filters.estadoSync) {
      return false;
    }
  }

  // 3. Filtro por Fecha (Fecha Desde / Hasta)
  const surveyDate = (survey.fecha_registro || '').substring(0, 10);
  if (filters.fechaDesde && surveyDate) {
    if (surveyDate < filters.fechaDesde) return false;
  }
  if (filters.fechaHasta && surveyDate) {
    if (surveyDate > filters.fechaHasta) return false;
  }

  // 4. Filtro por Hora ("De una hora a otra", HH:mm)
  if (filters.horaDesde || filters.horaHasta) {
    const time = getSurveyTime(survey);
    if (time) {
      if (filters.horaDesde && time < filters.horaDesde) return false;
      if (filters.horaHasta && time > filters.horaHasta) return false;
    } else {
      // Si la encuesta no tiene hora registrada y el usuario requiere filtro por hora,
      // la omitimos porque no cumple la franja horaria requerida
      return false;
    }
  }

  // 5. Filtro de Búsqueda de Texto
  if (filters.searchTerm.trim()) {
    const term = filters.searchTerm.toLowerCase().trim();
    const doc = (survey.documento_identidad || '').toLowerCase();
    const nombres = (survey.nombres || '').toLowerCase();
    const apellidos = (survey.apellidos || '').toLowerCase();
    const fullName = `${nombres} ${apellidos}`;
    const tel1 = (survey.telefono_1 || '').toLowerCase();
    const tel2 = (survey.telefono_2 || '').toLowerCase();
    const tel3 = (survey.telefono_3 || '').toLowerCase();
    const dir = (survey.direccion || '').toLowerCase();
    const prof = (survey.profesion || '').toLowerCase();
    const encName = (survey.encuestador?.nombre || survey.encuestador_usuario || '').toLowerCase();

    const matches =
      doc.includes(term) ||
      fullName.includes(term) ||
      tel1.includes(term) ||
      tel2.includes(term) ||
      tel3.includes(term) ||
      dir.includes(term) ||
      prof.includes(term) ||
      encName.includes(term);

    if (!matches) return false;
  }

  return true;
}
