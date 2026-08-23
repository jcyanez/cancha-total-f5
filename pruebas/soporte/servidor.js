// Herramientas que usan las pruebas para hablar con el sistema.
// Levanta el server.js real por su puerta de entrada, sobre una base de datos
// propia, en un puerto libre y con el reloj puesto en un instante fijo. Los tres
// son configuración del sistema: ya no hace falta parchearlo desde afuera.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const BaseDeDatos = require('better-sqlite3');

const RAIZ = path.join(__dirname, '..', '..');
const SERVIDOR = path.join(RAIZ, 'server.js');

// Instante en que ocurren todas las pruebas. Fijo, para que la regla de las 24
// horas (RN-27, RN-28) dé siempre el mismo resultado.
const AHORA = '2026-08-18T10:00:00';
const HOY = '2026-08-18';

let contador = 0;

function rutaDeBaseNueva() {
  contador += 1;
  return path.join(os.tmpdir(), `cancha-total-pruebas-${process.pid}-${contador}.db`);
}

function borrarBase(ruta) {
  for (const sufijo of ['', '-wal', '-shm', '-journal']) {
    try {
      fs.rmSync(ruta + sufijo, { force: true });
    } catch {
      // En Windows el archivo puede seguir tomado un instante; no es un fallo
      // de la prueba y la base vive en el directorio temporal.
    }
  }
}

// Levanta el sistema y devuelve las acciones que una prueba puede realizar.
// `ahora` permite correr un tramo de la prueba en otro instante.
async function levantarSistema({ ahora = AHORA, base = rutaDeBaseNueva() } = {}) {
  const proceso = spawn(process.execPath, [SERVIDOR], {
    cwd: RAIZ,
    env: { ...process.env, CANCHA_AHORA: ahora, CANCHA_BD: base, CANCHA_PUERTO: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const puerto = await new Promise((resolver, rechazar) => {
    let salida = '';
    let error = '';
    const limite = setTimeout(() => {
      rechazar(new Error(`El sistema no arrancó en 15 s.\nSalida:\n${salida}\n${error}`));
    }, 15000);

    proceso.stdout.on('data', (trozo) => {
      salida += trozo;
      const encontrado = salida.match(/escuchando en el puerto (\d+)/);
      if (encontrado) {
        clearTimeout(limite);
        resolver(Number(encontrado[1]));
      }
    });
    proceso.stderr.on('data', (trozo) => {
      error += trozo;
    });
    proceso.once('exit', (codigo) => {
      clearTimeout(limite);
      rechazar(new Error(`El sistema terminó con código ${codigo}.\n${salida}\n${error}`));
    });
  });

  const direccion = `http://127.0.0.1:${puerto}`;

  async function apagar() {
    const terminado = new Promise((resolver) => proceso.once('exit', resolver));
    proceso.kill();
    await terminado;
  }

  return {
    base,
    direccion,

    // --- Acciones del negocio --------------------------------------------

    async reservar({ cancha, fecha, hora, cliente, telefono }) {
      const campos = new URLSearchParams();
      if (cancha !== undefined) campos.set('cancha', String(cancha));
      if (fecha !== undefined) campos.set('fecha', String(fecha));
      if (hora !== undefined) campos.set('hora', String(hora));
      if (cliente !== undefined) campos.set('cliente', String(cliente));
      if (telefono !== undefined) campos.set('telefono', String(telefono));

      const respuesta = await fetch(`${direccion}/reservas`, { method: 'POST', body: campos });
      return { estado: respuesta.status, html: await respuesta.text() };
    },

    async cancelar(numero) {
      const respuesta = await fetch(`${direccion}/reservas/${numero}/cancelar`, { method: 'POST' });
      return { estado: respuesta.status, html: await respuesta.text() };
    },

    async cotizar(hora) {
      const respuesta = await fetch(`${direccion}/api/cotizar?hora=${hora}`);
      return respuesta.json();
    },

    // --- Pantallas --------------------------------------------------------

    async inicio(fecha) {
      const consulta = fecha ? `?fecha=${fecha}` : '';
      const respuesta = await fetch(`${direccion}/${consulta}`);
      return respuesta.text();
    },

    async disponibilidad(cancha, fecha) {
      const consulta = fecha ? `?fecha=${fecha}` : '';
      const respuesta = await fetch(`${direccion}/disponibilidad/cancha${cancha}${consulta}`);
      return respuesta.text();
    },

    async listaDelDia(fecha) {
      const respuesta = await fetch(`${direccion}/dia/${fecha}`);
      return respuesta.text();
    },

    // --- Lo que quedó guardado -------------------------------------------

    reservas() {
      const bd = new BaseDeDatos(base, { readonly: true });
      const filas = bd.prepare('SELECT * FROM reservas ORDER BY id').all();
      bd.close();
      return filas;
    },

    ultimaReserva() {
      const filas = this.reservas();
      return filas[filas.length - 1];
    },

    cuantasReservas() {
      return this.reservas().length;
    },

    // Registra una reserva con una fecha de registro elegida. Es el único dato
    // que no se puede fijar por el camino del negocio (hallazgo de estructura
    // E-4), y hace falta para probar RN-23.
    sembrarConFechaDeRegistro({ cancha, fecha, hora, cliente, telefono, precio, estado = 'activa', mesesAtras }) {
      const bd = new BaseDeDatos(base);
      bd.prepare(
        `INSERT INTO reservas (cancha, fecha, hora, cliente, telefono, precio, estado, creada_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`
      ).run(cancha, fecha, hora, cliente, telefono, precio, estado, `-${mesesAtras} months`);
      bd.close();
    },

    apagar,
  };
}

// Levanta el sistema, corre la prueba y desecha la base. Cada prueba recibe un
// sistema recién nacido: ninguna depende de haber corrido otra antes.
async function conSistema(cuerpo, opciones = {}) {
  const sistema = await levantarSistema(opciones);
  try {
    await cuerpo(sistema);
  } finally {
    await sistema.apagar();
    borrarBase(sistema.base);
  }
}

// Cuenta cuántos problemas se le informaron a quien intentó reservar.
function problemasInformados(html) {
  const lista = html.match(/<li>[^<]*<\/li>/g);
  return lista ? lista.length : 0;
}

// Estado de un bloque en una pantalla de disponibilidad: 'Libre' u 'Ocupado'.
function estadoDelBloque(html, hora) {
  const fila = html.match(new RegExp(`<td>${hora}:00</td><td[^>]*>(Libre|Ocupado)</td>`));
  return fila ? fila[1] : null;
}

// Tarifa que la pantalla de inicio muestra para un bloque, como número.
function tarifaMostrada(html, hora) {
  const fila = html.match(new RegExp(`<td>${hora}:00</td><td[^>]*>(?:Libre|Ocupado)</td><td>₡([\\d.]+)</td>`));
  return fila ? Number(fila[1].replace(/\./g, '')) : null;
}

// Nombres de cliente en el orden en que aparecen en la lista de un día.
function clientesEnOrden(html) {
  const cuerpo = html.split('<h2>Reservas del')[1] || '';
  const celdas = cuerpo.match(/<td>Cancha \d<\/td><td>([^<]*)<\/td>/g) || [];
  return celdas.map((celda) => celda.match(/<td>Cancha \d<\/td><td>([^<]*)<\/td>/)[1]);
}

module.exports = {
  AHORA,
  HOY,
  levantarSistema,
  conSistema,
  borrarBase,
  problemasInformados,
  estadoDelBloque,
  tarifaMostrada,
  clientesEnOrden,
};
