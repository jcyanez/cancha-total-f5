// Cancha Total F5 - sistema de reservas
// Node + Express + better-sqlite3, vistas renderizadas en el servidor.

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { crearTablaDeReservas } = require('./esquema.js');

// Configuración. Los valores por omisión son los de siempre: el sistema sin
// variables de entorno arranca exactamente como arrancaba. Existen para poder
// levantarlo en otro puerto, contra otra base o con el reloj puesto en un
// instante fijo, sin tocar el código (hallazgos E-1, E-2, E-3, E-6).
const PUERTO = Number(process.env.CANCHA_PUERTO ?? 3000);
const RUTA_BASE = process.env.CANCHA_BD || path.join(__dirname, 'reservas.db');
const INSTANTE_FIJO = process.env.CANCHA_AHORA ? new Date(process.env.CANCHA_AHORA) : null;

// El único lugar del sistema que lee el reloj.
function ahora() {
  return INSTANTE_FIJO ? new Date(INSTANTE_FIJO) : new Date();
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const db = new Database(RUTA_BASE);

crearTablaDeReservas(db);

// Lo que escribe el cliente se muestra como texto, nunca se interpreta como
// parte del documento (PANT-16).
function escaparHTML(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Dentro de un bloque <script> las entidades HTML no protegen: el navegador no
// las decodifica ahí. El valor va como literal de JavaScript, y se le esconde
// el < para que no pueda cerrar el bloque.
function escaparParaGuion(valor) {
  return JSON.stringify(String(valor)).replace(/</g, '\\u003C');
}

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

// Cliente frecuente (RN-21, RN-25): cuatro o más reservas en el mismo mes,
// contando la que se está haciendo, pagan 10% menos.
const RESERVAS_PARA_SER_FRECUENTE = 4;
const DESCUENTO_DE_FRECUENTE = 0.1;

// `reservasDelMes` son las que el cliente ya lleva; la que está haciendo no
// viene contada.
function esClienteFrecuente(reservasDelMes) {
  return reservasDelMes + 1 >= RESERVAS_PARA_SER_FRECUENTE;
}

function precioConDescuento(precio, reservasDelMes) {
  return esClienteFrecuente(reservasDelMes) ? precio * (1 - DESCUENTO_DE_FRECUENTE) : precio;
}

// Plazo de cancelación (RN-27, RN-28): se mide en horas hasta el inicio del
// partido, no en días de calendario.
const HORAS_DE_PLAZO_PARA_CANCELAR = 24;

// Horas que faltan para que empiece el partido de una reserva, contadas desde
// un instante dado. No lee el reloj ni la base: se le pasa todo.
function horasHastaElPartido(reserva, instante) {
  const inicio = new Date(`${reserva.fecha}T${String(reserva.hora).padStart(2, '0')}:00:00`);
  return (inicio - instante) / (1000 * 60 * 60);
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

// Sello de tiempo con el formato que usa SQLite, tomado del reloj de la
// aplicación. Antes lo ponía el valor por omisión de la tabla, que usa el
// reloj de SQLite en UTC: en Costa Rica eso grababa una reserva del 31 a las
// 18:30 como registrada al día siguiente, y en fin de mes, en el mes siguiente.
function selloDeTiempo(fecha) {
  const dosCifras = (n) => String(n).padStart(2, '0');
  const dia = `${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}`;
  const reloj = `${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}:${dosCifras(fecha.getSeconds())}`;
  return `${dia} ${reloj}`;
}

function crearReserva(datos) {
  const info = db.prepare(
    `INSERT INTO reservas (cancha, fecha, hora, cliente, telefono, precio, estado, creada_en)
     VALUES (?, ?, ?, ?, ?, ?, 'activa', ?)`
  ).run(
    datos.cancha, datos.fecha, datos.hora, datos.cliente, datos.telefono, datos.precio,
    selloDeTiempo(ahora())
  );
  return info.lastInsertRowid;
}

function hoyISO() {
  const d = ahora();
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
<h2>Disponibilidad - ${escaparHTML(fecha)}</h2>
<form method="get" action="/">
  <label>Fecha: <input type="date" name="fecha" value="${escaparHTML(fecha)}"></label>
  <button type="submit">Ver</button>
</form>

<h3>Cancha 1</h3>
<table><tr><th>Hora</th><th>Estado</th><th>Tarifa</th></tr>${filasCancha1}</table>

<h3>Cancha 2</h3>
<table><tr><th>Hora</th><th>Estado</th><th>Tarifa</th></tr>${filasCancha2}</table>

<h2>Nueva reserva</h2>
<form class="reserva" method="post" action="/reservas">
  <input type="hidden" name="fecha" value="${escaparHTML(fecha)}">
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

<p><a href="/dia/${escaparHTML(fecha)}">Ver lista de reservas del ${escaparHTML(fecha)}</a></p>

<script>
  function actualizarPrecio() {
    var hora = document.getElementById('hora').value;
    fetch(${escaparParaGuion('/api/cotizar?fecha=' + fecha + '&hora=')} + hora)
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
// Los dos son la misma pantalla con distinto número de cancha.
function pantallaDeDisponibilidad(cancha, req, res) {
  const fecha = req.query.fecha || hoyISO();
  let filas = '';
  for (let hora = 8; hora <= 21; hora++) {
    const libre = checkDisponible(cancha, fecha, hora);
    filas += `<tr><td>${hora}:00</td><td class="${libre ? 'libre' : 'ocupado'}">${libre ? 'Libre' : 'Ocupado'}</td></tr>`;
  }
  const contenido = `
<h2>Disponibilidad Cancha ${cancha} - ${escaparHTML(fecha)}</h2>
<form method="get" action="/disponibilidad/cancha${cancha}">
  <label>Fecha: <input type="date" name="fecha" value="${escaparHTML(fecha)}"></label>
  <button type="submit">Ver</button>
</form>
<table><tr><th>Hora</th><th>Estado</th></tr>${filas}</table>
`;
  res.send(layout(`Cancha ${cancha}`, contenido));
}

app.get('/disponibilidad/cancha1', (req, res) => pantallaDeDisponibilidad(1, req, res));
app.get('/disponibilidad/cancha2', (req, res) => pantallaDeDisponibilidad(2, req, res));

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
    const contenidoOcupado = `<div class="error">Ese bloque ya está ocupado para la cancha ${cancha} el ${escaparHTML(fecha)} a las ${hora}:00.</div><p><a href="/">Volver</a></p>`;
    return res.send(layout('Error', contenidoOcupado));
  }

  // Paso 4: calcular el precio según el horario.
  let precio = tarifaDelBloque(hora);

  // Paso 5: contar cuántas reservas lleva este teléfono en el mes para
  // saber si aplica el descuento de cliente frecuente. El mes que cuenta es
  // aquel en que se registró la reserva, no aquel en que se juega el partido
  // (RN-23). Las canceladas no cuentan: frecuente es el que juega, no el que
  // aparta (RN-24).
  const mesDeRegistro = hoyISO().slice(0, 7);
  const conteoMes = db.prepare(
    `SELECT COUNT(*) AS total FROM reservas
     WHERE telefono = ? AND substr(creada_en, 1, 7) = ?
       AND estado = 'activa'`
  ).get(telefono, mesDeRegistro);

  const aplicaDescuento = esClienteFrecuente(conteoMes.total);
  precio = precioConDescuento(precio, conteoMes.total);

  // Paso 6: guardar la reserva.
  const id = crearReserva({ cancha, fecha, hora, cliente, telefono, precio });

  // Paso 7: armar la página de confirmación.
  const notaDescuento = aplicaDescuento ? ' (con 10% de descuento por cliente frecuente)' : '';
  const contenido = `
<div class="ok">
  <p>Reserva #${id} creada.</p>
  <p>Cancha ${cancha}, ${escaparHTML(fecha)} a las ${hora}:00, cliente ${escaparHTML(cliente)}.</p>
  <p>Precio: ${formatColones(precio)}${notaDescuento}</p>
</div>
<p><a href="/dia/${escaparHTML(fecha)}">Ver lista del día</a> | <a href="/">Volver</a></p>
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

  // Regla de las 24 horas: faltan 24 o más hasta que empiece el partido.
  if (horasHastaElPartido(reserva, ahora()) >= HORAS_DE_PLAZO_PARA_CANCELAR) {
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
    return `<tr class="${claseFila}"><td>${r.hora}:00</td><td>Cancha ${r.cancha}</td><td>${escaparHTML(r.cliente)}</td><td>${escaparHTML(r.telefono || '')}</td><td>${formatColones(r.precio)}</td><td>${r.estado}</td><td>${botonCancelar}</td></tr>`;
  }).join('');

  const contenido = `
<h2>Reservas del ${escaparHTML(fecha)}</h2>
<table>
  <tr><th>Hora</th><th>Cancha</th><th>Cliente</th><th>Teléfono</th><th>Precio</th><th>Estado</th><th></th></tr>
  ${filas || '<tr><td colspan="7">No hay reservas para esta fecha.</td></tr>'}
</table>
<p><a href="/?fecha=${escaparHTML(fecha)}">Volver a disponibilidad</a></p>
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

// Solo arranca si se lo invoca directamente. Cargar este archivo desde una
// prueba ya no levanta un servidor ni ocupa un puerto.
if (require.main === module) {
  const servidor = app.listen(PUERTO, () => {
    console.log(`Cancha Total F5 escuchando en el puerto ${servidor.address().port}`);
  });
}

module.exports = { app, ahora, tarifaDelBloque, precioConDescuento, horasHastaElPartido };
