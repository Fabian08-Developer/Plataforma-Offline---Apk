/**
 * Servicio de exportación de encuestas a Excel (XLSX) con diseño profesional.
 * Usa ExcelJS para generar el archivo con estilos, colores, bordes y anchos de columna.
 */
import ExcelJS from 'exceljs';

export interface SurveyExportRow {
  id: number | string;
  tipo_documento?: string;
  documento_identidad?: string;
  nombres?: string;
  apellidos?: string;
  telefono_1?: string;
  telefono_2?: string;
  telefono_3?: string;
  direccion?: string;
  profesion?: string;
  fecha_registro?: string;
  encuestadorNombre?: string;
  estado_sincronizacion?: string;
}

// ─── Paleta de colores ────────────────────────────────────────────────────────
const COLOR = {
  headerBg:     '1E3A5F',   // Azul oscuro profesional
  headerFont:   'FFFFFF',   // Blanco
  accentStripe: 'EBF3FB',   // Azul muy claro para filas alternas
  borderColor:  'B8CCE4',   // Azul grisáceo para bordes
  syncOk:       '27AE60',   // Verde — sincronizado
  syncPending:  'E67E22',   // Naranja — pendiente
  titleBg:      '2563EB',   // Azul vibrante para título
  titleFont:    'FFFFFF',
  subtitleFont: '475569',
};

// ─── Borde estándar ──────────────────────────────────────────────────────────
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: COLOR.borderColor } },
  left:   { style: 'thin', color: { argb: COLOR.borderColor } },
  bottom: { style: 'thin', color: { argb: COLOR.borderColor } },
  right:  { style: 'thin', color: { argb: COLOR.borderColor } },
};

// ─── Función principal ────────────────────────────────────────────────────────
export async function exportSurveysToExcel(
  surveys: SurveyExportRow[],
  filename?: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  // Meta del workbook
  workbook.creator    = 'Plataforma Encuestas';
  workbook.lastModifiedBy = 'Plataforma Encuestas';
  workbook.created    = new Date();
  workbook.modified   = new Date();

  const ws = workbook.addWorksheet('Encuestas', {
    pageSetup: {
      paperSize:   9,          // A4
      orientation: 'landscape',
      fitToPage:   true,
      fitToWidth:  1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    views: [{ state: 'frozen', ySplit: 4 }],  // congela hasta la fila 4 (encabezados)
  });

  // ── Anchos de columna ────────────────────────────────────────────────────────
  ws.columns = [
    { key: 'id',           width: 8  },
    { key: 'tipo_doc',     width: 14 },
    { key: 'documento',    width: 18 },
    { key: 'nombres',      width: 22 },
    { key: 'apellidos',    width: 22 },
    { key: 'telefono1',    width: 18 },
    { key: 'telefono2',    width: 18 },
    { key: 'telefono3',    width: 18 },
    { key: 'direccion',    width: 30 },
    { key: 'profesion',    width: 20 },
    { key: 'fecha',        width: 20 },
    { key: 'encuestador',  width: 22 },
    { key: 'estado',       width: 16 },
  ];

  // ── Fila 1: Título principal ─────────────────────────────────────────────────
  ws.mergeCells('A1:M1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Reporte de Encuestas';
  titleCell.font  = { name: 'Calibri', size: 16, bold: true, color: { argb: COLOR.titleFont } };
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.titleBg } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 36;

  // ── Fila 2: Subtítulo con fecha de generación ────────────────────────────────
  ws.mergeCells('A2:M2');
  const subtitleCell = ws.getCell('A2');
  subtitleCell.value = `Generado el ${new Date().toLocaleString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })}   ·   Total de registros: ${surveys.length}`;
  subtitleCell.font      = { name: 'Calibri', size: 10, italic: true, color: { argb: COLOR.subtitleFont } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  subtitleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
  ws.getRow(2).height = 20;

  // ── Fila 3: Vacía de separación ──────────────────────────────────────────────
  ws.getRow(3).height = 6;

  // ── Fila 4: Encabezados de columna ───────────────────────────────────────────
  const HEADERS = [
    'ID', 'Tipo Doc.', 'Documento', 'Nombres', 'Apellidos',
    'Teléfono 1', 'Teléfono 2', 'Teléfono 3', 'Dirección',
    'Profesión', 'Fecha Registro', 'Encuestador', 'Estado',
  ];

  const headerRow = ws.getRow(4);
  headerRow.height = 28;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.headerFont } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = THIN_BORDER;
  });

  // ── Filas de datos ────────────────────────────────────────────────────────────
  surveys.forEach((s, index) => {
    const isOdd   = index % 2 === 0;
    const rowData = [
      s.id ?? '',
      s.tipo_documento    ?? 'C.C',
      s.documento_identidad ?? '',
      s.nombres           ?? '',
      s.apellidos         ?? '',
      s.telefono_1        ?? '',
      s.telefono_2        ?? '',
      s.telefono_3        ?? '',
      s.direccion         ?? '',
      s.profesion         ?? '',
      s.fecha_registro    ?? '',
      s.encuestadorNombre ?? 'Desconocido',
      s.estado_sincronizacion ?? 'sincronizado',
    ];

    const row = ws.addRow(rowData);
    row.height = 22;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Fondo alternado
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: isOdd ? 'FFFFFF' : COLOR.accentStripe },
      };
      cell.font   = { name: 'Calibri', size: 10 };
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };

      // Columna de Estado: color según valor
      if (colNumber === 13) {
        const estado = (cell.value as string ?? '').toLowerCase();
        const isSynced = estado === 'sincronizado' || estado === 'synced';
        cell.font = {
          name: 'Calibri', size: 10, bold: true,
          color: { argb: isSynced ? COLOR.syncOk : COLOR.syncPending },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      // Columna ID: centrar
      if (colNumber === 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  });

  // ── Fila de pie de página ─────────────────────────────────────────────────────
  const totalRow = ws.addRow(['', '', '', '', '', '', '', '', '', '', '', 'Total', surveys.length]);
  totalRow.height = 22;
  const totalLabelCell  = totalRow.getCell(12);
  const totalValueCell  = totalRow.getCell(13);
  totalLabelCell.font   = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.headerFont } };
  totalValueCell.font   = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.headerFont } };
  totalLabelCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerBg } };
  totalValueCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerBg } };
  totalLabelCell.alignment = { vertical: 'middle', horizontal: 'right' };
  totalValueCell.alignment = { vertical: 'middle', horizontal: 'center' };
  totalLabelCell.border = THIN_BORDER;
  totalValueCell.border = THIN_BORDER;

  // ── Autofilter en encabezados ─────────────────────────────────────────────────
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 13 } };

  // ── Generar y descargar el archivo ────────────────────────────────────────────
  const buffer    = await workbook.xlsx.writeBuffer();
  const blob      = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href  = url;
  link.download = filename ?? `encuestas_export_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
