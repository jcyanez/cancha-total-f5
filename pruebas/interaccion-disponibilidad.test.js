// Grilla accionable — la disponibilidad deja de ser un cartel y pasa a ser un
// tablero desde el que se opera.
//
// NIVEL: integración. Razón: lo que se afirma es lo que la administradora
// puede hacer desde la pantalla que abre —a dónde la lleva cada casilla de la
// grilla—, y eso solo existe cuando la grilla se pinta contra las reservas
// guardadas. No hay una función de «acción del bloque» que se pueda llamar
// suelta: la fila se arma dentro del recorrido de la pantalla.
//
// Estas pruebas afirman el destino de cada acción y su nombre accesible, no la
// maqueta. Cambiar el texto visible del enlace, su color o el orden de las
// columnas no las rompe; dejar un bloque sin acción, mandarlo a la otra cancha
// o borrarle el nombre accesible, sí.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema } = require('./soporte/servidor.js');

const CLIENTE = { cliente: 'Ana Vargas', telefono: '88112233' };
const FECHA = '2026-09-10';
const BLOQUES = Array.from({ length: 14 }, (_, i) => 8 + i);

// La tabla de disponibilidad de una cancha. En la portada hay dos, cada una
// debajo de su subtítulo; en la pantalla de una sola cancha hay una sola y el
// subtítulo no existe.
function grillaDeCancha(html, cancha) {
  const desdeElSubtitulo = html.indexOf(`<h3>Cancha ${cancha}</h3>`);
  const trozo = desdeElSubtitulo === -1 ? html : html.slice(desdeElSubtitulo);
  const inicio = trozo.indexOf('<table');
  const fin = trozo.indexOf('</table>');
  return inicio === -1 || fin === -1 ? '' : trozo.slice(inicio, fin);
}

// La acción que ofrece el bloque de una hora: a dónde lleva, qué dice y con
// qué nombre lo anuncia a quien no ve la tabla.
function accionDelBloque(grilla, hora) {
  const fila = grilla.match(new RegExp(`<tr[^>]*><td>${hora}:00</td>([\\s\\S]*?)</tr>`));
  if (!fila) return null;
  const enlace = fila[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/);
  if (!enlace) return null;
  const atributo = (nombre) => {
    const encontrado = enlace[1].match(new RegExp(`${nombre}="([^"]*)"`));
    return encontrado ? encontrado[1] : null;
  };
  return {
    destino: atributo('href'),
    texto: enlace[2],
    etiqueta: atributo('aria-label'),
  };
}

// El nombre con que el control se anuncia: la etiqueta accesible si la lleva,
// y si no, lo que se lee dentro del enlace.
function nombreAccesible(accion) {
  return accion.etiqueta === null ? accion.texto : accion.etiqueta;
}

// La dirección a la que lleva una acción, ya desarmada en ruta y parámetros.
function destinoDe(accion) {
  return new URL(accion.destino.replace(/&amp;/g, '&'), 'http://cancha-total.prueba');
}

test('cada bloque de la portada ofrece una acción', async () => {
  // Falla si: alguna casilla de la grilla queda sin nada que hacer con ella.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 10, ...CLIENTE });
    await sistema.reservar({ cancha: 2, fecha: FECHA, hora: 20, ...CLIENTE });
    const portada = await sistema.inicio(FECHA);

    for (const cancha of [1, 2]) {
      const grilla = grillaDeCancha(portada, cancha);
      for (const hora of BLOQUES) {
        const accion = accionDelBloque(grilla, hora);
        assert.ok(accion, `la cancha ${cancha} no ofrece acción a las ${hora}:00`);
        assert.ok(accion.destino, `la acción de las ${hora}:00 no lleva a ninguna parte`);
      }
    }
  });
});

test('cada bloque de la pantalla por cancha ofrece una acción', async () => {
  // Falla si: la pantalla de una sola cancha se queda sin la columna de acción
  // que sí tiene la portada.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 2, fecha: FECHA, hora: 14, ...CLIENTE });

    for (const cancha of [1, 2]) {
      const grilla = grillaDeCancha(await sistema.disponibilidad(cancha, FECHA), cancha);
      for (const hora of BLOQUES) {
        const accion = accionDelBloque(grilla, hora);
        assert.ok(accion, `la cancha ${cancha} no ofrece acción a las ${hora}:00`);
        assert.ok(accion.destino, `la acción de las ${hora}:00 no lleva a ninguna parte`);
      }
    }
  });
});

