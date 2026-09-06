// Cancha Total F5 - sistema de reservas
// Node + Express + libSQL (SQLite local o Turso), vistas renderizadas en el
// servidor. Con qué base habla lo decide bd.js según el entorno; acá no se
// sabe si los datos están en un archivo o al otro lado de la red.

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const bd = require('./bd.js');

// Configuración. Los valores por omisión son los de siempre: el sistema sin
// variables de entorno arranca exactamente como arrancaba. Existen para poder
// levantarlo en otro puerto, contra otra base o con el reloj puesto en un
// instante fijo, sin tocar el código (hallazgos E-1, E-2, E-3, E-6).
const PUERTO = Number(process.env.CANCHA_PUERTO ?? 3000);
const INSTANTE_FIJO = process.env.CANCHA_AHORA ? new Date(process.env.CANCHA_AHORA) : null;
// La pantalla de una reserva no muestra el nombre ni el teléfono de quien la
// hizo. El sistema no tiene control de acceso (FUERA-2): cualquiera con la
// dirección entra, y esa pantalla quedó a un clic de la portada, que es
// pública. Los datos personales siguen donde siempre estuvieron, en la lista
// del día, que hay que ir a buscar; no se acercan a la puerta de calle. Si
// mañana la administradora decide otra cosa, se decide acá, en esta línea.
const DETALLE_MUESTRA_DATOS_DEL_CLIENTE = false;


// El único lugar del sistema que lee el reloj.
function ahora() {
  return INSTANTE_FIJO ? new Date(INSTANTE_FIJO) : new Date();
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Los archivos de public/ se sirven tal cual: hoy es el logo de la marca.
//
// Va montado en la aplicación y no delegado al servidor de estáticos de Vercel
// a propósito. `vercel.json` reescribe TODAS las rutas a esta función, así que
// el camino garantizado —el que se comporta igual en la portátil y en el
// despliegue— es que la función también sepa servirlos. Si además Vercel los
// resuelve antes por su propio sistema de archivos, mejor: se ahorra una
// invocación y el resultado es el mismo archivo.
//
// El logo no cambia de contenido sin cambiar de nombre, así que se puede
// cachear con ganas: se baja una vez y no vuelve a pedirse.
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '365d',
  immutable: true,
}));

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
//
// Devuelve un Map de `cancha-hora` al id de la reserva que ocupa el bloque, y
// no un simple Set, porque la grilla ya no se limita a decir «ocupado»: ofrece
// ir a administrar esa reserva, y para eso necesita su id. El id viaja junto
// con la ocupación porque sale de la misma fila; preguntarlo después sería
// volver a la base por algo que ya se trajo.
async function bloquesOcupadosDelDia(fecha) {
  const filas = await bd.consultar(
    `SELECT id, cancha, hora FROM reservas WHERE fecha = ? AND estado = 'activa'`,
    [fecha]
  );
  return new Map(filas.map((f) => [`${f.cancha}-${f.hora}`, f.id]));
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

// La foto de fondo de la cancha. El interruptor está en el sistema de
// archivos, no en el código.
//
// Hoy no hay foto, y es una decisión y no un olvido: la única disponible pesa
// 5 MB y es vertical, y en esta máquina no hay con qué optimizarla ni se
// pueden agregar dependencias para hacerlo. Subirla así sería meter 5 MB en el
// paquete de la función, en cada descarga de teléfono y en el historial de git
// para siempre, a cambio de un adorno. Por eso el fondo se dibuja con
// degradados —ver la sección «El fondo de cancha» de ESTILOS— y esta
// comprobación queda puesta, cableada, para el día que aparezca una foto ya
// optimizada.
//
// Ese día no hay que tocar una línea de código: se deja el archivo en
// public/images/cancha-futbol-fondo.jpg y se reinicia el proceso. La carpeta
// public/ ya se sirve entera con el express.static de más arriba, así que la
// foto viaja por el mismo camino que el logo y con la misma caché; no hace
// falta —ni hay que— montar otra ruta para ella.
//
// El disco se mira una sola vez, al cargar el módulo, y no en cada pedido: no
// cambia durante la vida de un proceso, y en una función serverless el paquete
// es de solo lectura. Un existsSync por visita sería una llamada al sistema por
// página a cambio de nada.
const RUTA_FOTO_DE_FONDO = '/images/cancha-futbol-fondo.jpg';
const HAY_FOTO_DE_FONDO = fs.existsSync(
  path.join(__dirname, 'public', 'images', 'cancha-futbol-fondo.jpg'),
);

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
  /* El realce del menú es un velo de luz sobre el tablero, no un color: por eso
     lleva transparencia y no un verde más claro. Estaba escrito a mano en su
     regla, que era el único literal suelto que quedaba fuera de acá. */
  --tablero-realce: rgba(255, 255, 255, 0.12);
  --papel: #F4F6F1;
  --superficie: #FFFFFF;
  --tinta: #14211B;
  --tinta-suave: #52605A;
  --linea: #D8E0D8;
  --borde-control: #7D8A82;

  /* El fondo de cancha. Son tonos de --papel y no verdes de verdad, y eso es
     lo que lo salva: el fondo tiene que sostener texto encima, así que la
     diferencia entre una franja y la otra es de luz, no de color. La franja
     base es el mismo papel de siempre; la otra baja un peldaño, lo justo para
     que se lea el corte del césped y nada más.
     Medido: --tinta sobre la franja oscura da 14,3:1 y --tinta-suave 5,7:1. */
  --cesped-base: #F4F6F1;
  --cesped-franja: #EAF0E5;

  /* La cal de las marcas —la línea de medio campo y el círculo central—. Va
     con alfa y no con un verde fijo porque tiene que valer sobre las dos
     franjas sin saber cuál le tocó. Al 9% el trazo se ve y el peor contraste
     que deja debajo sigue siendo 4,97:1: pasa, con margen y sin milagro. */
  --cal: rgba(14, 92, 63, 0.09);

  /* La capa de la foto y su velo. Apagadas mientras no exista el archivo; el
     bloque «La foto de fondo» de más abajo las enciende si aparece. Se
     declaran acá igual, apagadas, para que la regla del <body> sea una sola y
     no dependa de si el archivo está o no. */
  --foto-cancha: none;
  --velo-cancha: transparent;

  /* La luz: por qué la tarifa sube a las 17:00.
     Son tres decisiones distintas y no una sola: el papel cálido de la banda
     de la tarde, el ámbar que dibuja la frontera —trazo, no palabra— y la
     tinta con que se escribe sobre ese papel, que tiene que llegar a 4,5:1
     porque es texto. El ámbar no llega: es decorado. */
  --papel-luz: #FDF6E9;
  --luz: #B87A1A;
  --luz-tinta: #8A5A0F;
  --ambar: #F2B84B;

  /* Estados */
  --libre: #0E5C3F;
  --libre-fondo: #E2F0E8;
  --ocupado: #A32E22;
  --ocupado-fondo: #FBE9E6;
  --anulado: #4E5A55;
  --anulado-fondo: #EAEEEB;

  /* Realce. Dos intensidades del mismo gesto: «acá está el puntero» y «este
     es el bloque con el que se está trabajando». Se usan también para el
     reposo y el apretón de un enlace de acción, porque señalar la fila y
     señalar su botón son la misma idea vista de cerca. */
  --realce-suave: #ECF3EE;
  --realce-fuerte: #D6E8DD;

  /* Aviso informativo. Ni confirmación ni error: la pantalla de una reserva
     dice cosas que no son ninguna de las dos —«todavía se puede cancelar»— y
     pintarlas de verde sería felicitar a quien solo está leyendo. */
  --info: #14608C;
  --info-fondo: #E4EFF6;

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
  /* Lo que flota por encima del documento —el globo de ayuda y el aviso
     flotante— necesita una sombra más larga que la de una tarjeta apoyada en
     la página: es la única señal de que está *sobre* el contenido y no
     adentro de él. Una sola sombra para las dos piezas, porque están a la
     misma altura. */
  --sombra-2: 0 4px 6px rgba(20, 33, 27, 0.10), 0 10px 24px rgba(20, 33, 27, 0.18);

  /* Área táctil mínima (Apple HIG 44pt) */
  --toque: 44px;

  --ancho: 68rem;

  /* Iconos. Una sola familia y un solo peso: geometría Phosphor «regular»
     —lienzo de 256, trazo de 16, remates y uniones redondas— dibujada acá
     porque no se pueden traer archivos ni CDN. Los nombres son los del
     catálogo: check-circle, x-circle, warning, lightbulb, plus-circle,
     pencil-simple, info.
     Se pintan como máscara, así heredan el color del texto y una sola
     definición sirve para todos los estados. */
  --i-check-circle: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='128' cy='128' r='96'/%3E%3Cpath d='M172 104l-56 56-32-32'/%3E%3C/svg%3E");
  --i-x-circle: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='128' cy='128' r='96'/%3E%3Cpath d='M160 96l-64 64M160 160L96 96'/%3E%3C/svg%3E");
  --i-warning: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M128 40L224 200H32Z'/%3E%3Cpath d='M128 104v40'/%3E%3Ccircle cx='128' cy='180' r='10' fill='%23000' stroke='none'/%3E%3C/svg%3E");
  --i-lightbulb: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='128' cy='94' r='62'/%3E%3Cpath d='M100 150v40a28 28 0 0 0 56 0v-40'/%3E%3Cpath d='M104 196h48'/%3E%3C/svg%3E");
  --i-plus-circle: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='128' cy='128' r='96'/%3E%3Cpath d='M88 128h80M128 88v80'/%3E%3C/svg%3E");
  --i-pencil: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M92 216H40v-52L164 40l52 52Z'/%3E%3Cpath d='M136 68l52 52'/%3E%3C/svg%3E");
  --i-info: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='%23000' stroke-width='16' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='128' cy='128' r='96'/%3E%3Cpath d='M118 124h12v56'/%3E%3Cpath d='M110 180h40'/%3E%3Ccircle cx='127' cy='86' r='10' fill='%23000' stroke='none'/%3E%3C/svg%3E");
}

