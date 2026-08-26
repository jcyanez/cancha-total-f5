// Cancha Total F5 - sistema de reservas
// Node + Express + libSQL (SQLite local o Turso), vistas renderizadas en el
// servidor. Con qué base habla lo decide bd.js según el entorno; acá no se
// sabe si los datos están en un archivo o al otro lado de la red.

const express = require('express');
const bd = require('./bd.js');

// Configuración. Los valores por omisión son los de siempre: el sistema sin
// variables de entorno arranca exactamente como arrancaba. Existen para poder
// levantarlo en otro puerto, contra otra base o con el reloj puesto en un
// instante fijo, sin tocar el código (hallazgos E-1, E-2, E-3, E-6).
const PUERTO = Number(process.env.CANCHA_PUERTO ?? 3000);
const INSTANTE_FIJO = process.env.CANCHA_AHORA ? new Date(process.env.CANCHA_AHORA) : null;

// El único lugar del sistema que lee el reloj.
function ahora() {
  return INSTANTE_FIJO ? new Date(INSTANTE_FIJO) : new Date();
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// El esquema tiene que estar antes de la primera consulta. En un servidor de
// siempre eso pasa al arrancar; en una función serverless, en el primer pedido
// que le toque el arranque en frío. bd.inicializar() se encarga una sola vez
// por proceso y es idempotente, así que el mismo código sirve para los dos.
app.use((req, res, siguiente) => {
  bd.inicializar().then(() => siguiente(), siguiente);
});

// Envuelve un manejador asíncrono para que un rechazo llegue al manejador de
// errores en vez de quedar como promesa sin atender. Express 4 no lo hace solo.
function asincrono(manejador) {
  return (req, res, siguiente) => Promise.resolve(manejador(req, res)).catch(siguiente);
}

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

async function checkDisponible(cancha, fecha, hora) {
  const fila = await bd.consultarUno(
    `SELECT COUNT(*) AS total FROM reservas
     WHERE cancha = ? AND fecha = ? AND hora = ? AND estado = 'activa'`,
    [cancha, fecha, hora]
  );
  return fila.total === 0;
}

// Las grillas necesitan saber el estado de 14 bloques (28 en la pantalla de
// inicio, que muestra las dos canchas). Preguntando bloque por bloque eso eran
// 28 consultas: con la base en un archivo daba igual, con la base al otro lado
// de la red son 28 viajes para pintar una tabla. Se traen todas juntas y se
// contesta en memoria. El HTML que sale es exactamente el mismo.
async function bloquesOcupadosDelDia(fecha) {
  const filas = await bd.consultar(
    `SELECT cancha, hora FROM reservas WHERE fecha = ? AND estado = 'activa'`,
    [fecha]
  );
  return new Set(filas.map((f) => `${f.cancha}-${f.hora}`));
}

async function getReservasDelDia(fecha) {
  return bd.consultar(
    `SELECT * FROM reservas WHERE fecha = ? ORDER BY cancha, hora`,
    [fecha]
  );
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

async function crearReserva(datos) {
  const info = await bd.ejecutar(
    `INSERT INTO reservas (cancha, fecha, hora, cliente, telefono, precio, estado, creada_en)
     VALUES (?, ?, ?, ?, ?, ?, 'activa', ?)`,
    [
      datos.cancha, datos.fecha, datos.hora, datos.cliente, datos.telefono, datos.precio,
      selloDeTiempo(ahora()),
    ]
  );
  return info.ultimoId;
}

function hoyISO() {
  const d = ahora();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Hoja de estilo del sistema. Vive acá porque acá vive el HTML: no hay build,
// ni bundler, ni archivos estáticos. Todo lo que se ve sale de este bloque.
//
// La organización es en dos pisos: primero los tokens —un nombre por decisión,
// declarados una sola vez— y después las reglas, que solo consumen tokens.
// Ningún color literal aparece fuera de :root.
const ESTILOS = `
/* --- Tokens ---------------------------------------------------------------
   El tema claro es el que manda; el oscuro solo redefine estos mismos nombres
   más abajo. Nada fuera de este bloque conoce un valor concreto. */
:root {
  color-scheme: light dark;

  /* Color de marca y superficies */
  --cancha: #0E5C3F;
  --tablero-fondo: #0B4530;
  --tablero-tinta: #FFFFFF;
  --papel: #F4F6F1;
  --superficie: #FFFFFF;
  --tinta: #14211B;
  --tinta-suave: #52605A;
  --linea: #D8E0D8;
  --borde-control: #7D8A82;

  /* La luz: por qué la tarifa sube a las 17:00 */
  --papel-luz: #FDF6E9;
  --luz: #B87A1A;
  --ambar: #F2B84B;

  /* Estados */
  --libre: #0E5C3F;
  --libre-fondo: #E2F0E8;
  --ocupado: #A32E22;
  --ocupado-fondo: #FBE9E6;
  --anulado: #4E5A55;
  --anulado-fondo: #EAEEEB;

  /* Botones. La acción principal es sólida; las demás son de contorno, para
     que cada pantalla tenga una sola llamada a la acción. */
  --boton-fondo: #0E5C3F;
  --boton-fondo-fuerte: #0B4530;
  --boton-tinta: #FFFFFF;

  /* Espacio: escala de 4 */
  --e-1: 4px;
  --e-2: 8px;
  --e-3: 12px;
  --e-4: 16px;
  --e-5: 24px;
  --e-6: 32px;
  --e-7: 48px;

  /* Tipografía. Sin CDN ni fuentes remotas: solo pilas del sistema.
     Las horas y los colones son datos de marcador y van en monoespaciada
     con cifras tabulares, para que las columnas alineen de verdad. */
  --fuente-ui: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --fuente-dato: ui-monospace, "Cascadia Mono", "Segoe UI Mono", "SF Mono", Menlo, Consolas, monospace;
  --texto-xs: 0.75rem;
  --texto-sm: 0.875rem;
  --texto-base: 1rem;
  --texto-lg: 1.125rem;
  --texto-xl: 1.375rem;

  /* Forma */
  --radio-1: 4px;
  --radio-2: 8px;
  --radio-3: 999px;
  --sombra-1: 0 1px 2px rgba(20, 33, 27, 0.06), 0 1px 3px rgba(20, 33, 27, 0.08);

  /* Área táctil mínima (Apple HIG 44pt) */
  --toque: 44px;

  --ancho: 68rem;

  /* Iconos. Una sola familia y un solo peso: geometría Phosphor «regular»
     —lienzo de 256, trazo de 16, remates y uniones redondas— dibujada acá
     porque no se pueden traer archivos ni CDN. Los nombres son los del
     catálogo: check-circle, x-circle, warning, lightbulb.
     Se pintan como máscara, así heredan el color del texto y una sola
     definición sirve para todos los estados. */
  --i-check-circle: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='128' cy='128' r='96'/%3E%3Cpath d='M172 104l-56 56-32-32'/%3E%3C/svg%3E");
  --i-x-circle: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='128' cy='128' r='96'/%3E%3Cpath d='M160 96l-64 64M160 160L96 96'/%3E%3C/svg%3E");
  --i-warning: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M128 40L224 200H32Z'/%3E%3Cpath d='M128 104v40'/%3E%3Ccircle cx='128' cy='180' r='10' fill='%23000' stroke='none'/%3E%3C/svg%3E");
  --i-lightbulb: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='128' cy='94' r='62'/%3E%3Cpath d='M100 150v40a28 28 0 0 0 56 0v-40'/%3E%3Cpath d='M104 196h48'/%3E%3C/svg%3E");
}

@media (prefers-color-scheme: dark) {
  :root {
    --cancha: #6FCFA2;
    --tablero-fondo: #0A1F17;
    --tablero-tinta: #EAF3EC;
    --papel: #0E1512;
    --superficie: #18211C;
    --tinta: #E7EEE9;
    --tinta-suave: #A9B6AE;
    --linea: #2B362F;
    --borde-control: #6D7A72;

    --papel-luz: #26200F;
    --luz: #E0A93F;
    --ambar: #F2B84B;

    --libre: #6FCFA2;
    --libre-fondo: #143325;
    --ocupado: #F29B8D;
    --ocupado-fondo: #3A201C;
    --anulado: #A0ADA5;
    --anulado-fondo: #232C27;

    --boton-fondo: #6FCFA2;
    --boton-fondo-fuerte: #8ADCB5;
    --boton-tinta: #06251A;

    --sombra-1: 0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3);
  }
}

/* --- Base ---------------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--papel);
  color: var(--tinta);
  font-family: var(--fuente-ui);
  font-size: var(--texto-base);
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}

main {
  max-width: var(--ancho);
  margin: 0 auto;
  padding: var(--e-6) clamp(var(--e-4), 4vw, var(--e-6)) var(--e-7);
}

/* Las dos canchas se comparan de un vistazo cuando hay ancho, y se apilan
   cuando no lo hay. El orden del documento no cambia, así que el recorrido
   por teclado sigue al ojo. */
.canchas {
  display: grid;
  gap: var(--e-5);
  margin-bottom: var(--e-6);
}

/* Un hijo de grid no encoge por debajo de su contenido salvo que se le diga.
   Sin esto, el ancho mínimo de la tabla empuja la columna y la página termina
   scrolleando de lado en las pantallas más angostas. */
.canchas > section { min-width: 0; }

@media (min-width: 60rem) {
  .canchas { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-4);
  margin: var(--e-5) 0 0;
  font-weight: 600;
}

/* Las fechas y los montos son datos, y se leen como datos en cualquier lugar
   donde aparezcan: también dentro de un título. */
.dato {
  font-family: var(--fuente-dato);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

h1, h2, h3 { line-height: 1.2; }

h2 {
  margin: var(--e-6) 0 var(--e-4);
  font-size: var(--texto-xl);
  font-weight: 700;
  letter-spacing: -0.01em;
}

main > h2:first-child { margin-top: 0; }

/* Los nombres de cancha son rótulos de tablero, no títulos de párrafo. */
h3 {
  margin: 0 0 var(--e-3);
  font-size: var(--texto-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--tinta-suave);
}

a { color: var(--cancha); }

p { margin: 0 0 var(--e-4); }

/* Texto que existe para el lector de pantalla y no para el ojo. */
.oculto {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* --- Cabecera ------------------------------------------------------------ */
.saltar {
  position: absolute;
  left: -9999px;
  top: 0;
  padding: var(--e-3) var(--e-4);
  background: var(--superficie);
  color: var(--cancha);
  font-weight: 600;
  z-index: 10;
}

.saltar:focus { left: var(--e-4); top: var(--e-2); }

.tablero {
  background: var(--tablero-fondo);
  color: var(--tablero-tinta);
  border-bottom: 3px solid var(--ambar);
}

.tablero-interior {
  max-width: var(--ancho);
  margin: 0 auto;
  padding: var(--e-4);
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--e-2) var(--e-5);
}

.marca {
  margin: 0;
  font-size: var(--texto-xl);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.tablero nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-1);
  margin-left: auto;
}

.tablero nav a {
  display: inline-flex;
  align-items: center;
  min-height: var(--toque);
  padding: 0 var(--e-3);
  border-radius: var(--radio-1);
  color: var(--tablero-tinta);
  font-size: var(--texto-sm);
  font-weight: 600;
  text-decoration: none;
}

.tablero nav a:hover { background: rgba(255, 255, 255, 0.12); text-decoration: underline; }

/* --- Foco ---------------------------------------------------------------- */
:focus-visible {
  outline: 3px solid var(--cancha);
  outline-offset: 2px;
  border-radius: var(--radio-1);
}

.tablero :focus-visible { outline-color: var(--ambar); }

/* --- Tablas -------------------------------------------------------------- */
/* El position: relative no es decorativo. Sin él, un hijo posicionado en
   absoluto —el rótulo que solo oye el lector de pantalla— se cuelga del
   documento en vez de este marco, se escapa del recorte y estira la página a
   lo ancho: 636 px de ancho con un teléfono de 375. Con él, lo que se sale
   scrollea acá adentro y el cuerpo nunca scrollea de lado. */
.tabla-marco {
  position: relative;
  overflow-x: auto;
  border: 1px solid var(--linea);
  border-radius: var(--radio-2);
  background: var(--superficie);
  box-shadow: var(--sombra-1);
}

table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
}

th, td {
  padding: var(--e-2) var(--e-3);
  text-align: left;
  border: 0;
}

th {
  font-size: var(--texto-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--tinta-suave);
  white-space: nowrap;
}

/* La línea que separa filas se dibuja sobre la fila y no sobre las celdas.
   Así las celdas quedan con el fondo libre para llevar una píldora sin que la
   píldora se coma el separador. */
tr {
  background-image: linear-gradient(var(--linea), var(--linea));
  background-position: bottom;
  background-size: 100% 1px;
  background-repeat: no-repeat;
}

tr:last-child { background-image: none; }

/* Las horas y los montos son datos de marcador: monoespaciados y con cifras
   tabulares, para que las columnas alineen columna contra columna. */
.grilla {
  table-layout: fixed;
  min-width: 19rem;
}

.grilla th:first-child { width: 6rem; }
.grilla th:nth-child(2) { width: 8.5rem; }

.grilla td:first-child {
  font-family: var(--fuente-dato);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.grilla td:last-child {
  font-family: var(--fuente-dato);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.grilla th:last-child { text-align: right; }

/* Cuando solo hay dos columnas —la pantalla por cancha— la última no es una
   tarifa sino el estado: se alinea a la izquierda y la tabla deja de estirarse
   a lo ancho, porque dos columnas no necesitan toda la página. */
.grilla--sin-tarifa {
  width: auto;
  table-layout: auto;
  min-width: 0;
}

.grilla--sin-tarifa td:last-child,
.grilla--sin-tarifa th:last-child {
  text-align: left;
  font-family: var(--fuente-ui);
  width: 8.5rem;
}

.tabla-marco--angosto { width: fit-content; max-width: 100%; }

/* --- Píldoras de estado --------------------------------------------------
   El markup no cambia: la píldora se dibuja sobre el <td> que ya existía.
   Va en un pseudo-elemento y no en el fondo de la celda porque el navegador
   recorta el fondo de la fila con el borde redondeado de cada celda: con la
   píldora puesta en el <td>, la regla de la luz y los separadores salían
   cortados justo encima de ella. El z-index del <td> encierra la píldora
   entre el fondo de la fila y el texto.
   El color nunca es la única señal: el texto ya estaba y el icono refuerza. */
.grilla td.libre,
.grilla td.ocupado,
.lista td.estado-activa,
.lista td.estado-cancelada {
  position: relative;
  z-index: 0;
  padding: var(--e-2) var(--e-4);
  font-weight: 600;
  font-size: var(--texto-sm);
  white-space: nowrap;
}

.grilla td.libre::after,
.grilla td.ocupado::after,
.lista td.estado-activa::after,
.lista td.estado-cancelada::after {
  content: "";
  position: absolute;
  z-index: -1;
  inset: var(--e-1);
  border-radius: var(--radio-3);
  background: var(--fondo-pildora);
}

.grilla td.libre,
.lista td.estado-activa {
  --fondo-pildora: var(--libre-fondo);
  color: var(--libre);
}

.grilla td.ocupado {
  --fondo-pildora: var(--ocupado-fondo);
  color: var(--ocupado);
}

.lista td.estado-cancelada {
  --fondo-pildora: var(--anulado-fondo);
  color: var(--anulado);
}

/* Siete columnas no entran en un teléfono: la tabla conserva su ancho mínimo
   y es el marco el que scrollea, nunca la página. */
.lista { min-width: 46rem; }

/* Una reserva anulada sigue estando: se apaga, no se esconde. */
.lista tr.cancelada { color: var(--anulado); }

.lista tr.cancelada td:nth-child(3) { text-decoration: line-through; }

/* La lista del día también es un marcador: hora, teléfono y monto en cifras
   tabulares para poder leer la columna de un vistazo. */
.lista td:first-child,
.lista td:nth-child(4),
.lista td:nth-child(5) {
  font-family: var(--fuente-dato);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.lista td:nth-child(5), .lista th:nth-child(5) { text-align: right; }

/* La píldora de estado se ajusta a su texto en vez de estirarse con la tabla;
   el sobrante se lo queda la columna del cliente, que es la que lo aprovecha. */
.lista th:nth-child(6) { width: 1%; }

.lista td:nth-child(3) { font-weight: 600; }

/* --- Iconos --------------------------------------------------------------
   Cada icono es un ::before enmascarado. Van con content:"" y no con un
   glifo, así que el lector de pantalla no los anuncia: son refuerzo de un
   texto que ya está escrito, nunca la única señal. */
.grilla td.libre::before,
.grilla td.ocupado::before,
.lista td.estado-activa::before,
.lista td.estado-cancelada::before,
.grilla tr.con-luz td:first-child::after {
  content: "";
  display: inline-block;
  flex: none;
  width: 1em;
  height: 1em;
  vertical-align: -0.15em;
  margin-right: 0.4em;
  background-color: currentColor;
  -webkit-mask: var(--icono) center / contain no-repeat;
  mask: var(--icono) center / contain no-repeat;
}

.grilla td.libre::before,
.lista td.estado-activa::before { --icono: var(--i-check-circle); }

.grilla td.ocupado::before,
.lista td.estado-cancelada::before { --icono: var(--i-x-circle); }

/* --- La línea de la luz --------------------------------------------------
   A las 17:00 se encienden las luces y por eso la tarifa sube. La grilla lo
   cuenta: los bloques con luz van sobre papel cálido, la frontera lleva una
   regla ámbar y cada hora encendida queda estampada con un foco. */
.grilla tr.con-luz { background-color: var(--papel-luz); }

/* La regla va sobre la fila, no sobre el borde de las celdas: un borde de
   celda seguiría el redondeo de la píldora y la línea saldría con joroba.
   Como fondo de la fila cruza las tres columnas recta y entera, y la píldora
   —que arranca cuatro píxeles más abajo— no la tapa. */
.grilla tr:not(.con-luz) + tr.con-luz {
  background-image:
    linear-gradient(var(--luz), var(--luz)),
    linear-gradient(var(--linea), var(--linea));
  background-position: top, bottom;
  background-size: 100% 2px, 100% 1px;
  background-repeat: no-repeat, no-repeat;
}

.grilla tr.con-luz td:first-child {
  color: var(--luz);
}

.grilla tr.con-luz td:first-child::after {
  --icono: var(--i-lightbulb);
  margin-left: 0.45em;
  margin-right: 0;
}

/* --- Formulario -----------------------------------------------------------
   Las etiquetas se ven siempre: nunca se reemplazan por un texto de ejemplo
   dentro del campo, que desaparece justo cuando hace falta. */
label {
  display: block;
  margin-bottom: var(--e-1);
  font-size: var(--texto-sm);
  font-weight: 600;
  color: var(--tinta-suave);
}

input, select, button, output { font: inherit; }

input[type="text"], input[type="date"], select {
  width: 100%;
  min-height: var(--toque);
  padding: 0 var(--e-3);
  color: var(--tinta);
  background: var(--superficie);
  border: 1px solid var(--borde-control);
  border-radius: var(--radio-1);
}

select { padding-right: var(--e-2); }

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--toque);
  min-width: var(--toque);
  padding: 0 var(--e-4);
  font-weight: 600;
  color: var(--cancha);
  background: var(--superficie);
  border: 1px solid var(--borde-control);
  border-radius: var(--radio-1);
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 120ms ease, border-color 120ms ease;
}

button:hover { background: var(--libre-fondo); border-color: var(--cancha); }

.boton-principal {
  color: var(--boton-tinta);
  background: var(--boton-fondo);
  border-color: var(--boton-fondo);
}

.boton-principal:hover {
  background: var(--boton-fondo-fuerte);
  border-color: var(--boton-fondo-fuerte);
}

.boton-anular { color: var(--ocupado); }

.boton-anular:hover { background: var(--ocupado-fondo); border-color: var(--ocupado); }

.en-linea { display: inline; }

/* La columna de acciones no se apretuja: el botón conserva su área táctil. */
.lista td:last-child { padding: var(--e-1) var(--e-3); }

/* Barra de fecha: el campo y su botón viven en la misma línea. */
.filtro-fecha {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--e-3);
  margin-bottom: var(--e-5);
}

.filtro-fecha .campo { flex: 0 1 14rem; }

.reserva {
  padding: var(--e-5);
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: var(--radio-2);
  box-shadow: var(--sombra-1);
}

.campos {
  display: grid;
  gap: var(--e-4);
  margin-bottom: var(--e-5);
}

@media (min-width: 40rem) {
  .campos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* El precio estimado es una lectura, no un campo: se muestra como cifra de
   marcador y se anuncia solo cuando cambia, porque es un <output>. */
.plato-precio {
  display: flex;
  align-items: center;
  min-height: var(--toque);
  padding: 0 var(--e-3);
  background: var(--papel);
  border: 1px dashed var(--borde-control);
  border-radius: var(--radio-1);
  font-family: var(--fuente-dato);
  font-variant-numeric: tabular-nums;
  font-size: var(--texto-lg);
  font-weight: 700;
}

/* --- Avisos ---------------------------------------------------------------
   Confirmación y error comparten la misma forma: barra de acento a la
   izquierda, icono, y el texto en tinta plena para que se lea.
   No se desvanecen solos. En estas pantallas el aviso *es* el contenido —
   esconderlo a los cuatro segundos dejaría la página vacía—, así que se
   quedan hasta que la persona navegue. */
.ok, .error {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--e-2) var(--e-3);
  align-items: start;
  margin: 0 0 var(--e-5);
  padding: var(--e-4);
  color: var(--tinta);
  background: var(--fondo-aviso);
  border: 1px solid var(--linea);
  border-left: var(--e-1) solid var(--acento-aviso);
  border-radius: var(--radio-2);
  box-shadow: var(--sombra-1);
}

.ok {
  --acento-aviso: var(--libre);
  --fondo-aviso: var(--libre-fondo);
  --icono: var(--i-check-circle);
}

.error {
  --acento-aviso: var(--ocupado);
  --fondo-aviso: var(--ocupado-fondo);
  --icono: var(--i-warning);
}

.ok::before, .error::before {
  content: "";
  grid-row: 1;
  grid-column: 1;
  width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.1rem;
  background-color: var(--acento-aviso);
  -webkit-mask: var(--icono) center / contain no-repeat;
  mask: var(--icono) center / contain no-repeat;
}

.ok > *, .error > * { grid-column: 2; margin: 0; }

.ok > * + *, .error > * + * { margin-top: var(--e-2); }

.ok > p:first-of-type,
.error > p:first-of-type {
  font-size: var(--texto-lg);
  font-weight: 700;
}

/* Resumen de errores: cada problema con su marca, sin viñeta de lista. */
.error ul {
  display: grid;
  gap: var(--e-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.error li {
  display: flex;
  align-items: flex-start;
  gap: var(--e-2);
}

.error li::before {
  content: "";
  flex: none;
  width: 1.15em;
  height: 1.15em;
  margin-top: 0.18em;
  background-color: var(--ocupado);
  -webkit-mask: var(--i-x-circle) center / contain no-repeat;
  mask: var(--i-x-circle) center / contain no-repeat;
}

/* --- Movimiento ----------------------------------------------------------
   Quien pide menos movimiento recibe menos movimiento. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;

function layout(titulo, contenido) {
  return `<!DOCTYPE html>
<html lang="es-CR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} - Cancha Total F5</title>
<style>${ESTILOS}</style>
</head>
<body>
<a class="saltar" href="#contenido">Ir al contenido</a>
<header class="tablero">
  <div class="tablero-interior">
    <h1 class="marca">Cancha Total F5</h1>
    <nav aria-label="Secciones">
      <a href="/">Inicio</a>
      <a href="/disponibilidad/cancha1">Cancha 1</a>
      <a href="/disponibilidad/cancha2">Cancha 2</a>
    </nav>
  </div>
</header>
<main id="contenido">
${contenido}
</main>
</body>
</html>`;
}

// GET / -------------------------------------------------------------------
// Disponibilidad del día para ambas canchas + formulario de reserva.
app.get('/', asincrono(async (req, res) => {
  const fecha = req.query.fecha || hoyISO();
  const ocupados = await bloquesOcupadosDelDia(fecha);

  let filasCancha1 = '';
  let filasCancha2 = '';
  for (let hora = 8; hora <= 21; hora++) {
    // Tarifa del bloque para pintar la disponibilidad.
    const precio = tarifaDelBloque(hora);

    // Marca de presentación para los bloques que se juegan con luz encendida:
    // deja que la grilla muestre de dónde sale el salto de tarifa. No decide
    // nada; el precio lo sigue decidiendo tarifaDelBloque().
    const conLuz = hora >= HORA_EN_QUE_ENCIENDE_LA_LUZ ? ' class="con-luz"' : '';

    const libre1 = !ocupados.has(`1-${hora}`);
    filasCancha1 += `<tr${conLuz}><td>${hora}:00</td><td class="${libre1 ? 'libre' : 'ocupado'}">${libre1 ? 'Libre' : 'Ocupado'}</td><td>${formatColones(precio)}</td></tr>`;

    const libre2 = !ocupados.has(`2-${hora}`);
    filasCancha2 += `<tr${conLuz}><td>${hora}:00</td><td class="${libre2 ? 'libre' : 'ocupado'}">${libre2 ? 'Libre' : 'Ocupado'}</td><td>${formatColones(precio)}</td></tr>`;
  }

  const contenido = `
<h2>Disponibilidad - <span class="dato">${escaparHTML(fecha)}</span></h2>
<form class="filtro-fecha" method="get" action="/">
  <div class="campo">
    <label for="fecha-inicio">Fecha</label>
    <input type="date" name="fecha" id="fecha-inicio" value="${escaparHTML(fecha)}">
  </div>
  <button type="submit">Ver</button>
</form>

<div class="canchas">
<section>
<h3>Cancha 1</h3>
<div class="tabla-marco"><table class="grilla"><tr><th>Hora</th><th>Estado</th><th>Tarifa</th></tr>${filasCancha1}</table></div>
</section>
<section>
<h3>Cancha 2</h3>
<div class="tabla-marco"><table class="grilla"><tr><th>Hora</th><th>Estado</th><th>Tarifa</th></tr>${filasCancha2}</table></div>
</section>
</div>

<h2>Nueva reserva</h2>
<form class="reserva" method="post" action="/reservas">
  <input type="hidden" name="fecha" value="${escaparHTML(fecha)}">
  <div class="campos">
    <div class="campo">
      <label for="cancha">Cancha:</label>
      <select name="cancha" id="cancha">
        <option value="1">Cancha 1</option>
        <option value="2">Cancha 2</option>
      </select>
    </div>
    <div class="campo">
      <label for="hora">Hora de inicio:</label>
      <select name="hora" id="hora">
        ${Array.from({ length: 14 }, (_, i) => 8 + i).map(h => `<option value="${h}">${h}:00</option>`).join('')}
      </select>
    </div>
    <div class="campo">
      <label for="cliente">Nombre del cliente:</label>
      <input type="text" name="cliente" id="cliente" autocomplete="name">
    </div>
    <div class="campo">
      <label for="telefono">Teléfono:</label>
      <input type="text" name="telefono" id="telefono" inputmode="numeric" autocomplete="tel">
    </div>
    <div class="campo">
      <label for="precioEstimado">Precio estimado:</label>
      <output class="plato-precio" id="precioEstimado" for="hora">-</output>
    </div>
  </div>
  <button class="boton-principal" type="submit">Reservar</button>
</form>

<p class="acciones"><a href="/dia/${escaparHTML(fecha)}">Ver lista de reservas del ${escaparHTML(fecha)}</a></p>

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
}));

