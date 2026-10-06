-- PASO 2: aplicar SOLO después de comprobar que 01_verificar_duplicados.sql devuelve 0 filas.
-- Es equivalente a `npx prisma db push` con el esquema actual, pero explícito y revisable.

-- Fecha de última modificación (resolución de conflictos en la sincronización). Columna nullable: no afecta datos existentes.
ALTER TABLE "Encuesta" ADD COLUMN IF NOT EXISTS "actualizado_en" TIMESTAMP(3);

-- Cédula única: impide duplicados exactos a nivel de base de datos, no solo en la aplicación.
CREATE UNIQUE INDEX IF NOT EXISTS "Encuesta_documento_identidad_key" ON "Encuesta" ("documento_identidad");
