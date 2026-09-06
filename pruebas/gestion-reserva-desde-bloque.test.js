// Gestión de una reserva desde su bloque — el formulario precargado, el
// detalle de la reserva y la confirmación de la cancelación.
//
// NIVEL: integración. Razón: son recorridos completos que empiezan en un
// enlace de la grilla y terminan en una pantalla; lo que se afirma es qué ve
// quien hace clic y —sobre todo— qué quedó escrito en la base después. La
// lectura de los parámetros del enlace tiene sus casos borde propios, pero no
// hay una función exportada que se pueda llamar suelta (hallazgo E-1): se
// prueba por la puerta de entrada, con enlaces de las dos formas.
//
// EL RELOJ: las pantallas de cancelación aplican la regla de las 24 horas, que
// depende de «ahora». El andamiaje lo congela en 2026-08-18 a las 10:00 y
// todas las fechas de abajo se leen contra ese instante.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema, problemasInformados, estadoDelBloque } = require('./soporte/servidor.js');

const CLIENTE = { cliente: 'Ana Vargas', telefono: '88112233' };
const FECHA = '2026-09-10';

// Pide una dirección cualquiera del sistema. Las pantallas nuevas se abren con
// la dirección y no con un formulario, así que la prueba las pide igual que el
// navegador de quien hace clic en la grilla.
async function pedir(sistema, ruta) {
  const respuesta = await fetch(sistema.direccion + ruta);
  return { estado: respuesta.status, html: await respuesta.text() };
}

// El valor que quedó elegido en una lista desplegable del formulario.
function elegidoEn(html, campo) {
  const lista = html.match(new RegExp(`<select name="${campo}"[^>]*>([\\s\\S]*?)</select>`));
  if (!lista) return null;
  const marcada = lista[1].match(/<option value="([^"]*)"[^>]*\sselected[^>]*>/);
  return marcada ? marcada[1] : null;
}

// La fecha que el formulario va a mandar al confirmar.
function fechaDelFormulario(html) {
  const campo = html.match(/<input[^>]*name="fecha"[^>]*>/);
  if (!campo) return null;
  const valor = campo[0].match(/value="([^"]*)"/);
  return valor ? valor[1] : null;
}

// ¿Hay en la pantalla un formulario de reserva que se pueda enviar?
function hayFormularioDeReserva(html) {
  return /<form[^>]*action="\/reservas"[^>]*>/.test(html);
}

// ¿La pantalla ofrece —por enlace o por formulario— cancelar esta reserva?
function ofreceCancelar(html, id) {
  return html.includes(`href="/reserva/${id}/cancelar"`)
    || new RegExp(`<form[^>]*action="/reservas/${id}/cancelar"`).test(html);
}

// --- GET /reservar: la nueva reserva precargada -----------------------------

test('el enlace de un bloque libre abre el formulario con el bloque ya elegido', async () => {
  // Falla si: la pantalla de nueva reserva deja de recibir la cancha, la fecha
  // o la hora del bloque en que se hizo clic.
  await conSistema(async (sistema) => {
    const { estado, html } = await pedir(sistema, `/reservar?cancha=1&fecha=${FECHA}&hora=15`);

    assert.equal(estado, 200);
    assert.ok(hayFormularioDeReserva(html), 'no ofrece el formulario de reserva');
    assert.equal(elegidoEn(html, 'cancha'), '1');
    assert.equal(elegidoEn(html, 'hora'), '15');
    assert.equal(fechaDelFormulario(html), FECHA);
  });
});

test('el formulario precargado muestra la tarifa del bloque', async () => {
  // Falla si: la pantalla del bloque deja de decir cuánto cuesta, o dice la
  // tarifa de otro bloque.
  await conSistema(async (sistema) => {
    const diurno = await pedir(sistema, `/reservar?cancha=1&fecha=${FECHA}&hora=16`);
    assert.match(diurno.html, /₡15\.000/);
    assert.doesNotMatch(diurno.html, /₡20\.000/);

    const conLuz = await pedir(sistema, `/reservar?cancha=1&fecha=${FECHA}&hora=17`);
    assert.match(conLuz.html, /₡20\.000/);
    assert.doesNotMatch(conLuz.html, /₡15\.000/);
  });
});

test('el enlace se entiende también escrito como cancha1 y 15:00', async () => {
  // Falla si: la pantalla solo acepta una de las dos formas del enlace y la
  // otra —la que aparece en la documentación y la que alguien escribe a mano—
  // termina en un error.
  await conSistema(async (sistema) => {
    const { estado, html } = await pedir(sistema, `/reservar?cancha=cancha1&fecha=${FECHA}&hora=15:00`);

    assert.equal(estado, 200);
    assert.ok(hayFormularioDeReserva(html), 'no ofrece el formulario de reserva');
    assert.equal(elegidoEn(html, 'cancha'), '1');
    assert.equal(elegidoEn(html, 'hora'), '15');
  });
});