@media (prefers-color-scheme: dark) {
  :root {
    --cancha: #6FCFA2;
    --tablero-fondo: #0A1F17;
    --tablero-tinta: #EAF3EC;
    /* El tablero es oscuro con los dos temas, así que el velo sigue siendo de
       luz; se repite igual que --ambar, para que ningún nombre quede definido
       en un solo bloque y haya que ir a buscarlo al otro. */
    --tablero-realce: rgba(255, 255, 255, 0.12);
    --papel: #0E1512;
    --superficie: #18211C;
    --tinta: #E7EEE9;
    --tinta-suave: #A9B6AE;
    --linea: #2B362F;
    --borde-control: #6D7A72;

    /* De noche el césped no se ilumina: se oscurece. Es el mismo gesto al
       revés —la franja se separa del papel hacia arriba en vez de hacia
       abajo— y la cal cambia de tinta, porque un verde oscuro sobre papel
       oscuro no dibuja nada.
       Medido: --tinta sobre la franja da 14,8:1 y --tinta-suave 8,3:1. */
    --cesped-base: #0E1512;
    --cesped-franja: #131C17;
    --cal: rgba(111, 207, 162, 0.09);
    --foto-cancha: none;
    --velo-cancha: transparent;

    --papel-luz: #26200F;
    --luz: #E0A93F;
    /* Sobre papel oscuro el ámbar ya se lee: la tinta y el trazo coinciden. */
    --luz-tinta: #E0A93F;
    --ambar: #F2B84B;

    --libre: #6FCFA2;
    --libre-fondo: #143325;
    --ocupado: #F29B8D;
    --ocupado-fondo: #3A201C;
    --anulado: #A0ADA5;
    --anulado-fondo: #232C27;

    /* De noche el realce no puede ser «más claro» sin más: sobre papel oscuro
       la fila señalada se levanta un paso, lo justo para separarse del fondo
       sin encender la pantalla. */
    --realce-suave: #1D2823;
    --realce-fuerte: #26332C;

    --info: #7FC4EC;
    --info-fondo: #122A38;

    --boton-fondo: #6FCFA2;
    --boton-fondo-fuerte: #8ADCB5;
    --boton-tinta: #06251A;

    --sombra-1: 0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3);
    /* De noche la sombra no separa por oscuridad —el fondo ya es oscuro— sino
       por densidad: se cierra más y se pone más negra, para que la pieza
       flotante siga leyéndose como flotante. */
    --sombra-2: 0 4px 6px rgba(0, 0, 0, 0.5), 0 10px 24px rgba(0, 0, 0, 0.55);
  }
}
${HAY_FOTO_DE_FONDO ? `
/* --- La foto de fondo -----------------------------------------------------
   Este bloque solo se imprime si el archivo existe en el disco. Cuando existe,
   enciende los dos tokens que el <body> ya está consumiendo: la foto pasa a
   ser la capa de arriba del fondo y el velo se vuelve opaco.
   El velo no es decoración: es lo que hace que el contraste no dependa de la
   foto. Al 90% —92% de noche— el peor píxel imaginable, negro puro o blanco
   puro, deja el fondo efectivo en un valor que sigue dando 4,84:1 contra
   --tinta-suave y 12:1 contra --tinta. Con una foto real el número solo puede
   mejorar, porque ninguna foto es negro puro de punta a punta. */
:root {
  --foto-cancha: url("${RUTA_FOTO_DE_FONDO}");
  --velo-cancha: rgba(244, 246, 241, 0.90);
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Mismo velo, del color del papel de noche y un punto más cerrado: sobre
       fondo oscuro es el blanco de la foto el que amenaza el contraste, no el
       negro. */
    --velo-cancha: rgba(14, 21, 18, 0.92);
  }
}
` : ''}

/* --- Base ---------------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; }

/* El fondo de cancha ------------------------------------------------------
   Cinco capas apiladas. En CSS la primera de la lista es la que queda encima,
   así que se leen de arriba hacia abajo como se ven:

     1. el velo, que garantiza el contraste (transparente si no hay foto),
     2. la foto (apagada hoy: el token vale «none»),
     3. el círculo central,
     4. la línea de medio campo,
     5. las franjas del corte del césped.

   Las marcas son dos trazos de cal y no un dibujo: la cancha se sugiere, no se
   ilustra. Un círculo de radio en vmin y una línea de 2 px es todo, y con el
   contenido encima apenas se adivinan por los bordes de la página, que es
   exactamente lo que se quiere de un fondo.

   «circle» en el radial no es adorno de sintaxis: obliga a los dos radios a
   ser iguales, así que el círculo es un círculo en cualquier proporción de
   pantalla y no un huevo. Las franjas son verticales y el degradado que las
   repite no tiene fin, así que ningún ancho las deforma.

   «fixed» clava el fondo al viewport. Además de dejar la cancha quieta
   mientras el contenido pasa por delante, evita que el degradado se estire a
   lo alto de todo el documento: sin eso, en una página larga el círculo se
   iría al medio del scroll y la línea de medio campo quedaría fuera de la
   vista. Con «fixed» el área de pintado es siempre la ventana, y «cover»
   sobre un degradado —que no tiene tamaño propio— la llena exacta. Un fondo
   nunca genera barra de desplazamiento: recorta, no empuja, así que la página
   sigue sin scrollear de lado. Las tablas anchas siguen scrolleando dentro de
   su .tabla-marco, como siempre.

   Sin animación, a propósito. Un fondo que se mueve no aporta nada, distrae de
   lo único que importa acá —quién juega y a qué hora— y le daría trabajo al
   bloque de prefers-reduced-motion del final. */
body {
  margin: 0;
  background-color: var(--cesped-base);
  background-image:
    linear-gradient(var(--velo-cancha), var(--velo-cancha)),
    var(--foto-cancha),
    radial-gradient(circle at 50% 50%,
      transparent 17.4vmin, var(--cal) 17.5vmin,
      var(--cal) 18vmin, transparent 18.1vmin),
    linear-gradient(to bottom,
      transparent calc(50% - 1px), var(--cal) calc(50% - 1px),
      var(--cal) calc(50% + 1px), transparent calc(50% + 1px)),
    repeating-linear-gradient(to right,
      var(--cesped-franja) 0, var(--cesped-franja) 7rem,
      var(--cesped-base) 7rem, var(--cesped-base) 14rem);
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  background-attachment: fixed;
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
  /* Centrado y no baseline: la línea base de una imagen es su borde inferior,
     así que con el logo puesto el menú quedaba colgado del pie del logo en vez
     de a su altura. */
  align-items: center;
  gap: var(--e-2) var(--e-5);
}

/* La marca es el logo. El <h1> se queda: le da al encabezado su nivel
   semántico, y el alt de la imagen le presta el nombre accesible, así que un
   lector de pantalla sigue anunciando "Cancha Total F5, título de nivel 1".
   El display:flex saca el hueco que el navegador reserva bajo una imagen en
   línea para los descendientes de la tipografía. */
.marca {
  margin: 0;
  display: flex;
}

/* Alto fijo y ancho automático: la proporción 3:1 del archivo original manda,
   y la imagen no se deforma ni se recorta. Los atributos width/height del
   <img> llevan las medidas intrínsecas, así que el navegador reserva el hueco
   correcto antes de bajarla y la página no salta. */
.marca img {
  display: block;
  height: 2.375rem;
  width: auto;
}

@media (min-width: 40rem) {
  .marca img { height: 3rem; }
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

.tablero nav a:hover { background: var(--tablero-realce); text-decoration: underline; }

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
  /* Cuatro columnas, y la última lleva un enlace con área táctil de 44 px: por
     debajo de este ancho la tarifa y la acción se aplastan una contra otra.
     Cuando el teléfono no lo da, el que scrollea es el marco —que para eso
     tiene overflow propio—, nunca el cuerpo de la página. */
  min-width: 24rem;
}

.grilla th:first-child { width: 6rem; }
.grilla th:nth-child(2) { width: 8.5rem; }

