// Cancelación — RN-27 a RN-31 de ESPECIFICACION.md
//
// NIVEL: integración. Razón: la regla del plazo se aplica dentro del manejador
// que cancela y consulta la reserva guardada; no hay una función de plazo que
// se pueda llamar (hallazgo E-1).
//
// EL RELOJ: la regla depende de "ahora", y el sistema lee el reloj de la
// máquina desde adentro de la regla (hallazgo E-6). Para que estas pruebas no
// cambien de resultado con el paso de los días, el andamiaje congela el
// instante en 2026-08-18 a las 10:00. Todas las fechas de abajo se leen contra
// ese instante.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema } = require('./soporte/servidor.js');

const CLIENTE = { cliente: 'Ana Vargas', telefono: '88112233' };

async function reservarYCancelar(sistema, { fecha, hora }) {
  await sistema.reservar({ cancha: 1, fecha, hora, ...CLIENTE });
  const reserva = sistema.ultimaReserva();
  await sistema.cancelar(reserva.id);
  return sistema.reservas().find((fila) => fila.id === reserva.id).estado;
}

test('una reserva para dentro de dos días se cancela', async () => {
  // Falla si: se rechaza una cancelación pedida con holgura de sobra.
  await conSistema(async (sistema) => {
    // Ahora: 18/08 10:00. Partido: 20/08 09:00 — faltan 47 horas.
    const estado = await reservarYCancelar(sistema, { fecha: '2026-08-20', hora: 9 });
    assert.equal(estado, 'cancelada');
  });
});

test('una reserva a exactamente 24 horas se cancela', async () => {
  // Falla si: el borde de las 24 horas pasa a ser excluyente.
  await conSistema(async (sistema) => {
    // Ahora: 18/08 10:00. Partido: 19/08 10:00 — faltan exactamente 24 horas.
    const estado = await reservarYCancelar(sistema, { fecha: '2026-08-19', hora: 10 });
    assert.equal(estado, 'cancelada');
  });
});

test('una reserva a menos de 24 horas no se cancela', async () => {
  // Falla si: el plazo se mide en días de calendario en lugar de en horas
  // hasta el inicio del partido.
  await conSistema(async (sistema) => {
    // Ahora: 18/08 10:00. Partido: 19/08 08:00 — faltan 22 horas.
    // Es el caso que describió la administradora: el partido es mañana
    // temprano y ya no hay marcha atrás.
    const estado = await reservarYCancelar(sistema, { fecha: '2026-08-19', hora: 8 });
    assert.equal(estado, 'activa');
  });
});

test('una reserva para más tarde el mismo día no se cancela', async () => {
  // Falla si: se permite cancelar un partido del propio día.
  await conSistema(async (sistema) => {
    // Ahora: 18/08 10:00. Partido: 18/08 21:00 — faltan 11 horas.
    const estado = await reservarYCancelar(sistema, { fecha: '2026-08-18', hora: 21 });
    assert.equal(estado, 'activa');
  });
});

test('una reserva de una fecha ya pasada no se cancela', async () => {
  // Falla si: se permite cancelar un partido que ya se jugó.
  await conSistema(async (sistema) => {
    const estado = await reservarYCancelar(sistema, { fecha: '2026-08-10', hora: 19 });
    assert.equal(estado, 'activa');
  });
});

test('una reserva ya cancelada no se cancela de nuevo', async () => {
  // Falla si: cancelar dos veces deja el sistema en un estado distinto o
  // vuelve a operar sobre la reserva.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: '2026-09-10', hora: 19, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    await sistema.cancelar(reserva.id);
    const respuesta = await sistema.cancelar(reserva.id);

    assert.match(respuesta.html, /ya estaba cancelada/i);
    assert.equal(sistema.reservas().find((fila) => fila.id === reserva.id).estado, 'cancelada');
  });
});

test('cancelar una reserva que no existe no afecta a ninguna otra', async () => {
  // Falla si: cancelar un número inexistente toca alguna reserva guardada.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: '2026-09-10', hora: 19, ...CLIENTE });
    const antes = sistema.reservas();

    await sistema.cancelar(99999);

    assert.deepEqual(sistema.reservas(), antes);
  });
});

test('cancelar no borra la reserva ni cambia su precio', async () => {
  // Falla si: cancelar elimina el registro o modifica lo que se cobró.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: '2026-09-10', hora: 19, ...CLIENTE });
    const antes = sistema.ultimaReserva();

    await sistema.cancelar(antes.id);
    const despues = sistema.reservas().find((fila) => fila.id === antes.id);

    assert.equal(sistema.cuantasReservas(), 1);
    assert.equal(despues.precio, antes.precio);
    assert.equal(despues.cliente, antes.cliente);
    assert.equal(despues.estado, 'cancelada');
  });
});