// GET /disponibilidad/cancha1 y /disponibilidad/cancha2 -------------------
// Los dos son la misma pantalla con distinto número de cancha.
async function pantallaDeDisponibilidad(cancha, req, res) {
  const fecha = req.query.fecha || hoyISO();
  const ocupados = await bloquesOcupadosDelDia(fecha);
  let filas = '';
  for (let hora = 8; hora <= 21; hora++) {
    const libre = !ocupados.has(`${cancha}-${hora}`);
    const conLuz = hora >= HORA_EN_QUE_ENCIENDE_LA_LUZ ? ' class="con-luz"' : '';
    filas += `<tr${conLuz}><td>${hora}:00</td><td class="${libre ? 'libre' : 'ocupado'}">${libre ? 'Libre' : 'Ocupado'}</td></tr>`;
  }
  const contenido = `
<h2>Disponibilidad Cancha ${cancha} - <span class="dato">${escaparHTML(fecha)}</span></h2>
<form class="filtro-fecha" method="get" action="/disponibilidad/cancha${cancha}">
  <div class="campo">
    <label for="fecha-cancha">Fecha</label>
    <input type="date" name="fecha" id="fecha-cancha" value="${escaparHTML(fecha)}">
  </div>
  <button type="submit">Ver</button>
</form>
<div class="tabla-marco tabla-marco--angosto"><table class="grilla grilla--sin-tarifa"><tr><th>Hora</th><th>Estado</th></tr>${filas}</table></div>
`;
  res.send(layout(`Cancha ${cancha}`, contenido));
}

