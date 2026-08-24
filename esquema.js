// Esquema de la base de datos.
//
// Vive acá y no repetido en server.js y datos.js: escrito dos veces, un cambio
// de esquema aplicado en uno solo dejaba los dos archivos discrepando en
// silencio, y el sistema arrancando contra una tabla que no era la que el
// script de datos creaba (hallazgo E-9).

function crearTablaDeReservas(db) {
  db.exec(`
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
  )
`);
}

module.exports = { crearTablaDeReservas };
