// Ocupación de un bloque — RN-6 a RN-10, PANT-2 de ESPECIFICACION.md
//
// NIVEL: integración. Razón: son recorridos del negocio de punta a punta —
// vender un bloque, chocar contra uno vendido, liberarlo al cancelar—. El
// efecto observable es qué quedó guardado y qué muestra la disponibilidad.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema, estadoDelBloque } = require('./soporte/servidor.js');

const BLOQUE = { fecha: '2026-09-10', hora: 19 };

test('un bloque con reserva activa no se vuelve a vender', async () => {
  // Falla si: dos reservas activas pueden coincidir en cancha, fecha y hora.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, ...BLOQUE, cliente: 'Ana Vargas', telefono: '88112233' });
    await sistema.reservar({ cancha: 1, ...BLOQUE, cliente: 'Kevin Mora', telefono: '84223344' });

    assert.equal(sistema.cuantasReservas(), 1);
    assert.equal(sistema.ultimaReserva().cliente, 'Ana Vargas');
  });
});

test('el mismo bloque horario se vende en la otra cancha', async () => {
  // Falla si: la ocupación deja de distinguir entre las dos canchas.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, ...BLOQUE, cliente: 'Ana Vargas', telefono: '88112233' });
    await sistema.reservar({ cancha: 2, ...BLOQUE, cliente: 'Kevin Mora', telefono: '84223344' });

    assert.equal(sistema.cuantasReservas(), 2);
  });
});

test('el mismo bloque se vende en otra fecha', async () => {
  // Falla si: la ocupación deja de distinguir entre fechas.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, ...BLOQUE, cliente: 'Ana Vargas', telefono: '88112233' });
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-11', hora: 19, cliente: 'Kevin Mora', telefono: '84223344',
    });

    assert.equal(sistema.cuantasReservas(), 2);
  });
});

test('cancelada la reserva, su bloque se vuelve a vender', async () => {
  // Falla si: un bloque liberado sigue contando como ocupado.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, ...BLOQUE, cliente: 'Ana Vargas', telefono: '88112233' });
    await sistema.cancelar(sistema.ultimaReserva().id);

    await sistema.reservar({ cancha: 1, ...BLOQUE, cliente: 'Kevin Mora', telefono: '84223344' });

    const activas = sistema.reservas().filter((fila) => fila.estado === 'activa');
    assert.equal(activas.length, 1);
    assert.equal(activas[0].cliente, 'Kevin Mora');
  });
});

test('el bloque de una reserva cancelada aparece libre en la disponibilidad', async () => {
  // Falla si: la disponibilidad deja de mirar el estado de la reserva.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, ...BLOQUE, cliente: 'Ana Vargas', telefono: '88112233' });
    assert.equal(estadoDelBloque(await sistema.disponibilidad(1, BLOQUE.fecha), 19), 'Ocupado');

    await sistema.cancelar(sistema.ultimaReserva().id);
    assert.equal(estadoDelBloque(await sistema.disponibilidad(1, BLOQUE.fecha), 19), 'Libre');
  });
});

test('la disponibilidad de una cancha no refleja lo vendido en la otra', async () => {
  // Falla si: la disponibilidad mezcla las reservas de las dos canchas.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, ...BLOQUE, cliente: 'Ana Vargas', telefono: '88112233' });

    assert.equal(estadoDelBloque(await sistema.disponibilidad(1, BLOQUE.fecha), 19), 'Ocupado');
    assert.equal(estadoDelBloque(await sistema.disponibilidad(2, BLOQUE.fecha), 19), 'Libre');
  });
});

test('un mismo cliente puede tener varias reservas el mismo día', async () => {
  // Falla si: se introduce un tope de reservas por cliente y por día.
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 10, cliente: 'Ana Vargas', telefono: '88112233',
    });
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 11, cliente: 'Ana Vargas', telefono: '88112233',
    });

    assert.equal(sistema.cuantasReservas(), 2);
  });
});

test('se puede registrar una reserva para una fecha ya pasada', async () => {
  // Falla si: se agrega una validación que exija fecha futura. Es comportamiento
  // del sistema entregado, no una regla que la administradora haya pedido.
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 1, fecha: '2020-01-15', hora: 10, cliente: 'Ana Vargas', telefono: '88112233',
    });
    assert.equal(sistema.cuantasReservas(), 1);
  });
});