app.get('/disponibilidad/cancha1', asincrono((req, res) => pantallaDeDisponibilidad(1, req, res)));
app.get('/disponibilidad/cancha2', asincrono((req, res) => pantallaDeDisponibilidad(2, req, res)));

// POST /reservas ------------------------------------------------------------
app.post('/reservas', asincrono(async (req, res) => {
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
    const contenidoError = `<div class="error" role="alert"><p>No se pudo crear la reserva:</p><ul>${listaErrores}</ul></div><p class="acciones"><a href="/">Volver</a></p>`;
    return res.send(layout('Error', contenidoError));
  }

  // Paso 3: verificar que el bloque siga libre.
  const disponible = await checkDisponible(cancha, fecha, hora);
  if (!disponible) {
    const contenidoOcupado = `<div class="error" role="alert">Ese bloque ya está ocupado para la cancha ${cancha} el ${escaparHTML(fecha)} a las ${hora}:00.</div><p class="acciones"><a href="/">Volver</a></p>`;
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
  const conteoMes = await bd.consultarUno(
    `SELECT COUNT(*) AS total FROM reservas
     WHERE telefono = ? AND substr(creada_en, 1, 7) = ?
       AND estado = 'activa'`,
    [telefono, mesDeRegistro]
  );

  const aplicaDescuento = esClienteFrecuente(conteoMes.total);
  precio = precioConDescuento(precio, conteoMes.total);

  // Paso 6: guardar la reserva.
  const id = await crearReserva({ cancha, fecha, hora, cliente, telefono, precio });

  // Paso 7: armar la página de confirmación.
  const notaDescuento = aplicaDescuento ? ' (con 10% de descuento por cliente frecuente)' : '';
  const contenido = `
<div class="ok" role="status">
  <p>Reserva #${id} creada.</p>
  <p>Cancha ${cancha}, ${escaparHTML(fecha)} a las ${hora}:00, cliente ${escaparHTML(cliente)}.</p>
  <p>Precio: ${formatColones(precio)}${notaDescuento}</p>
</div>
<p class="acciones"><a href="/dia/${escaparHTML(fecha)}">Ver lista del día</a> | <a href="/">Volver</a></p>
`;
  res.send(layout('Reserva creada', contenido));
}));

