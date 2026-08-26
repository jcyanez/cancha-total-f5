-- 002 - Índices para las dos consultas que el sistema repite.
--
-- No cambia nada de lo que el sistema hace: cambia lo que cuesta hacerlo.
-- Con la base en un archivo local daba igual; con la base al otro lado de la
-- red, cada consulta es un viaje, y estas dos son las que más se repiten.
--
--   fecha + estado   -> la grilla de disponibilidad y la lista del día
--   telefono + creada_en -> el conteo de cliente frecuente (RN-21, RN-23)
--
-- IF NOT EXISTS: correrla dos veces no hace nada la segunda.

CREATE INDEX IF NOT EXISTS idx_reservas_fecha_estado
  ON reservas (fecha, estado);

CREATE INDEX IF NOT EXISTS idx_reservas_telefono_creada
  ON reservas (telefono, creada_en);