test('un enlace con varios errores los informa todos juntos', async () => {
  // Falla si: la pantalla corta en el primer problema y obliga a descubrir el
  // resto de a uno.
  await conSistema(async (sistema) => {
    const { html } = await pedir(sistema, '/reservar?cancha=9&fecha=10-09-2026&hora=99');

    assert.equal(problemasInformados(html), 3);
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('un enlace sin ningún parámetro reclama los tres', async () => {
  // Falla si: la pantalla inventa valores por omisión para lo que no vino.
  await conSistema(async (sistema) => {
    const { html } = await pedir(sistema, '/reservar');

    assert.equal(problemasInformados(html), 3);
    assert.ok(!hayFormularioDeReserva(html), 'ofrece un formulario sin saber para qué bloque');
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('un bloque ya ocupado no ofrece formulario sino la reserva que lo ocupa', async () => {
  // Falla si: se muestra el formulario de un bloque que ya se vendió, y el
  // rechazo llega recién al confirmar, con el nombre y el teléfono ya escritos.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 15, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const { html } = await pedir(sistema, `/reservar?cancha=1&fecha=${FECHA}&hora=15`);

    assert.ok(!hayFormularioDeReserva(html), 'ofrece reservar un bloque que ya está vendido');
    assert.match(html, /ocupado/i);
    assert.ok(html.includes(`/reserva/${reserva.id}`), 'no lleva a la reserva que ocupa el bloque');
  });
});

test('abrir el formulario del bloque no crea ni modifica nada', async () => {
  // Falla si: una pantalla que solo se mira empieza a escribir en la base.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 15, ...CLIENTE });
    const antes = sistema.reservas();

    await pedir(sistema, `/reservar?cancha=2&fecha=${FECHA}&hora=15`);
    await pedir(sistema, `/reservar?cancha=1&fecha=${FECHA}&hora=15`);
    await pedir(sistema, '/reservar?cancha=9&fecha=nada&hora=99');
    await pedir(sistema, '/reservar');

    assert.deepEqual(sistema.reservas(), antes);
  });
});

// --- GET /reserva/:id: el detalle -------------------------------------------

test('el detalle de una reserva muestra número, cancha, fecha, hora, precio y estado', async () => {
  // Falla si: el detalle deja de identificar la reserva o lo que se cobró por
  // ella.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 2, fecha: FECHA, hora: 19, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const { estado, html } = await pedir(sistema, `/reserva/${reserva.id}`);

    assert.equal(estado, 200);
    assert.match(html, new RegExp(`#${reserva.id}`));
    assert.match(html, /Cancha 2/i);
    assert.match(html, new RegExp(FECHA));
    assert.match(html, /19:00/);
    assert.match(html, /₡20\.000/);
    assert.match(html, /activa/i);
  });
});

test('el detalle no muestra el nombre del cliente ni su teléfono', async () => {
  // Falla si: una pantalla pública —la portada lleva hasta acá en dos clics y
  // el sistema no tiene control de acceso— empieza a repartir datos personales.
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 1, fecha: FECHA, hora: 10, cliente: 'Wilberth Zamora', telefono: '87654321',
    });
    const reserva = sistema.ultimaReserva();

    const { html } = await pedir(sistema, `/reserva/${reserva.id}`);

    assert.doesNotMatch(html, /Wilberth/i, 'el detalle publica el nombre del cliente');
    assert.doesNotMatch(html, /87654321/, 'el detalle publica el teléfono del cliente');
  });
});

test('una reserva que no existe avisa y no rompe el sistema', async () => {
  // Falla si: un número inventado en la dirección termina en un error de
  // servidor en vez de en una explicación.
  await conSistema(async (sistema) => {
    const inexistente = await pedir(sistema, '/reserva/99999');
    assert.ok(inexistente.estado < 500, `contestó con ${inexistente.estado}`);
    assert.match(inexistente.html, /no existe/i);

    const disparate = await pedir(sistema, '/reserva/abc');
    assert.ok(disparate.estado < 500, `contestó con ${disparate.estado}`);
    assert.match(disparate.html, /no existe/i);
  });
});

