// Pantallas — PANT-1 a PANT-15 de ESPECIFICACION.md
//
// NIVEL: integración. Razón: son recorridos de consulta completos; lo que se
// comprueba es lo que la administradora ve al abrir la pantalla.
//
// Estas pruebas afirman lo mínimo que hace falta para que la pantalla sirva
// —qué datos aparecen, en qué orden, qué pasa cuando no hay nada— y no cómo
// está maquetada. Cambiar colores, encabezados o el orden de las columnas no
// las rompe; quitar un dato o desordenar la lista, sí.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema, HOY, clientesEnOrden, estadoDelBloque } = require('./soporte/servidor.js');

test('la lista del día va ordenada por cancha y luego por hora', async () => {
  // Falla si: cambia el orden en que se listan las reservas de un día.
  await conSistema(async (sistema) => {
    const fecha = '2026-09-10';
    await sistema.reservar({ cancha: 2, fecha, hora: 20, cliente: 'Cuarta', telefono: '88000004' });
    await sistema.reservar({ cancha: 1, fecha, hora: 19, cliente: 'Segunda', telefono: '88000002' });
    await sistema.reservar({ cancha: 2, fecha, hora: 9, cliente: 'Tercera', telefono: '88000003' });
    await sistema.reservar({ cancha: 1, fecha, hora: 8, cliente: 'Primera', telefono: '88000001' });

    assert.deepEqual(
      clientesEnOrden(await sistema.listaDelDia(fecha)),
      ['Primera', 'Segunda', 'Tercera', 'Cuarta']
    );
  });
});

test('la lista del día muestra el precio que se cobró en cada reserva', async () => {
  // Falla si: la lista deja de mostrar lo cobrado.
  await conSistema(async (sistema) => {
    const fecha = '2026-09-10';
    await sistema.reservar({ cancha: 1, fecha, hora: 19, cliente: 'Ana Vargas', telefono: '88112233' });

    const pantalla = await sistema.listaDelDia(fecha);
    assert.match(pantalla, /Ana Vargas/);
    assert.match(pantalla, /₡20\.000/);
  });
});

test('un día sin reservas avisa que no hay ninguna', async () => {
  // Falla si: un día vacío devuelve una tabla vacía sin explicación.
  await conSistema(async (sistema) => {
    const pantalla = await sistema.listaDelDia('2026-12-25');
    assert.match(pantalla, /No hay reservas/i);
  });
});

test('la lista del día distingue las canceladas de las activas', async () => {
  // Falla si: una reserva cancelada se muestra igual que una activa.
  await conSistema(async (sistema) => {
    const fecha = '2026-09-10';
    await sistema.reservar({ cancha: 1, fecha, hora: 19, cliente: 'Ana Vargas', telefono: '88112233' });
    await sistema.cancelar(sistema.ultimaReserva().id);

    assert.match(await sistema.listaDelDia(fecha), /cancelada/i);
  });
});

test('sin indicar fecha, la disponibilidad muestra el día de hoy', async () => {
  // Falla si: la pantalla deja de tomar el día de hoy por defecto.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: HOY, hora: 12, cliente: 'Ana Vargas', telefono: '88112233' });

    assert.equal(estadoDelBloque(await sistema.disponibilidad(1), 12), 'Ocupado');
    assert.match(await sistema.inicio(), new RegExp(HOY));
  });
});

test('la disponibilidad muestra los catorce bloques del día', async () => {
  // Falla si: cambia el rango de bloques que se ofrece.
  await conSistema(async (sistema) => {
    const pantalla = await sistema.disponibilidad(1, '2026-09-10');

    for (let hora = 8; hora <= 21; hora += 1) {
      assert.ok(estadoDelBloque(pantalla, hora), `falta el bloque de las ${hora}:00`);
    }
    assert.equal(estadoDelBloque(pantalla, 7), null);
    assert.equal(estadoDelBloque(pantalla, 22), null);
  });
});

