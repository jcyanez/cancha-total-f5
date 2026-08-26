-- 001 - La tabla de reservas.
--
-- Esta es la tabla que el proveedor dejó, transcrita sin cambios: mismos
-- nombres, mismos tipos, mismo valor por omisión. La migración existe para
-- poder crear la base en Turso de forma reproducible, no para modificar el
-- esquema.
--
-- Vive en un solo archivo porque estuvo escrita dos veces (server.js y
-- datos.js) y un cambio aplicado en uno solo dejaba los dos discrepando en
-- silencio: es el hallazgo E-9.
--
-- IF NOT EXISTS y nada de DROP: correrla de nuevo sobre una base con datos no
-- toca los datos.

CREATE TABLE IF NOT EXISTS reservas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cancha INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  hora INTEGER NOT NULL,
  cliente TEXT NOT NULL,
  telefono TEXT,
  precio INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activa',
  creada_en TEXT NOT NULL DEFAULT (datetime('now'))
);
