// Cancha Total F5 - sistema de reservas
// Node + Express + better-sqlite3, vistas renderizadas en el servidor.

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const db = new Database(path.join(__dirname, 'reservas.db'));

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

// -----------------------------------------------------------------------
// Función vieja que ya no usa nadie. Quedó del primer borrador cuando se
// pensó en bloquear reservas en feriados. Se deja por si se retoma la idea.
function esFeriado(fecha) {
  const feriados = ['01-01', '04-11', '05-01', '07-25', '08-15', '09-15', '12-25'];
  const mesDia = fecha.slice(5);
  return feriados.includes(mesDia);
}

// Precios de temporada alta (plan viejo, ya no se usa - se dejó de cobrar
// distinto en temporada alta porque el dueño lo canceló). No borrar por si
// se retoma en diciembre.
// const PRECIO_TEMPORADA_ALTA_DIURNO = 18000;
// const PRECIO_TEMPORADA_ALTA_NOCTURNO = 25000;
// function esTemporadaAlta(fecha) {
//   const mes = Number(fecha.slice(5, 7));
//   return mes === 12 || mes === 1;
// }
// -----------------------------------------------------------------------

function formatColones(monto) {
  return '₡' + Math.round(monto).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Tarifa del bloque, determinada por su hora de inicio (RN-18, RN-19, RN-20).
const PRECIO_DIURNO = 15000;
const PRECIO_CON_LUZ = 20000;
const HORA_EN_QUE_ENCIENDE_LA_LUZ = 17;

function tarifaDelBloque(hora) {
  return hora >= HORA_EN_QUE_ENCIENDE_LA_LUZ ? PRECIO_CON_LUZ : PRECIO_DIURNO;
}

function checkDisponible(cancha, fecha, hora) {
  const fila = db.prepare(
    `SELECT COUNT(*) AS total FROM reservas
     WHERE cancha = ? AND fecha = ? AND hora = ? AND estado = 'activa'`
  ).get(cancha, fecha, hora);
  return fila.total === 0;
}

function getReservasDelDia(fecha) {
  return db.prepare(
    `SELECT * FROM reservas WHERE fecha = ? ORDER BY cancha, hora`
  ).all(fecha);
}

function crearReserva(datos) {
  const info = db.prepare(
    `INSERT INTO reservas (cancha, fecha, hora, cliente, telefono, precio, estado)
     VALUES (?, ?, ?, ?, ?, ?, 'activa')`
  ).run(datos.cancha, datos.fecha, datos.hora, datos.cliente, datos.telefono, datos.precio);
  return info.lastInsertRowid;
}

function hoyISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function layout(titulo, contenido) {
  return `<!DOCTYPE html>
<html lang="es-CR">
<head>
<meta charset="UTF-8">
<title>${titulo} - Cancha Total F5</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 900px; margin: 20px auto; padding: 0 15px; color: #222; }
  h1 { color: #145a32; }
  h2 { border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #eef7ee; }
  .libre { color: #145a32; font-weight: bold; }
  .ocupado { color: #a33; }
  .cancelada { color: #999; text-decoration: line-through; }
  .error { background: #fdecea; border: 1px solid #f5c2c0; color: #a33; padding: 10px; margin-bottom: 15px; }
  .ok { background: #eaf7ea; border: 1px solid #b8e0b8; color: #145a32; padding: 10px; margin-bottom: 15px; }
  form.reserva label { display: block; margin-top: 8px; }
  form.reserva input, form.reserva select { padding: 4px; width: 250px; }
  button { padding: 6px 12px; margin-top: 10px; cursor: pointer; }
  nav a { margin-right: 15px; }
</style>
</head>
<body>
<nav>
  <a href="/">Inicio</a>
  <a href="/disponibilidad/cancha1">Cancha 1</a>
  <a href="/disponibilidad/cancha2">Cancha 2</a>
</nav>
<h1>Cancha Total F5</h1>
${contenido}
</body>
</html>`;
}

// GET / -------------------------------------------------------------------
// Disponibilidad del día para ambas canchas + formulario de reserva.
app.get('/', (req, res) => {
  const fecha = req.query.fecha || hoyISO();

  let filasCancha1 = '';
  let filasCancha2 = '';
  for (let hora = 8; hora <= 21; hora++) {
    // Tarifa del bloque para pintar la disponibilidad.
    const precio = tarifaDelBloque(hora);

    const libre1 = checkDisponible(1, fecha, hora);
    filasCancha1 += `<tr><td>${hora}:00</td><td class="${libre1 ? 'libre' : 'ocupado'}">${libre1 ? 'Libre' : 'Ocupado'}</td><td>${formatColones(precio)}</td></tr>`;

    const libre2 = checkDisponible(2, fecha, hora);
    filasCancha2 += `<tr><td>${hora}:00</td><td class="${libre2 ? 'libre' : 'ocupado'}">${libre2 ? 'Libre' : 'Ocupado'}</td><td>${formatColones(precio)}</td></tr>`;
  }

  const contenido = `
<h2>Disponibilidad - ${fecha}</h2>
<form method="get" action="/">
  <label>Fecha: <input type="date" name="fecha" value="${fecha}"></label>
  <button type="submit">Ver</button>
</form>

<h3>Cancha 1</h3>
<table><tr><th>Hora</th><th>Estado</th><th>Tarifa</th></tr>${filasCancha1}</table>

<h3>Cancha 2</h3>
<table><tr><th>Hora</th><th>Estado</th><th>Tarifa</th></tr>${filasCancha2}</table>

<h2>Nueva reserva</h2>
<form class="reserva" method="post" action="/reservas">
  <input type="hidden" name="fecha" value="${fecha}">
  <label>Cancha:
    <select name="cancha">
      <option value="1">Cancha 1</option>
      <option value="2">Cancha 2</option>
    </select>
  </label>
  <label>Hora de inicio:
    <select name="hora" id="hora">
      ${Array.from({ length: 14 }, (_, i) => 8 + i).map(h => `<option value="${h}">${h}:00</option>`).join('')}
    </select>
  </label>
  <label>Precio estimado: <span id="precioEstimado">-</span></label>
  <label>Nombre del cliente: <input type="text" name="cliente"></label>
  <label>Teléfono: <input type="text" name="telefono"></label>
  <button type="submit">Reservar</button>
</form>

<p><a href="/dia/${fecha}">Ver lista de reservas del ${fecha}</a></p>

<script>
  function actualizarPrecio() {
    var hora = document.getElementById('hora').value;
    fetch('/api/cotizar?fecha=${fecha}&hora=' + hora)
      .then(function (r) { return r.json(); })
      .then(function (d) { document.getElementById('precioEstimado').textContent = d.precioFormateado; });
  }
  document.getElementById('hora').addEventListener('change', actualizarPrecio);
  actualizarPrecio();
</script>
`;

  res.send(layout('Inicio', contenido));
});

// GET /disponibilidad/cancha1 y /disponibilidad/cancha2 -------------------
app.get('/disponibilidad/cancha1', (req, res) => {
  const fecha = req.query.fecha || hoyISO();
  let filas = '';
  for (let hora = 8; hora <= 21; hora++) {
    const libre = checkDisponible(1, fecha, hora);
    filas += `<tr><td>${hora}:00</td><td class="${libre ? 'libre' : 'ocupado'}">${libre ? 'Libre' : 'Ocupado'}</td></tr>`;
  }
  const contenido = `
<h2>Disponibilidad Cancha 1 - ${fecha}</h2>
<form method="get" action="/disponibilidad/cancha1">
  <label>Fecha: <input type="date" name="fecha" value="${fecha}"></label>
  <button type="submit">Ver</button>
</form>
<table><tr><th>Hora</th><th>Estado</th></tr>${filas}</table>
`;
  res.send(layout('Cancha 1', contenido));
});

app.get('/disponibilidad/cancha2', (req, res) => {
  const fecha = req.query.fecha || hoyISO();
  let filas = '';
  for (let hora = 8; hora <= 21; hora++) {
    const libre = checkDisponible(2, fecha, hora);
    filas += `<tr><td>${hora}:00</td><td class="${libre ? 'libre' : 'ocupado'}">${libre ? 'Libre' : 'Ocupado'}</td></tr>`;
  }
  const contenido = `
<h2>Disponibilidad Cancha 2 - ${fecha}</h2>
<form method="get" action="/disponibilidad/cancha2">
  <label>Fecha: <input type="date" name="fecha" value="${fecha}"></label>
  <button type="submit">Ver</button>
</form>
<table><tr><th>Hora</th><th>Estado</th></tr>${filas}</table>
`;
  res.send(layout('Cancha 2', contenido));
});

// POST /reservas ------------------------------------------------------------
app.post('/reservas', (req, res) => {
  // Paso 1: leer y normalizar lo que mandó el formulario.
  const canchaTexto = req.body.cancha;
  const fecha = req.body.fecha;
  const horaTexto = req.body.hora;
  const clienteTexto = req.body.cliente;
  const telefonoTexto = req.body.telefono;

  const cancha = Number(canchaTexto);
  const hora = Number(horaTexto);
  const cliente = (clienteTexto || '').trim();
  const telefono = (telefonoTexto || '').trim();

  // Paso 2: validar cada campo.
  const errores = [];

  if (canchaTexto === undefined || canchaTexto === '') {
    errores.push('Falta indicar la cancha.');
  } else if (cancha !== 1 && cancha !== 2) {
    errores.push('La cancha debe ser 1 o 2.');
  }

  if (!fecha) {
    errores.push('Falta la fecha.');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    errores.push('El formato de la fecha es inválido.');
  }

  if (horaTexto === undefined || horaTexto === '') {
    errores.push('Falta la hora de inicio.');
  } else if (!Number.isInteger(hora) || hora < 8 || hora > 21) {
    errores.push('La hora debe ser un bloque entre las 08:00 y las 21:00.');
  }

  if (!cliente) {
    errores.push('Falta el nombre del cliente.');
  }

  if (!telefono) {
    errores.push('Falta el teléfono del cliente.');
  } else if (!/^[0-9]{8}$/.test(telefono)) {
    errores.push('El teléfono debe tener exactamente ocho dígitos.');
  }

  if (errores.length > 0) {
    const listaErrores = errores.map(e => `<li>${e}</li>`).join('');
    const contenidoError = `<div class="error"><p>No se pudo crear la reserva:</p><ul>${listaErrores}</ul></div><p><a href="/">Volver</a></p>`;
    return res.send(layout('Error', contenidoError));
  }

  // Paso 3: verificar que el bloque siga libre.
  const disponible = checkDisponible(cancha, fecha, hora);
  if (!disponible) {
    const contenidoOcupado = `<div class="error">Ese bloque ya está ocupado para la cancha ${cancha} el ${fecha} a las ${hora}:00.</div><p><a href="/">Volver</a></p>`;
    return res.send(layout('Error', contenidoOcupado));
  }

  // Paso 4: calcular el precio según el horario.
  let precio = tarifaDelBloque(hora);

  // Paso 5: contar cuántas reservas lleva este teléfono en el mes para
  // saber si aplica el descuento de cliente frecuente.
  const mesFecha = fecha.slice(0, 7);
  const conteoMes = db.prepare(
    `SELECT COUNT(*) AS total FROM reservas
     WHERE telefono = ? AND substr(fecha, 1, 7) = ?`
  ).get(telefono, mesFecha);

  const totalConEstaReserva = conteoMes.total + 1;
  const aplicaDescuento = totalConEstaReserva >= 4;
  if (aplicaDescuento) {
    precio = precio * 0.9;
  }

  // Paso 6: guardar la reserva.
  const id = crearReserva({ cancha, fecha, hora, cliente, telefono, precio });

  // Paso 7: armar la página de confirmación.
  const notaDescuento = aplicaDescuento ? ' (con 10% de descuento por cliente frecuente)' : '';
  const contenido = `
<div class="ok">
  <p>Reserva #${id} creada.</p>
  <p>Cancha ${cancha}, ${fecha} a las ${hora}:00, cliente ${cliente}.</p>
  <p>Precio: ${formatColones(precio)}${notaDescuento}</p>
</div>
<p><a href="/dia/${fecha}">Ver lista del día</a> | <a href="/">Volver</a></p>
`;
  res.send(layout('Reserva creada', contenido));
});

// POST /reservas/:id/cancelar ------------------------------------------------
app.post('/reservas/:id/cancelar', (req, res) => {
  const id = Number(req.params.id);
  const reserva = db.prepare('SELECT * FROM reservas WHERE id = ?').get(id);

  if (!reserva) {
    return res.send(layout('Error', `<div class="error">No existe la reserva #${id}.</div>`));
  }
  if (reserva.estado === 'cancelada') {
    return res.send(layout('Error', `<div class="error">La reserva #${id} ya estaba cancelada.</div><p><a href="/dia/${reserva.fecha}">Volver</a></p>`));
  }

  // Regla de las 24 horas: la reserva tiene que ser para una fecha futura.
  const hoyFecha = hoyISO();
  if (reserva.fecha > hoyFecha) {
    db.prepare(`UPDATE reservas SET estado = 'cancelada' WHERE id = ?`).run(id);
    return res.send(layout('Cancelada', `<div class="ok">Reserva #${id} cancelada.</div><p><a href="/dia/${reserva.fecha}">Volver</a></p>`));
  } else {
    return res.send(layout('Error', `<div class="error">La reserva #${id} no se puede cancelar: falta menos de 24 horas para el bloque.</div><p><a href="/dia/${reserva.fecha}">Volver</a></p>`));
  }
});

// GET /dia/:fecha -------------------------------------------------------------
app.get('/dia/:fecha', (req, res) => {
  const fecha = req.params.fecha;
  const reservas = getReservasDelDia(fecha);

  const filas = reservas.map(r => {
    const claseFila = r.estado === 'cancelada' ? 'cancelada' : '';
    const botonCancelar = r.estado === 'activa'
      ? `<form method="post" action="/reservas/${r.id}/cancelar" style="display:inline"><button type="submit">Cancelar</button></form>`
      : '-';
    return `<tr class="${claseFila}"><td>${r.hora}:00</td><td>Cancha ${r.cancha}</td><td>${r.cliente}</td><td>${r.telefono || ''}</td><td>${formatColones(r.precio)}</td><td>${r.estado}</td><td>${botonCancelar}</td></tr>`;
  }).join('');

  const contenido = `
<h2>Reservas del ${fecha}</h2>
<table>
  <tr><th>Hora</th><th>Cancha</th><th>Cliente</th><th>Teléfono</th><th>Precio</th><th>Estado</th><th></th></tr>
  ${filas || '<tr><td colspan="7">No hay reservas para esta fecha.</td></tr>'}
</table>
<p><a href="/?fecha=${fecha}">Volver a disponibilidad</a></p>
`;
  res.send(layout('Reservas del día', contenido));
});

// GET /api/cotizar --------------------------------------------------------
// Precio previo de un bloque, usado por el formulario de la página de inicio.
app.get('/api/cotizar', (req, res) => {
  const hora = Number(req.query.hora);

  // Cotización rápida para el formulario.
  const precio = tarifaDelBloque(hora);

  res.json({ precio, precioFormateado: formatColones(precio) });
});

const PUERTO = 3000;
app.listen(PUERTO, () => {
  console.log(`Cancha Total F5 escuchando en el puerto ${PUERTO}`);
});