test('una reserva activa a veinticuatro horas del bloque ofrece cancelar', async () => {
  // Falla si: el detalle esconde la cancelación de una reserva que todavía
  // está en plazo.
  await conSistema(async (sistema) => {
    // Ahora: 18/08 10:00. Bloque: 19/08 10:00 — faltan exactamente 24 horas.
    await sistema.reservar({ cancha: 1, fecha: '2026-08-19', hora: 10, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const { html } = await pedir(sistema, `/reserva/${reserva.id}`);
    assert.ok(ofreceCancelar(html, reserva.id), 'no ofrece cancelar una reserva en plazo');
  });
});

test('una reserva activa a menos de veinticuatro horas no ofrece cancelar y explica por qué', async () => {
  // Falla si: el detalle ofrece un camino que el sistema va a rechazar un clic
  // después, o lo cierra sin decir el motivo.
  await conSistema(async (sistema) => {
    // Ahora: 18/08 10:00. Bloque: 19/08 08:00 — faltan 22 horas.
    await sistema.reservar({ cancha: 1, fecha: '2026-08-19', hora: 8, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const { html } = await pedir(sistema, `/reserva/${reserva.id}`);
    assert.ok(!ofreceCancelar(html, reserva.id), 'ofrece cancelar una reserva fuera de plazo');
    assert.match(html, /24 horas/);
  });
});

test('una reserva cancelada lo dice y no ofrece cancelar', async () => {
  // Falla si: una reserva ya anulada se sigue mostrando como si hubiera algo
  // que hacer con ella.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 19, ...CLIENTE });
    const reserva = sistema.ultimaReserva();
    await sistema.cancelar(reserva.id);

    const { html } = await pedir(sistema, `/reserva/${reserva.id}`);
    assert.match(html, /cancelada|anulada/i);
    assert.ok(!ofreceCancelar(html, reserva.id), 'ofrece cancelar algo ya cancelado');
  });
});

// --- GET /reserva/:id/cancelar: la confirmación -----------------------------

test('pedir la confirmación de cancelación no cambia la reserva', async () => {
  // Falla si: la pantalla de confirmación cancela por sí sola. Es lo que
  // pasaría si el enlace apuntara directo a la acción: bastaría con que
  // alguien pegue la dirección en un chat que previsualiza enlaces para que la
  // reserva quede anulada sin que nadie lo haya decidido.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 19, ...CLIENTE });
    const antes = sistema.reservas();
    const reserva = antes[antes.length - 1];

    await pedir(sistema, `/reserva/${reserva.id}/cancelar`);
    await pedir(sistema, `/reserva/${reserva.id}/cancelar`);

    assert.deepEqual(sistema.reservas(), antes);
    assert.equal(estadoDelBloque(await sistema.disponibilidad(1, FECHA), 19), 'Ocupado');
  });
});

test('la confirmación en plazo ofrece un formulario que envía por POST', async () => {
  // Falla si: la confirmación deja de ofrecer la acción, o la ofrece por un
  // camino que no es el que cancela de verdad.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 19, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const { estado, html } = await pedir(sistema, `/reserva/${reserva.id}/cancelar`);

    assert.equal(estado, 200);
    assert.match(
      html,
      new RegExp(`<form[^>]*method="post"[^>]*action="/reservas/${reserva.id}/cancelar"`, 'i'),
    );
  });
});

test('fuera de plazo la confirmación no ofrece el formulario y explica', async () => {
  // Falla si: se ofrece confirmar una cancelación que el sistema va a rechazar.
  await conSistema(async (sistema) => {
    // Ahora: 18/08 10:00. Bloque: 19/08 08:00 — faltan 22 horas.
    await sistema.reservar({ cancha: 1, fecha: '2026-08-19', hora: 8, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const { html } = await pedir(sistema, `/reserva/${reserva.id}/cancelar`);

    assert.doesNotMatch(html, new RegExp(`<form[^>]*action="/reservas/${reserva.id}/cancelar"`));
    assert.match(html, /24 horas/);
    assert.equal(sistema.reservas().find((fila) => fila.id === reserva.id).estado, 'activa');
  });
});

test('una reserva ya cancelada no ofrece el formulario de confirmación', async () => {
  // Falla si: se puede volver a confirmar la cancelación de algo ya anulado.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 19, ...CLIENTE });
    const reserva = sistema.ultimaReserva();
    await sistema.cancelar(reserva.id);

    const { html } = await pedir(sistema, `/reserva/${reserva.id}/cancelar`);

    assert.doesNotMatch(html, new RegExp(`<form[^>]*action="/reservas/${reserva.id}/cancelar"`));
    assert.match(html, /anulada|cancelada/i);
  });
});

test('la confirmación de una reserva que no existe avisa y no rompe el sistema', async () => {
  // Falla si: el enlace de confirmación mal copiado termina en un error de
  // servidor.
  await conSistema(async (sistema) => {
    const { estado, html } = await pedir(sistema, '/reserva/99999/cancelar');

    assert.ok(estado < 500, `contestó con ${estado}`);
    assert.match(html, /no existe/i);
  });
});

test('confirmada la cancelación, la reserva queda cancelada y su bloque vuelve a verse libre', async () => {
  // Falla si: el recorrido completo —bloque ocupado, detalle, confirmación,
  // envío— no llega a liberar el bloque en la grilla.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 19, ...CLIENTE });
    const reserva = sistema.ultimaReserva();
    assert.equal(estadoDelBloque(await sistema.disponibilidad(1, FECHA), 19), 'Ocupado');

    await pedir(sistema, `/reserva/${reserva.id}/cancelar`);
    await sistema.cancelar(reserva.id);

    assert.equal(sistema.reservas().find((fila) => fila.id === reserva.id).estado, 'cancelada');
    assert.equal(estadoDelBloque(await sistema.disponibilidad(1, FECHA), 19), 'Libre');
  });
});

test('mirar el detalle de una reserva no la modifica', async () => {
  // Falla si: una pantalla de consulta escribe en la base.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 19, ...CLIENTE });
    const antes = sistema.reservas();

    await pedir(sistema, `/reserva/${antes[0].id}`);
    await pedir(sistema, '/reserva/99999');

    assert.deepEqual(sistema.reservas(), antes);
  });
});