// POST /reservas/:id/cancelar ------------------------------------------------
app.post('/reservas/:id/cancelar', asincrono(async (req, res) => {
  const id = Number(req.params.id);
  const reserva = await bd.consultarUno('SELECT * FROM reservas WHERE id = ?', [id]);

  if (!reserva) {
    return res.send(layout('Error', `<div class="error" role="alert">No existe la reserva #${id}.</div>`));
  }
  if (reserva.estado === 'cancelada') {
    return res.send(layout('Error', `<div class="error" role="alert">La reserva #${id} ya estaba cancelada.</div><p class="acciones"><a href="/dia/${reserva.fecha}">Volver</a></p>`));
  }

  // Regla de las 24 horas: faltan 24 o más hasta que empiece el partido.
  if (horasHastaElPartido(reserva, ahora()) >= HORAS_DE_PLAZO_PARA_CANCELAR) {
    await bd.ejecutar(`UPDATE reservas SET estado = 'cancelada' WHERE id = ?`, [id]);
    return res.send(layout('Cancelada', `<div class="ok" role="status">Reserva #${id} cancelada.</div><p class="acciones"><a href="/dia/${reserva.fecha}">Volver</a></p>`));
  } else {
    return res.send(layout('Error', `<div class="error" role="alert">La reserva #${id} no se puede cancelar: falta menos de 24 horas para el bloque.</div><p class="acciones"><a href="/dia/${reserva.fecha}">Volver</a></p>`));
  }
}));