test('la pantalla de una cancha muestra el estado sin la tarifa', async () => {
  // Falla si: la pantalla por cancha empieza o deja de mostrar precios.
  await conSistema(async (sistema) => {
    const porCancha = await sistema.disponibilidad(1, '2026-09-10');
    assert.ok(estadoDelBloque(porCancha, 10), 'debe mostrar el estado de cada bloque');
    assert.doesNotMatch(porCancha.split('<h2>')[1] || '', /₡/);
  });
});

test('el formulario ofrece exactamente los catorce bloques del día', async () => {
  // Falla si: el formulario ofrece horas fuera del rango que se vende.
  await conSistema(async (sistema) => {
    const pantalla = await sistema.inicio('2026-09-10');
    const seleccionDeHora = pantalla.match(/<select name="hora"[^>]*>([\s\S]*?)<\/select>/)[1];
    const opciones = seleccionDeHora.match(/<option value="(\d+)">/g)
      .map((opcion) => Number(opcion.match(/\d+/)[0]));

    assert.deepEqual(opciones, [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  });
});

test('la confirmación identifica la reserva con su número y sus datos', async () => {
  // Falla si: el cliente no puede saber con qué número quedó su reserva.
  await conSistema(async (sistema) => {
    const respuesta = await sistema.reservar({
      cancha: 2, fecha: '2026-09-10', hora: 19, cliente: 'Sofía Araya', telefono: '87654321',
    });
    const numero = sistema.ultimaReserva().id;

    assert.match(respuesta.html, new RegExp(`#${numero}`));
    assert.match(respuesta.html, /Sofía Araya/);
    assert.match(respuesta.html, /2026-09-10/);
    assert.match(respuesta.html, /19:00/);
    assert.match(respuesta.html, /Cancha 2/i);
  });
});

test('la confirmación avisa cuando se aplicó el descuento de cliente frecuente', async () => {
  // Falla si: el cliente deja de enterarse de por qué pagó menos.
  await conSistema(async (sistema) => {
    for (const dia of ['01', '02', '03']) {
      await sistema.reservar({
        cancha: 1, fecha: `2026-09-${dia}`, hora: 10, cliente: 'Marco Jiménez', telefono: '88112233',
      });
    }
    const respuesta = await sistema.reservar({
      cancha: 1, fecha: '2026-09-04', hora: 10, cliente: 'Marco Jiménez', telefono: '88112233',
    });

    assert.match(respuesta.html, /descuento/i);
  });
});

test('la confirmación de una reserva sin descuento no habla de descuento', async () => {
  // Falla si: se anuncia un descuento que no se aplicó.
  await conSistema(async (sistema) => {
    const respuesta = await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 10, cliente: 'Ana Vargas', telefono: '88112233',
    });

    assert.doesNotMatch(respuesta.html, /descuento/i);
  });
});

test('el precio estimado del formulario muestra la tarifa del bloque, sin descuento', async () => {
  // Falla si: la cotización previa empieza a depender de quién consulta.
  await conSistema(async (sistema) => {
    for (const dia of ['01', '02', '03']) {
      await sistema.reservar({
        cancha: 1, fecha: `2026-09-${dia}`, hora: 10, cliente: 'Marco Jiménez', telefono: '88112233',
      });
    }

    assert.equal((await sistema.cotizar(10)).precio, 15000);
  });
});

test('si el bloque ya está vendido se informa cuál es', async () => {
  // Falla si: el aviso de bloque ocupado deja de decir cancha, fecha y hora.
  await conSistema(async (sistema) => {
    const bloque = { cancha: 2, fecha: '2026-09-10', hora: 19 };
    await sistema.reservar({ ...bloque, cliente: 'Ana Vargas', telefono: '88112233' });
    const respuesta = await sistema.reservar({ ...bloque, cliente: 'Kevin Mora', telefono: '84223344' });

    assert.match(respuesta.html, /ocupado/i);
    assert.match(respuesta.html, /cancha 2/i);
    assert.match(respuesta.html, /2026-09-10/);
    assert.match(respuesta.html, /19:00/);
  });
});
