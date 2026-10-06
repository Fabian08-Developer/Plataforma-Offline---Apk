-- PASO 3: tabla de avisos de cédula repetida (capturas de OTRO encuestador que chocaron con un registro existente).
-- Es aditiva: no modifica ni borra datos existentes. Equivale a lo que genera `prisma db push` con el esquema actual.
CREATE TABLE IF NOT EXISTS "AvisoCedula" (
  "id" SERIAL PRIMARY KEY,
  "documento_identidad" TEXT NOT NULL,
  "encuesta_id" INTEGER NOT NULL,
  "encuestador_id" INTEGER NOT NULL,
  "datos_recibidos" JSONB NOT NULL,
  "datos_previos" JSONB NOT NULL,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resuelto" BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "AvisoCedula_resuelto_idx" ON "AvisoCedula" ("resuelto");