// GET /dia/:fecha -------------------------------------------------------------
app.get('/dia/:fecha', asincrono(async (req, res) => {
  const fecha = req.params.fecha;
  const reservas = await getReservasDelDia(fecha);

  const filas = reservas.map(r => {
    const claseFila = r.estado === 'cancelada' ? 'cancelada' : '';
    const botonCancelar = r.estado === 'activa'
      ? `<form class="en-linea" method="post" action="/reservas/${r.id}/cancelar"><button class="boton-anular" type="submit" aria-label="Cancelar la reserva #${r.id} de las ${r.hora}:00">Cancelar</button></form>`
      : '-';
    return `<tr class="${claseFila}"><td>${r.hora}:00</td><td>Cancha ${r.cancha}</td><td>${escaparHTML(r.cliente)}</td><td>${escaparHTML(r.telefono || '')}</td><td>${formatColones(r.precio)}</td><td class="estado-${r.estado}">${r.estado}</td><td>${botonCancelar}</td></tr>`;
  }).join('');

  const contenido = `
<h2>Reservas del <span class="dato">${escaparHTML(fecha)}</span></h2>
<div class="tabla-marco" tabindex="0" role="region" aria-label="Reservas del ${escaparHTML(fecha)}">
<table class="lista">
  <tr><th>Hora</th><th>Cancha</th><th>Cliente</th><th>Teléfono</th><th>Precio</th><th>Estado</th><th><span class="oculto">Acciones</span></th></tr>
  ${filas || '<tr><td colspan="7">No hay reservas para esta fecha.</td></tr>'}
</table>
</div>
<p class="acciones"><a href="/?fecha=${escaparHTML(fecha)}">Volver a disponibilidad</a></p>
`;
  res.send(layout('Reservas del día', contenido));
}));

