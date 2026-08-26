// Reservas de ejemplo, con fechas relativas al día en que se corre.
//
//   npm run db:seed                        -> siembra si la tabla está vacía
//   npm run db:seed -- --reiniciar         -> borra las filas y vuelve a sembrar
//   npm run db:seed -- --confirmar-remoto  -> permite tocar una base remota
//
// Por omisión NO borra nada: si la tabla ya tiene reservas, se detiene y lo
// dice. Y sobre una base remota (Turso) no borra ni siquiera con --reiniciar
// salvo que se lo pidan explícitamente con --confirmar-remoto: la base de
// producción no se limpia por accidente ni por un script de CI.

const bd = require('../bd.js');

const RESERVAS_DE_EJEMPLO = [
  { cancha: 1, dias: 0, hora: 9, cliente: 'Marco Jiménez', telefono: '88112233', precio: 15000, estado: 'activa' },
  { cancha: 2, dias: 0, hora: 19, cliente: 'Sofía Araya', telefono: '87654321', precio: 20000, estado: 'activa' },
  { cancha: 1, dias: 0, hora: 20, cliente: 'Los Tigres FC', telefono: '86001122', precio: 20000, estado: 'cancelada' },
  { cancha: 2, dias: 1, hora: 8, cliente: 'Randall Solano', telefono: '83445566', precio: 15000, estado: 'activa' },
  { cancha: 1, dias: 1, hora: 18, cliente: 'Equipo Amigos del Barrio', telefono: '89998877', precio: 18000, estado: 'activa' },
  { cancha: 2, dias: 2, hora: 10, cliente: 'Marco Jiménez', telefono: '88112233', precio: 15000, estado: 'activa' },
  { cancha: 1, dias: -1, hora: 17, cliente: 'Kevin Mora', telefono: '84223344', precio: 15000, estado: 'activa' },
  { cancha: 2, dias: -2, hora: 21, cliente: 'Grupo Fútbol 5 Escazú', telefono: '87001199', precio: 20000, estado: 'cancelada' },
  { cancha: 1, dias: 3, hora: 16, cliente: 'Marco Jiménez', telefono: '88112233', precio: 15000, estado: 'activa' },
  { cancha: 2, dias: 4, hora: 12, cliente: 'Paola Vindas', telefono: '85667788', precio: 15000, estado: 'activa' },
];

function fechaISO(offsetDias) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

async function sembrar({ reiniciar = false, confirmarRemoto = false, silencioso = false } = {}) {
  const decir = silencioso ? () => {} : (linea) => console.log(linea);

  await bd.inicializar();

  const { total } = await bd.consultarUno('SELECT COUNT(*) AS total FROM reservas');

  if (total > 0) {
    if (!reiniciar) {
      throw new Error(
        `La tabla ya tiene ${total} reserva(s). Para reemplazarlas: npm run db:seed -- --reiniciar`
      );
    }
    if (bd.esRemota() && !confirmarRemoto) {
      throw new Error(
        'Negado: --reiniciar sobre una base REMOTA borraría reservas reales. ' +
        'Si de verdad querés hacerlo: npm run db:seed -- --reiniciar --confirmar-remoto'
      );
    }
    // DELETE, no DROP: la tabla y su esquema siguen en pie.
    await bd.ejecutar('DELETE FROM reservas');
    decir(`Se borraron ${total} reserva(s) anterior(es).`);
  }

  for (const r of RESERVAS_DE_EJEMPLO) {
    await bd.ejecutar(
      `INSERT INTO reservas (cancha, fecha, hora, cliente, telefono, precio, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.cancha, fechaISO(r.dias), r.hora, r.cliente, r.telefono, r.precio, r.estado]
    );
  }

  decir(`Sembradas ${RESERVAS_DE_EJEMPLO.length} reservas de ejemplo (${bd.descripcionDeLaBase()}).`);
  return RESERVAS_DE_EJEMPLO.length;
}

if (require.main === module) {
  sembrar({
    reiniciar: process.argv.includes('--reiniciar'),
    confirmarRemoto: process.argv.includes('--confirmar-remoto'),
  })
    .then(() => bd.cerrar())
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { sembrar, RESERVAS_DE_EJEMPLO };
