// Qué se vende y cuándo — RN-1, RN-2, RN-5, FUERA-8, FUERA-9 de ESPECIFICACION.md
//
// NIVEL: integración. Razón: son recorridos de venta completos. Además, estas
// pruebas fijan por escrito dos decisiones que el código insinúa lo contrario:
// que no hay feriados y que no hay temporada alta (hallazgo E-8). Si alguien
// reactivara ese código apagado, estas pruebas se caerían.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema } = require('./soporte/servidor.js');

const CLIENTE = { cliente: 'Ana Vargas', telefono: '88112233' };

test('una reserva ocupa su bloque y no el siguiente', async () => {
  // Falla si: una reserva pasa a tomar más de una hora.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: '2026-09-10', hora: 19, ...CLIENTE });
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 20, cliente: 'Kevin Mora', telefono: '84223344',
    });

    assert.equal(sistema.cuantasReservas(), 2);
  });
});

test('se alquila el 25 de diciembre como cualquier otro día', async () => {
  // Falla si: se reactiva el bloqueo por feriados (FUERA-8).
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: '2026-12-25', hora: 10, ...CLIENTE });
    assert.equal(sistema.cuantasReservas(), 1);
  });
});

test('se alquila el 1 de enero como cualquier otro día', async () => {
  // Falla si: se reactiva el bloqueo por feriados (FUERA-8).
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: '2027-01-01', hora: 10, ...CLIENTE });
    assert.equal(sistema.cuantasReservas(), 1);
  });
});

test('en diciembre la tarifa diurna es la misma que en cualquier mes', async () => {
  // Falla si: se reactivan las tarifas de temporada alta (FUERA-9).
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: '2026-12-15', hora: 10, ...CLIENTE });
    assert.equal(sistema.ultimaReserva().precio, 15000);
  });
});

test('en enero la tarifa con luz es la misma que en cualquier mes', async () => {
  // Falla si: se reactivan las tarifas de temporada alta (FUERA-9).
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: '2027-01-15', hora: 19, ...CLIENTE });
    assert.equal(sistema.ultimaReserva().precio, 20000);
  });
});

test('las dos canchas cobran lo mismo por el mismo bloque', async () => {
  // Falla si: alguna cancha pasa a tener tarifa propia.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: '2026-09-10', hora: 19, ...CLIENTE });
    const enCancha1 = sistema.ultimaReserva().precio;

    await sistema.reservar({
      cancha: 2, fecha: '2026-09-10', hora: 19, cliente: 'Kevin Mora', telefono: '84223344',
    });
    const enCancha2 = sistema.ultimaReserva().precio;

    assert.equal(enCancha1, enCancha2);
  });
});