// GET /api/cotizar --------------------------------------------------------
// Precio previo de un bloque, usado por el formulario de la página de inicio.
app.get('/api/cotizar', (req, res) => {
  const hora = Number(req.query.hora);

  // Cotización rápida para el formulario.
  const precio = tarifaDelBloque(hora);

  res.json({ precio, precioFormateado: formatColones(precio) });
});

// GET /api/health ---------------------------------------------------------
// Comprobación de vida, para el pipeline y para verificar desde afuera que la
// aplicación desplegada llega de verdad a su base de datos.
//
// La consulta es real —una lectura contra la tabla de reservas— porque el
// sentido del endpoint es distinguir «la aplicación responde» de «la
// aplicación habla con su base». Lo primero sin lo segundo no sirve de nada.
//
// Lo que sale de acá no incluye la URL de la base, ni el token, ni el mensaje
// crudo del driver: solo qué clase de base es y si contestó.
app.get('/api/health', async (req, res) => {
  const clase = bd.descripcionDeLaBase();
  try {
    await bd.inicializar();
    await bd.comprobarConexion();
    const { total } = await bd.consultarUno('SELECT COUNT(*) AS total FROM reservas');
    res.json({
      status: 'ok',
      database: 'connected',
      driver: 'libsql',
      backend: clase,
      reservas: total,
    });
  } catch (error) {
    // 503: la aplicación está en pie pero no puede servir. Es lo que tiene que
    // ver el pipeline para dar el despliegue por malo.
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      driver: 'libsql',
      backend: clase,
      // El nombre del problema, no su contenido: un mensaje de driver puede
      // traer la URL de la base adentro.
      motivo: error.code || error.name || 'error de conexión',
    });
  }
});

