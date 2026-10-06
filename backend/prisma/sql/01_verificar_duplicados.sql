-- PASO 1 (solo lectura): cédulas repetidas en la tabla de encuestas.
-- Debe devolver 0 filas antes de aplicar 02_columna_y_unicidad.sql.
-- Si devuelve filas, hay que fusionar o corregir esas encuestas desde el panel (Bandeja de Duplicados).
SELECT documento_identidad, COUNT(*) AS repeticiones, array_agg(id ORDER BY id) AS ids
FROM "Encuesta"
GROUP BY documento_identidad
HAVING COUNT(*) > 1;