test('un bloque libre lleva a reservar ese mismo bloque', async () => {
  // Falla si: el enlace de un bloque libre pierde la cancha, la fecha o la
  // hora, y quien hace clic tiene que volver a elegirlas a mano.
  await conSistema(async (sistema) => {
    const grilla = grillaDeCancha(await sistema.inicio(FECHA), 1);
    const destino = destinoDe(accionDelBloque(grilla, 9));

    assert.equal(destino.pathname, '/reservar');
    assert.equal(destino.searchParams.get('cancha'), '1');
    assert.equal(destino.searchParams.get('fecha'), FECHA);
    assert.equal(destino.searchParams.get('hora'), '9');
  });
});

test('un bloque ocupado lleva a la reserva que lo ocupa', async () => {
  // Falla si: la ocupación de la grilla deja de identificar cuál es la reserva
  // que la produjo.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 16, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const grilla = grillaDeCancha(await sistema.inicio(FECHA), 1);
    assert.equal(destinoDe(accionDelBloque(grilla, 16)).pathname, `/reserva/${reserva.id}`);
  });
});

test('la pantalla por cancha también lleva a la reserva que ocupa el bloque', async () => {
  // Falla si: la columna de acción se agrega solo en la portada y la pantalla
  // por cancha queda mandando a otra parte.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 2, fecha: FECHA, hora: 11, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const grilla = grillaDeCancha(await sistema.disponibilidad(2, FECHA), 2);
    assert.equal(destinoDe(accionDelBloque(grilla, 11)).pathname, `/reserva/${reserva.id}`);
  });
});

test('cancelada la reserva, el bloque vuelve a ofrecer reservar', async () => {
  // Falla si: el bloque de una reserva anulada sigue apuntando a esa reserva y
  // no se puede volver a vender desde la grilla.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 12, ...CLIENTE });
    const reserva = sistema.ultimaReserva();
    await sistema.cancelar(reserva.id);

    const destino = destinoDe(accionDelBloque(grillaDeCancha(await sistema.inicio(FECHA), 1), 12));
    assert.equal(destino.pathname, '/reservar');
    assert.equal(destino.searchParams.get('cancha'), '1');
    assert.equal(destino.searchParams.get('hora'), '12');
  });
});

test('la acción de un bloque de la cancha 1 no apunta a la cancha 2', async () => {
  // Falla si: las dos grillas de la portada se pintan con la misma cancha y un
  // clic en la cancha 1 termina reservando —o abriendo— algo de la cancha 2.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 2, fecha: FECHA, hora: 15, ...CLIENTE });
    const deLaDos = sistema.ultimaReserva();
    const portada = await sistema.inicio(FECHA);

    // El mismo bloque horario: ocupado en la cancha 2, libre en la cancha 1.
    const enLaUno = destinoDe(accionDelBloque(grillaDeCancha(portada, 1), 15));
    assert.equal(enLaUno.pathname, '/reservar');
    assert.equal(enLaUno.searchParams.get('cancha'), '1');

    const enLaDos = destinoDe(accionDelBloque(grillaDeCancha(portada, 2), 15));
    assert.equal(enLaDos.pathname, `/reserva/${deLaDos.id}`);

    // Y todos los bloques libres de la cancha 2 se reservan como cancha 2.
    const grillaDos = grillaDeCancha(portada, 2);
    for (const hora of BLOQUES.filter((h) => h !== 15)) {
      assert.equal(destinoDe(accionDelBloque(grillaDos, hora)).searchParams.get('cancha'), '2');
    }
  });
});

test('cada acción se anuncia con su cancha y su hora', async () => {
  // Falla si: los catorce controles de una grilla se anuncian con el mismo
  // nombre y quien navega con lector de pantalla no puede saber cuál es cuál.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 18, ...CLIENTE });
    const grilla = grillaDeCancha(await sistema.inicio(FECHA), 1);

    const nombres = BLOQUES.map((hora) => nombreAccesible(accionDelBloque(grilla, hora)));
    assert.equal(new Set(nombres).size, BLOQUES.length, 'hay acciones que se anuncian igual');

    BLOQUES.forEach((hora, indice) => {
      assert.ok(nombres[indice].includes('Cancha 1'), `la acción de las ${hora}:00 no dice de qué cancha es`);
      assert.ok(nombres[indice].includes(`${hora}:00`), `la acción de las ${hora}:00 no dice de qué hora es`);
    });
  });
});

test('la pantalla por cancha sigue sin mencionar plata', async () => {
  // Falla si: la columna de acción mete la tarifa en la pantalla de una sola
  // cancha, que informa ocupación y no precios.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 19, ...CLIENTE });
    const pantalla = await sistema.disponibilidad(1, FECHA);

    assert.doesNotMatch(grillaDeCancha(pantalla, 1), /₡/);
    assert.doesNotMatch(pantalla.split('<h2>')[1] || '', /₡/);
  });
});