// Manejador de errores. Cualquier fallo asíncrono que suba por asincrono()
// termina acá: el visitante ve una página, no una traza, y el detalle queda en
// el registro del servidor.
// eslint-disable-next-line no-unused-vars -- Express identifica al manejador de errores por sus cuatro parámetros
app.use((error, req, res, siguiente) => {
  console.error('[error]', error.message);
  res.status(500).send(
    layout('Error', '<div class="error" role="alert">El sistema no pudo atender el pedido. Intentá de nuevo.</div><p class="acciones"><a href="/">Volver</a></p>')
  );
});

// Solo arranca si se lo invoca directamente. Cargar este archivo desde una
// prueba ya no levanta un servidor ni ocupa un puerto, y en Vercel el que lo
// carga es api/index.js, que exporta la aplicación sin escuchar en un puerto.
if (require.main === module) {
  // Acá sí se espera el esquema antes de escuchar: si la base no está, el
  // arranque local falla de una y se ve el motivo, como fallaba antes.
  bd.inicializar()
    .then(() => {
      const servidor = app.listen(PUERTO, () => {
        console.log(`Cancha Total F5 escuchando en el puerto ${servidor.address().port}`);
      });
    })
    .catch((error) => {
      console.error(`No se pudo arrancar: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { app, ahora, tarifaDelBloque, precioConDescuento, horasHastaElPartido };