.grilla td:first-child {
  font-family: var(--fuente-dato);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

/* La tarifa se nombra por su posición dentro de la grilla que la tiene, y no
   como «la última columna»: desde que existe la columna de acción, la última
   ya no es la plata. La celda de tarifa no admite una clase —su forma está
   fijada por la suite—, así que la que se nombra es la tabla. */
.grilla:not(.grilla--sin-tarifa) td:nth-child(3) {
  font-family: var(--fuente-dato);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.grilla:not(.grilla--sin-tarifa) th:nth-child(3) { text-align: right; }

/* Cuando no hay tarifa —la pantalla por cancha— quedan tres columnas: hora,
   estado y acción. La tabla deja de estirarse a lo ancho, porque tres columnas
   no necesitan toda la página. */
.grilla--sin-tarifa {
  width: auto;
  table-layout: auto;
  min-width: 0;
}

.grilla--sin-tarifa td:nth-child(2),
.grilla--sin-tarifa th:nth-child(2) {
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
  padding: var(--e-2) var(--e-3);
  font-weight: 700;
  font-size: var(--texto-sm);
  white-space: nowrap;
  /* Versalitas y un poco de aire entre letras: catorce filas casi iguales se
     leen de arriba abajo por la forma de la palabra antes que por la palabra.
     El texto es el que manda el HTML —«Libre», «Ocupado»—, que la suite fija y
     acá no se toca; lo único que cambia es cómo se dibuja. */
  text-transform: uppercase;
  letter-spacing: 0.06em;
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

/* El bloque ocupado late. Es la única fila de la grilla sobre la que no se
   puede hacer nada, y en catorce filas casi iguales conviene que se note sin
   tener que leerlas una por una.

   El latido va en el fondo de la píldora -su ::after-, nunca en el texto:
   bajarle la opacidad a la palabra "Ocupado" le bajaría el contraste, y la
   señal terminaría costando legibilidad en vez de darla. Y sigue sin ser la
   única señal: el texto y el icono ya estaban, el movimiento solo los
   acompaña.

   El ciclo es de 1,8 s, bastante más lento que los tres destellos por segundo
   que el criterio 2.3.1 de WCAG pone como techo, y el fondo no llega a
   apagarse: oscila entre opaco y medio, así que la píldora nunca desaparece.
   Quien pide menos movimiento no ve nada de esto —el bloque de
   prefers-reduced-motion, más abajo, apaga toda animación del documento. */
@keyframes latido-ocupado {
  50% { opacity: 0.45; }
}

.grilla td.ocupado::after {
  animation: latido-ocupado 1.8s ease-in-out infinite;
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
.grilla tr.con-luz td:first-child::before {
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

/* La hora encendida se escribe con la tinta de la luz, que no es el ámbar del
   decorado: un trazo de 2 px puede ser vistoso, una palabra tiene que leerse.
   Por eso la línea usa --luz y el texto usa --luz-tinta. */
.grilla tr.con-luz td:first-child {
  color: var(--luz-tinta);
}

.grilla tr.con-luz td:first-child::before {
  --icono: var(--i-lightbulb);
}

/* El distintivo CON LUZ. El foco solo, sin palabra, obliga a saber de antemano
   qué significa; con la palabra puesta, la grilla explica sola por qué la
   tarifa de la tarde es otra. Va debajo de la hora y no al lado para no
   ensanchar la columna, y sale del CSS porque la fila de la grilla tiene sus
   celdas fijadas por la suite: el HTML no se toca. */
.grilla tr.con-luz td:first-child::after {
  content: "CON LUZ";
  display: block;
  width: fit-content;
  margin-top: var(--e-1);
  padding: 0 var(--e-1);
  border: 1px solid currentColor;
  border-radius: var(--radio-3);
  font-family: var(--fuente-ui);
  font-size: var(--texto-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.35;
}

/* --- La columna de acción -------------------------------------------------
   Cada bloque de la grilla lleva a alguna parte: el libre al formulario con la
   fecha y la hora puestas, el ocupado a la reserva que lo ocupa. Son dos
   destinos distintos y tienen que verse distintos *antes* del clic.

   La diferencia no se cuenta con el color, que para una parte de las personas
   no llega: cambia la forma —redonda contra rectangular—, cambia el icono
   —sumar contra editar—, cambia el peso de la letra y cambia el borde. Quien
   no distingue verde de gris sigue viendo dos cosas que no son la misma. */
.celda-accion {
  /* La celda se aprieta para que la que mande el alto sea el área táctil del
     enlace y no la suma de los rellenos. */
  padding: var(--e-1) var(--e-3);
  text-align: left;
  white-space: nowrap;
  /* El globo de ayuda del enlace se cuelga de la celda y no del enlace: el
     enlace mide 44 px y el globo necesita crecer hacia la izquierda por encima
     de las columnas vecinas. Ver el bloque «El globo de ayuda». */
  position: relative;
}

.accion {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35em;
  /* 44 px de verdad, en el teléfono y en el escritorio: no es el texto el que
     decide cuánto mide el blanco al que hay que apuntar. */
  min-height: var(--toque);
  min-width: var(--toque);
  padding: var(--e-2) var(--e-3);
  font-size: var(--texto-sm);
  line-height: 1.2;
  text-decoration: none;
  border: 1px solid transparent;
  background: transparent;
  touch-action: manipulation;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

/* El icono es el mismo mecanismo de máscara que usa el resto del sistema:
   hereda el color del texto y no se anuncia, porque la palabra ya está. */
.accion::before {
  content: "";
  flex: none;
  width: 1.05em;
  height: 1.05em;
  background-color: currentColor;
  -webkit-mask: var(--icono) center / contain no-repeat;
  mask: var(--icono) center / contain no-repeat;
}

/* Reservar es lo que la grilla quiere que pase: forma de píldora, tinta de
   marca, borde entero y letra fuerte. */
.accion--reservar {
  --icono: var(--i-plus-circle);
  border-radius: var(--radio-3);
  border-color: var(--cancha);
  color: var(--cancha);
  font-weight: 700;
}

/* Administrar es una salida de servicio: rectangular, en tinta suave y con
   menos peso, para que catorce bloques ocupados no le griten a nadie. */
.accion--administrar {
  --icono: var(--i-pencil);
  border-radius: var(--radio-1);
  border-color: var(--linea);
  color: var(--tinta-suave);
  font-weight: 500;
}

.accion--reservar:hover { background: var(--libre-fondo); }

.accion--administrar:hover {
  background: var(--realce-suave);
  border-color: var(--borde-control);
  color: var(--tinta);
}

/* Apretado: el fondo se hunde un paso. El estado dura lo que dura el dedo
   sobre la pantalla, y es la única confirmación de que el toque entró. */
.accion:active { background: var(--realce-fuerte); }

/* El foco nunca se apaga: se dibuja más grueso que el del resto del documento
   porque acá hay catorce destinos seguidos y hay que ver en cuál se está. */
.accion:focus-visible {
  outline: 3px solid var(--cancha);
  outline-offset: 2px;
  background: var(--realce-suave);
}

/* --- El globo de ayuda ----------------------------------------------------
   El atributo «title» del navegador tiene tres defectos que no se pueden
   arreglar: no aparece nunca con el teclado, no aparece nunca en una pantalla
   táctil, y no se puede estilar. Se reemplazó por «data-sugerencia», que es un
   dato nuestro y se dibuja acá. El nombre del atributo no es «title» a
   propósito: con los dos puestos el navegador mostraría dos globos, uno suyo y
   uno nuestro, diciendo lo mismo.

   Para el lector de pantalla el globo no existe, y está bien que no exista: el
   control ya lleva «aria-label» con exactamente esa información. Un
   «aria-describedby» no serviría —los pseudo-elementos no son referenciables—
   y aunque sirviera solo lograría que la frase se leyera dos veces.

   El texto sale de «attr()», así que lo que se ve es el mismo dato que viaja
   en el HTML: no hay forma de que el globo diga una cosa y la etiqueta
   accesible otra. */
[data-sugerencia]::after {
  content: attr(data-sugerencia);
  position: absolute;
  z-index: 2;
  width: max-content;
  /* El tope de ancho es lo que garantiza que el globo quepa: 17rem son 272 px,
     menos que el ancho mínimo de cualquiera de las tres grillas del sistema,
     así que el globo nunca empuja el marco ni saca un scroll que no estaba. */
  max-width: 17rem;
  padding: var(--e-1) var(--e-2);
  border-radius: var(--radio-1);
  /* El globo se lee sobre el tablero, que es la única superficie oscura del
     sistema con los dos temas: así se distingue de una tarjeta de contenido a
     primera vista, de día y de noche. */
  background: var(--tablero-fondo);
  color: var(--tablero-tinta);
  font-family: var(--fuente-ui);
  font-size: var(--texto-xs);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: normal;
  text-align: left;
  text-transform: none;
  white-space: normal;
  box-shadow: var(--sombra-2);
  /* Escondido con visibility y no con display: así la transición tiene algo
     que animar, y el globo sigue sin ocupar lugar ni recibir el puntero. */
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 120ms ease;
}

/* Puntero y teclado, siempre juntos. El :focus-visible es la mitad que el
   «title» del navegador nunca tuvo. */
[data-sugerencia]:hover::after,
[data-sugerencia]:focus-visible::after {
  opacity: 1;
  visibility: visible;
}

/* En la grilla el globo sale hacia la izquierda y centrado en la fila, no
   arriba ni abajo. No es una preferencia estética: el marco de la tabla
   scrollea, y todo lo que se salga de su caja queda recortado o le saca una
   barra que nadie pidió. Saliendo hacia la izquierda —la columna de acción es
   la última— y quedándose dentro del alto de la fila, que lo fija el área
   táctil de 44 px del enlace, el globo vive siempre adentro del marco. */
.accion[data-sugerencia]::after {
  top: 50%;
  right: calc(100% - var(--e-1));
  transform: translateY(-50%);
}

/* --- El control que no se puede apretar -----------------------------------
   En la ficha de una reserva fuera de plazo no hay botón de cancelar, y esa
   ausencia deja una pregunta sin contestar: ¿no está porque no se puede, o
   porque la pantalla se olvidó? El lugar del botón queda ocupado por el botón
   mismo, vedado: se ve que existe, se ve que no se puede, y el globo dice por
   qué.

   «aria-disabled» y no «disabled»: un control deshabilitado de verdad sale del
   recorrido del teclado, y entonces quien navega con teclado se queda sin la
   única explicación. Así queda enfocable, se anuncia como no disponible, y al
   apretarlo no pasa nada —que es exactamente lo que declara.

   Acá el globo va arriba: no hay marco que scrollee y sobra lugar. */
.boton-vedado {
  position: relative;
  color: var(--tinta-suave);
  background: var(--papel);
  border-style: dashed;
  border-color: var(--linea);
  cursor: not-allowed;
}

/* El hover del botón normal promete que algo va a pasar. Acá no pasa nada, y
   la forma tiene que decirlo también cuando el puntero pasa por encima. */
.boton-vedado:hover {
  color: var(--tinta-suave);
  background: var(--papel);
  border-color: var(--linea);
}

.boton-vedado[data-sugerencia]::after {
  bottom: calc(100% + var(--e-1));
  left: 0;
}

/* --- La fila con la que se está trabajando -------------------------------
   Catorce filas iguales y una tabla que se lee cruzando la vista de la hora a
   la acción: hace falta que la fila entera se encienda cuando el puntero o el
   teclado están en ella. Sin JavaScript y sin tocar las celdas: :hover y
   :focus-within alcanzan, y la marca de la izquierda dice dónde empieza.

   La clase .bloque existe para poder decir «fila de bloque» sin atrapar la de
   los encabezados, que también es un <tr>. */
.grilla tr.bloque:hover,
.grilla tr.bloque:focus-within { background-color: var(--realce-suave); }

/* Cuando la dirección nombra un bloque —se llegó acá desde él— la marca se
   queda puesta aunque el puntero se vaya: es memoria de en qué se estaba.
   Se nombra con las dos clases para pesar lo mismo que :hover y ganarle por
   orden: pasar el puntero por encima del bloque elegido no puede aflojarle la
   marca, que es el estado más fuerte de los dos. */
.grilla tr.bloque.seleccionada { background-color: var(--realce-fuerte); }

.grilla tr.bloque:hover td:first-child,
.grilla tr.bloque:focus-within td:first-child,
.grilla tr.bloque.seleccionada td:first-child {
  box-shadow: inset 3px 0 0 var(--cancha);
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
   Confirmación, error y aviso comparten la misma forma: barra de acento a la
   izquierda, icono, y el texto en tinta plena para que se lea. Son la misma
   pieza con tres temperaturas, así que se dibujan una sola vez y lo único que
   cambia es el par acento/fondo y el icono.
   No se desvanecen solos. En estas pantallas el aviso *es* el contenido —
   esconderlo a los cuatro segundos dejaría la página vacía—, así que se
   quedan hasta que la persona navegue. */
.ok, .error, .aviso {
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

/* El aviso de la pantalla de una reserva no confirma nada ni denuncia nada:
   informa. Por omisión es la variante fría; cuando el aviso lleva role="alert"
   —el plazo se cerró, el bloque ya pasó— toma el acento del error, que es
   exactamente lo que el rol declara. La variante sale del atributo y no de una
   clase nueva para que no puedan separarse: lo que se anuncia y lo que se
   pinta quedan atados a la misma decisión. */
.aviso {
  --acento-aviso: var(--info);
  --fondo-aviso: var(--info-fondo);
  --icono: var(--i-info);
}

.aviso[role="alert"] {
  --acento-aviso: var(--ocupado);
  --fondo-aviso: var(--ocupado-fondo);
  --icono: var(--i-warning);
}

.ok::before, .error::before, .aviso::before {
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

.ok > *, .error > *, .aviso > * { grid-column: 2; margin: 0; }

.ok > * + *, .error > * + *, .aviso > * + * { margin-top: var(--e-2); }

/* Un distintivo dentro de un aviso se queda del ancho de su palabra: si se
   estirara de lado a lado dejaría de leerse como distintivo. */
.aviso > .pildora { justify-self: start; }

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

/* --- La ficha de una reserva ---------------------------------------------
   Cinco datos y un estado. No es una tabla —no hay filas que comparar entre
   sí— sino una lista de definiciones: cada rótulo con su valor. En el teléfono
   el valor va debajo del rótulo; apenas hay ancho, se ponen en dos columnas y
   los valores quedan alineados en una sola vertical, que es lo que permite
   leerlos de un vistazo en vez de ir cazándolos. */
.detalle {
  margin: 0 0 var(--e-5);
  padding: var(--e-2) var(--e-5);
  background: var(--superficie);
  border: 1px solid var(--linea);
  border-radius: var(--radio-2);
  box-shadow: var(--sombra-1);
}

/* El separador se dibuja como fondo y no como borde inferior, igual que en
   las tablas: así la última fila lo apaga sin dejar un borde a medio pintar. */
.detalle-fila {
  display: grid;
  gap: 0 var(--e-4);
  padding: var(--e-3) 0;
  background-image: linear-gradient(var(--linea), var(--linea));
  background-position: bottom;
  background-size: 100% 1px;
  background-repeat: no-repeat;
}

.detalle-fila:last-child { background-image: none; }

@media (min-width: 30rem) {
  .detalle-fila {
    grid-template-columns: 11rem minmax(0, 1fr);
    align-items: baseline;
  }
}

/* El rótulo es rótulo de tablero, con la misma voz que los nombres de cancha
   de la portada: no compite con el dato, lo presenta. */
.detalle dt {
  font-size: var(--texto-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--tinta-suave);
}

.detalle dd {
  margin: 0;
  font-weight: 600;
}

/* --- Distintivos ---------------------------------------------------------
   La píldora dice de un vistazo lo que el párrafo dice en prosa. Nunca dice
   otra cosa: si el aviso explica que todavía se puede cancelar, el distintivo
   es PUEDE CANCELARSE y no un símbolo que haya que interpretar.
   El borde no es decoración: es la señal que queda cuando el color no llega
   —pantalla en blanco y negro, impresión, daltonismo—, y por eso lo llevan
   las cuatro variantes y no solo algunas. */
.pildora {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: var(--e-1) var(--e-3);
  border: 1px solid currentColor;
  border-radius: var(--radio-3);
  background: var(--fondo-pildora);
  color: var(--tinta-pildora);
  font-size: var(--texto-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.pildora::before {
  content: "";
  flex: none;
  width: 1.05em;
  height: 1.05em;
  background-color: currentColor;
  -webkit-mask: var(--icono) center / contain no-repeat;
  mask: var(--icono) center / contain no-repeat;
}

/* Estado de la reserva: la misma pareja de colores que usa la lista del día,
   para que una reserva anulada se vea igual acá que allá. */
.pildora.estado-activa {
  --icono: var(--i-check-circle);
  --fondo-pildora: var(--libre-fondo);
  --tinta-pildora: var(--libre);
}

.pildora.estado-cancelada {
  --icono: var(--i-x-circle);
  --fondo-pildora: var(--anulado-fondo);
  --tinta-pildora: var(--anulado);
}

/* Y el plazo, que es la otra pregunta que se le hace a esta pantalla: ¿todavía
   llego? La respuesta no depende del estado sino del reloj, así que tiene su
   propio distintivo. */
.pildora--puede {
  --icono: var(--i-check-circle);
  --fondo-pildora: var(--libre-fondo);
  --tinta-pildora: var(--libre);
}

.pildora--no-puede {
  --icono: var(--i-x-circle);
  --fondo-pildora: var(--ocupado-fondo);
  --tinta-pildora: var(--ocupado);
}

/* Rótulo de pantalla: dice en qué parte del sistema se está parado antes de
   que el título diga de qué reserva se trata. */
.rotulo {
  display: inline-block;
  margin: 0 0 var(--e-3);
  padding: var(--e-1) var(--e-3);
  border: 1px solid var(--linea);
  border-radius: var(--radio-3);
  background: var(--superficie);
  color: var(--tinta-suave);
  font-size: var(--texto-xs);
  font-weight: 700;
  letter-spacing: 0.1em;
}

.rotulo + h2 { margin-top: 0; }

/* --- Avisos flotantes ----------------------------------------------------
   El sistema navega con recargas de página entera: no hay evento de cliente
   que sobreviva a un clic, así que el aviso flotante no lo dispara el
   navegador, lo emite el servidor con la página. Por eso existe y por eso
   funciona sin una línea de JavaScript.

   Un aviso flotante solo se emite cuando dice algo que la página no dice: la
   pieza que ya existía —«.ok», «.error», «.aviso»— es la que lleva el mensaje
   principal, y repetirlo acá arriba sería hacérselo leer dos veces a quien
   ve y anunciar dos veces a quien escucha.

   El contenedor es solo una percha: no tiene rol, no recibe el puntero
   («pointer-events: none») y ni siquiera se imprime cuando no hay nada que
   decir. El rol viaja en cada aviso y no en el contenedor por dos motivos: un
   error y un informativo emitidos juntos conservan el orden en que el servidor
   los puso —con un contenedor por rol habría dos pilas y ese orden se
   perdería—, y ninguna página sin avisos queda con una región viva vacía
   colgando del documento. */
.avisos-flotantes {
  position: fixed;
  z-index: 20;
  right: 0;
  bottom: 0;
  display: grid;
  gap: var(--e-2);
  /* Ancho acotado y nunca mayor que la pantalla: en el teléfono ocupa el ancho
     completo menos el aire de los costados, y en el escritorio se queda en una
     columna angosta abajo a la derecha. Ese rincón está libre en este sistema:
     los botones que hacen algo —el de reservar, el de anular— son de la
     columna de contenido y quedan a la izquierda. */
  width: min(26rem, 100%);
  padding: var(--e-4);
  pointer-events: none;
}

/* La casilla que cierra el aviso. Está escondida a la vista pero sigue en el
   recorrido del teclado: lo que se ve y se toca es su <label>, que es el botón
   de cerrar. Con esto el aviso se cierra sin JavaScript —no hay promesa que el
   navegador no pueda cumplir— y el JavaScript queda para lo único que el CSS
   no puede hacer con honestidad: contar seis segundos. */
.cierre-flotante {
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

.cierre-flotante:checked + .flotante { display: none; }

.flotante {
  /* El contenedor deja pasar el clic; el aviso, no. Nada de la página queda
     atrapado detrás de una capa invisible. */
  pointer-events: auto;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--e-3);
  align-items: start;
  padding: var(--e-3);
  color: var(--tinta);
  background: var(--fondo-aviso);
  border: 1px solid var(--linea);
  border-left: var(--e-1) solid var(--acento-aviso);
  border-radius: var(--radio-2);
  box-shadow: var(--sombra-2);
  animation: entra-flotante 160ms ease-out;
}

/* Los mismos dos pares de color que usan los avisos de bloque, para que un
   error sea del mismo color esté donde esté. */
.flotante--info {
  --acento-aviso: var(--info);
  --fondo-aviso: var(--info-fondo);
  --icono: var(--i-info);
}

.flotante--error {
  --acento-aviso: var(--ocupado);
  --fondo-aviso: var(--ocupado-fondo);
  --icono: var(--i-warning);
}

.flotante::before {
  content: "";
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.1rem;
  background-color: var(--acento-aviso);
  -webkit-mask: var(--icono) center / contain no-repeat;
  mask: var(--icono) center / contain no-repeat;
}

.flotante p {
  margin: 0;
  font-size: var(--texto-sm);
}

/* El botón de cerrar conserva sus 44 px de área táctil y se come el relleno de
   la esquina con márgenes negativos, para no ensanchar el aviso por él. */
.cerrar-flotante {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--toque);
  min-height: var(--toque);
  margin: calc(var(--e-2) * -1) calc(var(--e-2) * -1) 0 0;
  border-radius: var(--radio-1);
  color: var(--tinta-suave);
  cursor: pointer;
}

.cerrar-flotante::before {
  content: "";
  width: 1.1rem;
  height: 1.1rem;
  background-color: currentColor;
  -webkit-mask: var(--i-x-circle) center / contain no-repeat;
  mask: var(--i-x-circle) center / contain no-repeat;
}

.cerrar-flotante:hover {
  color: var(--tinta);
  background: var(--realce-suave);
}

/* El foco vive en la casilla, que no se ve: se dibuja sobre el botón, que es
   lo que la persona cree estar enfocando. */
.cierre-flotante:focus-visible + .flotante .cerrar-flotante {
  outline: 3px solid var(--cancha);
  outline-offset: 2px;
}

/* La entrada es un solo paso de 12 px. Quien pidió menos movimiento no la ve:
   el bloque de prefers-reduced-motion apaga toda animación del documento y el
   aviso aparece puesto. Por eso el apagado automático se cuenta con
   JavaScript y no con una animación: una animación de seis segundos, con menos
   movimiento pedido, dura 0,01 ms y el aviso desaparecería antes de leerse. */
@keyframes entra-flotante {
  from {
    opacity: 0;
    transform: translateY(var(--e-3));
  }
}

/* --- El teléfono ---------------------------------------------------------
   A 360 px la grilla ya no entra entera: antes de dejar que el marco scrollee
   se le saca todo el aire que sobra, que es el de los rellenos laterales. La
   página nunca scrollea de lado; el marco, si hace falta, sí. */
@media (max-width: 30rem) {
  .grilla th, .grilla td {
    padding-left: var(--e-2);
    padding-right: var(--e-2);
  }

  .grilla th:first-child { width: 5.5rem; }
  .grilla th:nth-child(2) { width: 7.5rem; }

  .accion {
    padding-left: var(--e-2);
    padding-right: var(--e-2);
  }
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

// Los avisos flotantes -----------------------------------------------------
// Un aviso informativo se apaga solo a los seis segundos; uno de error, nunca.
// La diferencia no es de estilo: un informativo confirma algo que ya pasó y su
// utilidad se agota al leerlo, mientras que un error describe algo que sigue
// sin resolverse y hacerlo desaparecer solo sería esconder el problema.
const VIDA_DEL_AVISO_INFORMATIVO = 6000;

// El apagado automático es lo único que no se puede hacer sin JavaScript sin
// mentir: una animación de CSS de seis segundos queda reducida a 0,01 ms
// cuando se pide menos movimiento, y el aviso se iría antes de poder leerse.
// Acá se cuenta el tiempo de verdad, y no se apaga un aviso que tenga el foco
// adentro o el puntero encima: nadie pierde el foco ni la frase que está
// leyendo por un reloj. El cierre se hace marcando la misma casilla que marca
// el botón, así que hay una sola manera de esconder un aviso.
function guionDeAvisosFlotantes() {
  return `<script>
  (function () {
    var flotantes = document.querySelectorAll('.flotante[data-vida]');
    Array.prototype.forEach.call(flotantes, function (flotante) {
      var vida = Number(flotante.getAttribute('data-vida'));
      var cierre = document.getElementById(flotante.getAttribute('data-cierre'));
      if (!vida || !cierre) return;
      window.setTimeout(function apagar() {
        if (flotante.contains(document.activeElement) || flotante.matches(':hover')) {
          window.setTimeout(apagar, vida);
          return;
        }
        cierre.checked = true;
      }, vida);
    });
  })();
</script>`;
}

// La región de avisos flotantes. Sin avisos no se imprime nada: una página que
// no tiene nada que decir no deja un contenedor vacío ni un guion colgado.
//
// Cada aviso lleva su rol —`status` para un informativo, `alert` para un
// error— y su propio par casilla + botón de cerrar. La casilla va *antes* del
// aviso porque el CSS la usa como hermana anterior para esconderlo, que es lo
// que permite cerrarlo sin JavaScript.
function regionDeAvisosFlotantes(avisos) {
  if (!Array.isArray(avisos) || avisos.length === 0) return '';

  const piezas = avisos.map((aviso, indice) => {
    const esError = aviso.tipo === 'error';
    const id = `aviso-flotante-${indice + 1}`;
    const vida = esError ? '' : ` data-vida="${VIDA_DEL_AVISO_INFORMATIVO}"`;
    return `<input class="cierre-flotante" type="checkbox" id="${id}">
  <div class="flotante flotante--${esError ? 'error' : 'info'}" role="${esError ? 'alert' : 'status'}" data-cierre="${id}"${vida}>
    <p>${escaparHTML(aviso.texto)}</p>
    <label class="cerrar-flotante" for="${id}"><span class="oculto">Cerrar este aviso</span></label>
  </div>`;
  }).join('\n  ');

  return `<div class="avisos-flotantes">
  ${piezas}
</div>
${guionDeAvisosFlotantes()}`;
}

// El tercer parámetro es opcional: las pantallas que no tienen nada extra que
// decir llaman a layout() exactamente como lo llamaban antes.
function layout(titulo, contenido, avisos = []) {
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
    <h1 class="marca"><img src="/branding/cancha-total-f5-logo.png" alt="Cancha Total F5" width="2172" height="724"></h1>
    <nav aria-label="Secciones">
      <a href="/">Inicio</a>
      <a href="/disponibilidad/cancha1">Cancha 1</a>
      <a href="/disponibilidad/cancha2">Cancha 2</a>
    </nav>
  </div>
</header>
${regionDeAvisosFlotantes(avisos)}
<main id="contenido">
${contenido}
</main>
</body>
</html>`;
}

// Qué bloque está mirando quien pidió esta grilla, si es que hay alguno. La
// pantalla no guarda estado y no hay JavaScript que lo recuerde: la única
// memoria disponible es la dirección. Un enlace que trae hora —y cancha, salvo
// en la pantalla de una sola cancha, donde la cancha la pone la ruta— es
// alguien que viene de ese bloque, y esa fila queda señalada.
//
// Es una lectura de presentación y no cambia una sola respuesta del sistema:
// sin esos parámetros, que es como llega todo el mundo hoy, devuelve null y la
// grilla sale exactamente igual que antes. Reusa los mismos lectores que
// /reservar, así que entiende tanto `cancha=1&hora=9` como `cancha1` y `15:00`.
function bloqueSeleccionado(query, canchaDeLaPantalla) {
  const hora = horaDelEnlace(String(query.hora ?? '').trim());
  if (hora === null) return null;
  const cancha = canchaDeLaPantalla ?? canchaDelEnlace(String(query.cancha ?? '').trim());
  return cancha === null ? null : { cancha, hora };
}

// Una fila de la grilla de disponibilidad. Las tres grillas del sistema —las
// dos de la pantalla de inicio y la de cada cancha— pintaban la misma fila con
// el mismo código copiado; al sumarles la columna de acción la copia pasaba de
// molesta a peligrosa, porque un enlace corregido en una sola de ellas dejaba
// las otras dos mintiendo. Acá vive una sola vez.
//
// `conTarifa` existe porque la pantalla de una cancha no habla de plata: ahí la
// columna de tarifa no se muestra, y el enlace tampoco la menciona.
function filaDeBloque({ cancha, hora, fecha, ocupados, conTarifa, seleccion }) {
  const clave = `${cancha}-${hora}`;
  const libre = !ocupados.has(clave);

  // Las clases de la fila son todas de presentación y viven en el <tr>, que es
  // la única parte de la fila que admite atributos: las celdas tienen su forma
  // fijada por la suite y no se tocan.
  //
  //   bloque       — es una fila de bloque y no la de encabezados, que también
  //                  es un <tr>. La hoja de estilo necesita poder decirlo para
  //                  encender la fila bajo el puntero sin encender el título.
  //   con-luz      — el bloque se juega con luz encendida: deja que la grilla
  //                  muestre de dónde sale el salto de tarifa. No decide nada;
  //                  el precio lo sigue decidiendo tarifaDelBloque().
  //   seleccionada — la dirección nombra este bloque, así que la fila se queda
  //                  marcada. Es la única memoria posible de «en esto estaba»
  //                  en un sistema sin estado en el navegador.
  const clases = ['bloque'];
  if (hora >= HORA_EN_QUE_ENCIENDE_LA_LUZ) clases.push('con-luz');
  if (seleccion && seleccion.cancha === cancha && seleccion.hora === hora) {
    clases.push('seleccionada');
  }

  const celdaEstado = `<td class="${libre ? 'libre' : 'ocupado'}">${libre ? 'Libre' : 'Ocupado'}</td>`;
  const celdaTarifa = conTarifa ? `<td>${formatColones(tarifaDelBloque(hora))}</td>` : '';

  // El bloque libre invita a reservarlo con la fecha y la hora ya puestas; el
  // ocupado lleva a la reserva que lo ocupa. Los dos llevan sugerencia y
  // etiqueta accesible completas porque «Reservar» repetido catorce veces no le
  // dice nada a quien navega la tabla con un lector de pantalla.
  //
  // La sugerencia viaja en `data-sugerencia` y no en `title`: el globo lo
  // dibuja la hoja de estilo, así que aparece también con el teclado y en una
  // pantalla táctil, que es donde el `title` del navegador nunca aparece. Con
  // los dos atributos puestos se verían dos globos diciendo lo mismo, así que
  // el `title` se fue. El `aria-label` se queda tal cual estaba: es el que le
  // dice al lector de pantalla lo mismo que el globo le dice al ojo.
  const celdaAccion = libre
    ? `<td class="celda-accion"><a class="accion accion--reservar" href="/reservar?cancha=${cancha}&amp;fecha=${escaparHTML(fecha)}&amp;hora=${hora}" data-sugerencia="Reservar Cancha ${cancha} a las ${hora}:00" aria-label="Reservar Cancha ${cancha} a las ${hora}:00 del ${escaparHTML(fecha)}">Reservar</a></td>`
    : `<td class="celda-accion"><a class="accion accion--administrar" href="/reserva/${ocupados.get(clave)}" data-sugerencia="Ver o administrar reserva de Cancha ${cancha} a las ${hora}:00" aria-label="Ver o administrar la reserva de Cancha ${cancha} a las ${hora}:00 del ${escaparHTML(fecha)}">Administrar</a></td>`;

  return `<tr class="${clases.join(' ')}"><td>${hora}:00</td>${celdaEstado}${celdaTarifa}${celdaAccion}</tr>`;
}

// El formulario de nueva reserva. Aparece en dos pantallas —la de inicio, donde
// se llena de cero, y la de /reservar, a la que se llega desde un bloque libre
// de la grilla— y las dos tienen que mandarle exactamente los mismos campos al
// mismo POST /reservas. Vivía interpolado dentro de la pantalla de inicio
// porque había una sola pantalla; ahora hay dos, y se comparte antes de que se
// vuelvan dos copias que se van separando sin que nadie lo note.
//
// `preseleccionar` es lo único que las distingue. La pantalla de inicio no
// llega con un bloque elegido: su formulario sale en blanco y sin un solo
// atributo `selected`, exactamente como salía antes de que esta función
// existiera. La de /reservar sí llega con la cancha y la hora del bloque en que
// se hizo clic, y marcarlas es todo el sentido de haber hecho clic.
function formularioDeReserva({ cancha, fecha, hora, preseleccionar }) {
  const marcada = (valor, opcion) => (preseleccionar && Number(valor) === opcion ? ' selected' : '');
  const horas = Array.from({ length: 14 }, (_, i) => 8 + i);
  return `<form class="reserva" method="post" action="/reservas">
  <input type="hidden" name="fecha" value="${escaparHTML(fecha)}">
  <div class="campos">
    <div class="campo">
      <label for="cancha">Cancha:</label>
      <select name="cancha" id="cancha">
        <option value="1"${marcada(cancha, 1)}>Cancha 1</option>
        <option value="2"${marcada(cancha, 2)}>Cancha 2</option>
      </select>
    </div>
    <div class="campo">
      <label for="hora">Hora de inicio:</label>
      <select name="hora" id="hora">
        ${horas.map(h => `<option value="${h}"${marcada(hora, h)}>${h}:00</option>`).join('')}
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
</form>`;
}

// El precio estimado que muestra el formulario lo pide el navegador: cada vez
// que cambia la hora elegida le pregunta la tarifa a /api/cotizar. Acompaña al
// formulario a las dos pantallas donde aparece, así que se arma en el mismo
// lugar y no en cada una. La fecha viaja adentro porque la cotización se pide
// por bloque, y va por escaparParaGuion() porque adentro de un <script> las
// entidades HTML no protegen.
function guionDePrecioEstimado(fecha) {
  return `<script>
  function actualizarPrecio() {
    var hora = document.getElementById('hora').value;
    fetch(${escaparParaGuion('/api/cotizar?fecha=' + fecha + '&hora=')} + hora)
      .then(function (r) { return r.json(); })
      .then(function (d) { document.getElementById('precioEstimado').textContent = d.precioFormateado; });
  }
  document.getElementById('hora').addEventListener('change', actualizarPrecio);
  actualizarPrecio();
</script>`;
}

// GET / -------------------------------------------------------------------
// Disponibilidad del día para ambas canchas + formulario de reserva.
app.get('/', asincrono(async (req, res) => {
  const fecha = req.query.fecha || hoyISO();
  const ocupados = await bloquesOcupadosDelDia(fecha);
  const seleccion = bloqueSeleccionado(req.query);

  let filasCancha1 = '';
  let filasCancha2 = '';
  for (let hora = 8; hora <= 21; hora++) {
    filasCancha1 += filaDeBloque({ cancha: 1, hora, fecha, ocupados, conTarifa: true, seleccion });
    filasCancha2 += filaDeBloque({ cancha: 2, hora, fecha, ocupados, conTarifa: true, seleccion });
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
<div class="tabla-marco"><table class="grilla"><tr><th>Hora</th><th>Estado</th><th>Tarifa</th><th>Acción</th></tr>${filasCancha1}</table></div>
</section>
<section>
<h3>Cancha 2</h3>
<div class="tabla-marco"><table class="grilla"><tr><th>Hora</th><th>Estado</th><th>Tarifa</th><th>Acción</th></tr>${filasCancha2}</table></div>
</section>
</div>

<h2>Nueva reserva</h2>
${formularioDeReserva({ fecha, preseleccionar: false })}

<p class="acciones"><a href="/dia/${escaparHTML(fecha)}">Ver lista de reservas del ${escaparHTML(fecha)}</a></p>

${guionDePrecioEstimado(fecha)}
`;

  res.send(layout('Inicio', contenido));
}));

// GET /disponibilidad/cancha1 y /disponibilidad/cancha2 -------------------
// Los dos son la misma pantalla con distinto número de cancha.
async function pantallaDeDisponibilidad(cancha, req, res) {
  const fecha = req.query.fecha || hoyISO();
  const ocupados = await bloquesOcupadosDelDia(fecha);
  // Acá la cancha no la trae la dirección sino la ruta: la pantalla ya sabe de
  // cuál habla, y lo único que puede llegar de afuera es la hora.
  const seleccion = bloqueSeleccionado(req.query, cancha);
  let filas = '';
  for (let hora = 8; hora <= 21; hora++) {
    // Esta pantalla no habla de plata: es la vista de una sola cancha y solo
    // informa ocupación, así que la fila sale sin la columna de tarifa.
    filas += filaDeBloque({ cancha, hora, fecha, ocupados, conTarifa: false, seleccion });
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
<div class="tabla-marco tabla-marco--angosto"><table class="grilla grilla--sin-tarifa"><tr><th>Hora</th><th>Estado</th><th>Acción</th></tr>${filas}</table></div>
`;
  res.send(layout(`Cancha ${cancha}`, contenido));
}

app.get('/disponibilidad/cancha1', asincrono((req, res) => pantallaDeDisponibilidad(1, req, res)));
app.get('/disponibilidad/cancha2', asincrono((req, res) => pantallaDeDisponibilidad(2, req, res)));

// GET /reservar -----------------------------------------------------------
// La pantalla que abre un bloque libre de la grilla, con el bloque ya elegido.
//
// El enlace lo arma filaDeBloque() como `cancha=1&fecha=...&hora=9`, pero un
// enlace también se copia, se pega y se escribe a mano, y la documentación del
// sistema los muestra en la otra forma: `cancha1` y `15:00`. Las dos dicen lo
// mismo, así que las dos se entienden. Lo que no se adivina es el resto: ahí no
// se inventa un valor por omisión, se muestra el problema.
function canchaDelEnlace(texto) {
  const limpio = texto.toLowerCase().replace(/^cancha/, '');
  return /^\d+$/.test(limpio) ? Number(limpio) : null;
}

function horaDelEnlace(texto) {
  const coincidencia = /^(\d{1,2})(?::00)?$/.exec(texto);
  return coincidencia ? Number(coincidencia[1]) : null;
}

app.get('/reservar', asincrono(async (req, res) => {
  // Los tres parámetros llegan como texto de la query y pueden no llegar. Se
  // normalizan primero y se juzgan después, para poder distinguir «no vino» de
  // «vino mal»: no es lo mismo un enlace incompleto que uno equivocado.
  const canchaTexto = String(req.query.cancha ?? '').trim();
  const fecha = String(req.query.fecha ?? '').trim();
  const horaTexto = String(req.query.hora ?? '').trim();

  const cancha = canchaDelEnlace(canchaTexto);
  const hora = horaDelEnlace(horaTexto);

  // Se juntan todos los problemas y se informan de una sola vez, con el mismo
  // criterio que POST /reservas: quien llega con un enlace roto se entera de
  // todo lo que tiene mal, no del primer defecto y después del siguiente.
  const errores = [];

  if (canchaTexto === '') {
    errores.push('Falta indicar la cancha.');
  } else if (cancha !== 1 && cancha !== 2) {
    errores.push('La cancha debe ser 1 o 2.');
  }

  if (fecha === '') {
    errores.push('Falta la fecha.');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    errores.push('El formato de la fecha es inválido.');
  }

  if (horaTexto === '') {
    errores.push('Falta la hora de inicio.');
  } else if (hora === null || hora < 8 || hora > 21) {
    errores.push('La hora debe ser un bloque entre las 08:00 y las 21:00.');
  }

  if (errores.length > 0) {
    const listaErrores = errores.map(e => `<li>${e}</li>`).join('');
    const contenidoError = `<div class="error" role="alert"><p>No se pudo abrir el formulario de reserva:</p><ul>${listaErrores}</ul></div><p class="acciones"><a href="/">Volver</a></p>`;
    return res.send(layout('Error', contenidoError));
  }

  // Un enlace a un bloque libre envejece: la grilla que lo pintó pudo haberse
  // dibujado hace media hora, y en el medio alguien reservó ese bloque. Mostrar
  // el formulario igual sería invitar a escribir un nombre y un teléfono para
  // que POST /reservas los rechace al final. Se avisa acá, con la reserva que
  // lo ocupa a un clic, que es lo que hace falta para resolverlo.
  const ocupados = await bloquesOcupadosDelDia(fecha);
  const idQueOcupa = ocupados.get(`${cancha}-${hora}`);
  if (idQueOcupa !== undefined) {
    const contenidoOcupado = `<div class="error" role="alert"><p>Ese bloque ya está ocupado: cancha ${cancha}, ${escaparHTML(fecha)} a las ${hora}:00.</p><p>Elegí otro bloque libre de la grilla o revisá la reserva que lo ocupa.</p></div><p class="acciones"><a href="/reserva/${idQueOcupa}">Administrar la reserva #${idQueOcupa}</a> | <a href="/?fecha=${escaparHTML(fecha)}">Volver a disponibilidad</a></p>`;
    // El aviso flotante no repite el error de la página: cuenta lo que la
    // página no cuenta, que es de dónde salió el choque. El bloque figuraba
    // libre cuando se pintó la grilla —de ahí venía este enlace— y dejó de
    // estarlo en el medio. Sin eso, quien hizo clic en una casilla que decía
    // «Libre» se queda pensando que se equivocó de casilla.
    return res.send(layout('Bloque ocupado', contenidoOcupado, [{
      tipo: 'error',
      texto: 'Ese bloque figuraba libre en la grilla desde la que llegaste: alguien lo tomó entre que esa grilla se dibujó y este clic.',
    }]));
  }

  // La tarifa que se muestra es la del bloque y nada más. El descuento de
  // cliente frecuente depende de cuántas reservas lleve el teléfono en el mes,
  // y el teléfono todavía no se escribió: lo decide POST /reservas al
  // confirmar, igual que cuando el formulario se llena desde la pantalla de
  // inicio. Decir acá un precio con descuento sería prometer lo que no se sabe.
  const contenido = `
<h2>Reservar Cancha ${cancha} - <span class="dato">${escaparHTML(fecha)}</span> a las ${hora}:00</h2>
<p>Tarifa del bloque: <strong>${formatColones(tarifaDelBloque(hora))}</strong>. Es la tarifa sin descuento: si el teléfono llega a las cuatro reservas del mes, el 10% de cliente frecuente se aplica al confirmar.</p>
${formularioDeReserva({ cancha, fecha, hora, preseleccionar: true })}

<p class="acciones"><a href="/?fecha=${escaparHTML(fecha)}">Volver a disponibilidad</a></p>

${guionDePrecioEstimado(fecha)}
`;

  // Lo que el aviso flotante agrega no son los tres valores —el título y el
  // formulario ya los muestran— sino su origen: los campos vinieron del bloque
  // en el que se hizo clic y no de un valor por omisión. Es la única forma de
  // distinguir «el formulario ya sabe a qué bloque voy» de «el formulario
  // arrancó en la primera opción de la lista», que se ven igual.
  const avisoDePrecarga = {
    tipo: 'info',
    texto: `Cancha, fecha y hora quedaron completadas con el bloque que elegiste: Cancha ${cancha}, ${fecha} a las ${hora}:00.`,
  };

  res.send(layout('Nueva reserva', contenido, [avisoDePrecarga]));
}));

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

// Administración de una reserva --------------------------------------------
// La grilla dejó de ser un tablero de solo lectura: cada bloque ocupado lleva a
// la reserva que lo ocupa. Lo que sigue es esa pantalla y la confirmación que
// se le pide a quien decide anular. Ninguna de las dos escribe en la base: el
// único que cancela sigue siendo POST /reservas/:id/cancelar, que no cambió.

// Un número de reserva llega como texto en la dirección, y una dirección se
// escribe a mano tanto como se hace clic. Lo que no es un entero no es un
// número de reserva: no se redondea ni se adivina, se trata como lo que es, un
// enlace que no lleva a ninguna parte.
function numeroDeReserva(texto) {
  return /^\d+$/.test(String(texto).trim()) ? Number(texto) : null;
}

// Las dos pantallas contestan lo mismo cuando el enlace no lleva a ninguna
// parte: es la misma situación, y decirla de dos maneras solo sería una
// diferencia sin motivo. El texto se cuida de no repetir la frase con que el
// POST avisa de una reserva ya anulada, porque no existir y estar anulada son
// dos cosas distintas y quien lee tiene que poder distinguirlas.
function pantallaDeReservaInexistente(id) {
  const cual = id === null ? 'esa reserva' : `la reserva #${id}`;
  return layout('Error', `<div class="error" role="alert"><p>No existe ${cual}. El enlace puede estar mal copiado, o la reserva nunca se registró.</p></div><p class="acciones"><a href="/">Volver a disponibilidad</a></p>`);
}

// La misma cuenta y la misma constante que usa el POST, para que la pantalla no
// ofrezca lo que el POST después va a negar. Acá solo se mira: quien decide de
// verdad sigue siendo el POST, porque entre que se pinta esta pantalla y se
// aprieta el botón el reloj sigue corriendo.
function plazoDeCancelacion(reserva) {
  const horas = horasHastaElPartido(reserva, ahora());
  return { horas, alcanza: horas >= HORAS_DE_PLAZO_PARA_CANCELAR, yaPaso: horas <= 0 };
}

// Las horas exactas no le sirven a nadie: lo que se quiere saber es si hay
// tiempo. Se redondean y se dicen en prosa, en singular o en plural según
// corresponda.
function faltanEnProsa(horas) {
  const redondeadas = Math.round(horas);
  if (redondeadas <= 0) return 'falta menos de una hora';
  if (redondeadas === 1) return 'falta una hora';
  return `faltan ${redondeadas} horas`;
}

// Un partido que ya se jugó y uno que empieza en veinte minutos no se rechazan
// por la misma razón, y hablarle de plazo a quien mira una reserva de la semana
// pasada sonaría a burla. Se dicen distinto.
function motivoDeNoPoderCancelar(plazo) {
  if (plazo.yaPaso) {
    return 'El bloque de esta reserva ya pasó: no queda partido que anular.';
  }
  return `Esta reserva ya no se puede cancelar: ${faltanEnProsa(plazo.horas)} para el bloque, y el plazo para anular cierra ${HORAS_DE_PLAZO_PARA_CANCELAR} horas antes.`;
}

// Cliente y teléfono solo salen si la configuración lo pide; por omisión no
// sale ninguno de los dos. Cuando salen, salen escapados, igual que en toda
// pantalla del sistema (PANT-16).
function datosDelClienteEnElDetalle(reserva) {
  if (!DETALLE_MUESTRA_DATOS_DEL_CLIENTE) return '';
  return `
  <div class="detalle-fila"><dt>Cliente</dt><dd>${escaparHTML(reserva.cliente)}</dd></div>
  <div class="detalle-fila"><dt>Teléfono</dt><dd class="dato">${escaparHTML(reserva.telefono || '')}</dd></div>`;
}

// GET /reserva/:id ----------------------------------------------------------
// Qué es esa ocupación de la grilla y qué se puede hacer con ella. Antes había
// que ir a la lista del día y buscarla a ojo entre las demás.
app.get('/reserva/:id', asincrono(async (req, res) => {
  const id = numeroDeReserva(req.params.id);
  const reserva = id === null
    ? null
    : await bd.consultarUno('SELECT * FROM reservas WHERE id = ?', [id]);

  if (!reserva) {
    return res.send(pantallaDeReservaInexistente(id));
  }

  const plazo = plazoDeCancelacion(reserva);

  // El enlace para cancelar aparece solo cuando cancelar es posible. Mostrarlo
  // igual y contestar el rechazo un clic después sería hacerle recorrer a
  // alguien un camino que ya se sabe cerrado.
  //
  // El aviso lo explica en prosa y el distintivo lo dice en dos palabras. Los
  // dos dicen lo mismo, siempre: el distintivo es un resumen del párrafo que
  // tiene al lado, nunca una segunda respuesta que haya que conciliar con la
  // primera. Quien barre la pantalla con la vista se lleva la respuesta; quien
  // la lee entera se lleva el motivo.
  const distintivoPuede = '<p class="pildora pildora--puede">PUEDE CANCELARSE</p>';
  const distintivoNoPuede = '<p class="pildora pildora--no-puede">NO CANCELABLE</p>';

  let seccionDeCancelacion;
  if (reserva.estado === 'cancelada') {
    seccionDeCancelacion = `<div class="aviso" role="status">${distintivoNoPuede}<p>Esta reserva está anulada: el bloque volvió a quedar libre y no hay nada más que cancelar.</p></div>`;
  } else if (plazo.alcanza) {
    seccionDeCancelacion = `<div class="aviso" role="status">${distintivoPuede}<p>Todavía se puede cancelar: ${faltanEnProsa(plazo.horas)} para el inicio del bloque, y el plazo cierra ${HORAS_DE_PLAZO_PARA_CANCELAR} horas antes.</p></div>
<p class="acciones"><a class="boton-anular" href="/reserva/${reserva.id}/cancelar">Cancelar reserva</a></p>`;
  } else {
    // El botón no se puede apretar, pero el lugar del botón sí se ocupa. Que
    // el control desaparezca sin dejar rastro obliga a deducir por qué no
    // está; dejándolo vedado, con su globo encima, la respuesta está donde se
    // fue a buscarla.
    //
    // El globo dice la regla y no la cuenta: «faltan menos de 24 horas» es
    // cierto mientras el bloque no haya empezado. Para una reserva cuyo bloque
    // ya pasó esa frase sería falsa —no faltan horas, sobran—, así que ese
    // caso lleva su propia frase. El párrafo de al lado sigue dando el detalle
    // en prosa; el globo es el resumen que se lee sin soltar el control.
    const sugerencia = plazo.yaPaso
      ? 'No se puede cancelar porque el bloque ya pasó'
      : 'No se puede cancelar porque faltan menos de 24 horas';
    seccionDeCancelacion = `<div class="aviso" role="alert">${distintivoNoPuede}<p>${motivoDeNoPoderCancelar(plazo)}</p></div>
<p class="acciones"><button class="boton-vedado" type="button" aria-disabled="true" data-sugerencia="${sugerencia}">Cancelar reserva</button></p>`;
  }

  const contenido = `
<p class="rotulo">ADMINISTRAR RESERVA</p>
<h2>Reserva <span class="dato">#${reserva.id}</span></h2>
<dl class="detalle">
  <div class="detalle-fila"><dt>Cancha</dt><dd>Cancha ${escaparHTML(reserva.cancha)}</dd></div>
  <div class="detalle-fila"><dt>Fecha</dt><dd class="dato">${escaparHTML(reserva.fecha)}</dd></div>
  <div class="detalle-fila"><dt>Hora</dt><dd class="dato">${escaparHTML(reserva.hora)}:00</dd></div>
  <div class="detalle-fila"><dt>Precio cobrado</dt><dd class="dato">${formatColones(reserva.precio)}</dd></div>
  <div class="detalle-fila"><dt>Estado</dt><dd><span class="pildora estado-${escaparHTML(reserva.estado)}">${escaparHTML(reserva.estado)}</span></dd></div>${datosDelClienteEnElDetalle(reserva)}
</dl>
${seccionDeCancelacion}
<p class="acciones"><a href="/dia/${escaparHTML(reserva.fecha)}">Ver la lista del día</a> | <a href="/?fecha=${escaparHTML(reserva.fecha)}">Volver a disponibilidad</a></p>
`;

  res.send(layout(`Reserva #${reserva.id}`, contenido));
}));

// GET /reserva/:id/cancelar --------------------------------------------------
// La confirmación. Cancelar es irreversible y ahora queda a dos clics de una
// portada que abre cualquiera: entre el clic y la anulación tiene que haber una
// pantalla que diga en voz alta qué se está por deshacer.
//
// Esta pantalla no escribe una sola letra en la base, y eso es deliberado: el
// que cancela es el POST del formulario de abajo. Un GET que cancelara anularía
// reservas solo con que alguien pegue el enlace en un chat que lo previsualiza.
app.get('/reserva/:id/cancelar', asincrono(async (req, res) => {
  const id = numeroDeReserva(req.params.id);
  const reserva = id === null
    ? null
    : await bd.consultarUno('SELECT * FROM reservas WHERE id = ?', [id]);

  if (!reserva) {
    return res.send(pantallaDeReservaInexistente(id));
  }

  const volver = `<p class="acciones"><a href="/reserva/${reserva.id}">Volver a la reserva</a></p>`;

  if (reserva.estado === 'cancelada') {
    return res.send(layout('Reserva anulada', `<div class="aviso" role="status"><p>La reserva #${reserva.id} está anulada desde antes: no queda nada por cancelar.</p></div>${volver}`));
  }

  const plazo = plazoDeCancelacion(reserva);
  if (!plazo.alcanza) {
    // La página explica por qué no se puede; lo que no dice —y es lo que
    // preocupa a quien acaba de pedir una cancelación— es qué pasó con la
    // reserva. Esta pantalla no escribe en la base, así que la respuesta es
    // «nada», y conviene decirla en voz alta en vez de dejarla deducir.
    return res.send(layout('Fuera de plazo', `<div class="aviso" role="alert"><p>${motivoDeNoPoderCancelar(plazo)}</p></div>${volver}`, [{
      tipo: 'error',
      texto: `No se canceló nada: la reserva #${reserva.id} sigue activa, tal como estaba.`,
    }]));
  }

  // Se nombra el bloque entero. Quien llegó desde la grilla hizo clic en una
  // casilla, no en un número de reserva: la pantalla tiene que dejarle
  // comprobar que la casilla era la que creía.
  const contenido = `
<h2>¿Cancelar la reserva <span class="dato">#${reserva.id}</span>?</h2>
<div class="aviso" role="alert">
  <p>Se va a cancelar la reserva #${reserva.id}: Cancha ${escaparHTML(reserva.cancha)}, <span class="dato">${escaparHTML(reserva.fecha)}</span> a las ${escaparHTML(reserva.hora)}:00.</p>
  <p>La cancelación no se puede deshacer: el bloque vuelve a quedar libre y cualquiera puede tomarlo.</p>
</div>
<form method="post" action="/reservas/${reserva.id}/cancelar">
  <button class="boton-anular" type="submit">Sí, cancelar la reserva</button>
</form>
<p class="acciones"><a href="/reserva/${reserva.id}">No, volver</a></p>
`;

  res.send(layout('Confirmar cancelación', contenido));
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
