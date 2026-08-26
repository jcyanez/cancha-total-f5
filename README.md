# Cancha Total F5 — Sistema de reservas

[![CI](https://github.com/jcyanez/cancha-total-f5/actions/workflows/ci.yml/badge.svg)](https://github.com/jcyanez/cancha-total-f5/actions/workflows/ci.yml)
[![Deploy Production](https://github.com/jcyanez/cancha-total-f5/actions/workflows/deploy-production.yml/badge.svg)](https://github.com/jcyanez/cancha-total-f5/actions/workflows/deploy-production.yml)

Sistema de reservas para las dos canchas techadas de fútbol 5 de Cancha Total F5.
Permite ver la disponibilidad del día, registrar reservas y cancelarlas.

Node + Express con las vistas renderizadas en el servidor, y los datos en SQLite: un archivo local
en desarrollo, **Turso** —que es SQLite en la nube— en producción. El mismo driver para las dos, así
que el camino que ejercitan las pruebas es el que corre desplegado.

## La pantalla

La grilla de disponibilidad cuenta por qué la tarifa cambia. A las 17:00 se encienden las luces y
el bloque pasa de ₡15.000 a ₡20.000: por eso las horas con luz van sobre fondo cálido, llevan la
marca de un foco, y una regla ámbar cruza la tabla exactamente donde se aprieta el interruptor.
El precio deja de ser un número que sube sin explicación.

```
  HORA     ESTADO              TARIFA
  16:00    ⊘ Libre            ₡15.000
 ═══════════════════════════════════════  ← se encienden las luces
  17:00 ⚲  ⊗ Ocupado          ₡20.000
  18:00 ⚲  ⊘ Libre            ₡20.000
```

Lo demás que hay que saber para usarlo:

- **Se puede usar desde un teléfono.** Las dos canchas se ven lado a lado cuando hay ancho y se
  apilan cuando no. La lista del día, que tiene siete columnas, scrollea dentro de su propio
  marco: la página nunca se corre de lado.
- **Sigue el tema del sistema operativo**, claro u oscuro. No hay que elegir nada.
- **El color nunca es la única señal.** Cada estado lleva su texto y su icono, así que se
  distingue igual sin percibir el color y igual en una impresión en blanco y negro.
- **Funciona sin internet.** No pide tipografías, iconos ni bibliotecas a ningún servidor: todo
  viaja dentro de la página. Si el local se queda sin red, el sistema se ve igual.

Las capturas de todas las pantallas —claro y oscuro, a 375 px y a pantalla completa— están en
`Week5/capturas/interfaz/` del repositorio del curso:
https://github.com/jcyanez/LEClaudeCode_JuanCa_Cenfotec

## Arrancar

```
npm ci          # o npm install
npm run datos   # crea reservas.db con 10 reservas de ejemplo
npm start
```

El servidor queda escuchando en http://localhost:3000

`npm run datos` **borra `reservas.db` si existe** y la recrea desde cero, con fechas relativas al
día en que se corre. `reservas.db` no está en el repositorio: sin correr ese comando, el sistema
arranca igual, con cero reservas.

## Verificar

```
./verificar.sh
```

Un solo comando: corre las mismas etapas que el CI, en el mismo orden, y devuelve un código de
salida. La idea es que un turno que cierra en verde no descubra en el pipeline algo que se podía
ver acá.

| Etapa | Qué revisa |
|---|---|
| Lint | ESLint 9, reglas de defecto (no de estilo) |
| Pruebas | las 87 pruebas de `node:test` |
| Build | que el artefacto desplegable sea coherente (ver más abajo) |
| Humo | que el sistema arranque, responda y llegue a su base |

| Código | Qué significa |
|---|---|
| **0** | Todo pasa. Se puede cerrar el turno. |
| **2** | Algo falló, o faltan las dependencias. |

Ese código es el que usa el hook `Stop` de [.claude/settings.json](.claude/settings.json) para
impedir que un turno del agente cierre con la verificación en rojo.

Para correr una prueba suelta, o un archivo, se usa el corredor de Node directamente:

```
node --test pruebas/tarifas.test.js
node --test --test-name-pattern "17:00" "pruebas/*.test.js"
```

Las pruebas no dependen del reloj, ni de la red, ni del orden, ni unas de otras: cada una levanta
el sistema en un puerto libre, sobre una base de datos propia que desecha al terminar, y con el
reloj puesto en un instante fijo. Correrlas **no toca** `reservas.db`.

## Configuración

Sin variables de entorno el sistema arranca como siempre, contra el archivo local. Existen para
poder levantarlo en otro puerto, contra otra base o con el reloj fijo, sin tocar el código:

| Variable | Por omisión | Para qué |
|---|---|---|
| `TURSO_DATABASE_URL` | — | Dirección de la base en Turso. Si está, el sistema habla con Turso. |
| `TURSO_AUTH_TOKEN` | — | Credencial de Turso. Va junto con la anterior; una sin la otra falla al arrancar y lo dice. |
| `CANCHA_PUERTO` | `3000` | Puerto. Con `0` pide uno libre al sistema operativo. |
| `CANCHA_BD` | `reservas.db` | Ruta del archivo de la base de datos. |
| `CANCHA_AHORA` | el reloj real | Fija el instante que el sistema considera «ahora». |

Los nombres están en [.env.example](.env.example), sin valores. Para trabajar en local se copia a
`.env` y se llena; `npm start` y los scripts de base de datos lo leen solos, con
`--env-file-if-exists` de Node. `.env` está en `.gitignore` y no se sube nunca.

**El orden de precedencia de la base importa:** `CANCHA_BD` gana sobre `TURSO_DATABASE_URL`. Quien
nombra un archivo concreto está pidiendo ese archivo, y quien lo hace siempre es el arnés de
pruebas. Si Turso ganara, bastaría con tener `TURSO_DATABASE_URL` exportada en la terminal para que
`npm test` escribiera —y borrara— en la base de producción.

## Base de datos

El esquema vive en archivos `.sql` versionados, no en el código:

```
database/
  migrations/
    001-crear-tabla-reservas.sql
    002-indices-de-consulta.sql
  migrar.js
  sembrar.js
```

```
npm run db:migrate    # aplica lo que falte, contra la base que digan las variables
npm run db:seed       # reservas de ejemplo
```

Las migraciones son **idempotentes y no destructivas**: todas usan `IF NOT EXISTS` y ninguna lleva
`DROP`. Correr `db:migrate` sobre la base de producción no toca un dato, y por eso el pipeline lo
hace en cada despliegue. El servidor también las corre al arrancar, así que una base vacía queda
usable sin pasos previos.

La siembra es deliberadamente arisca: por omisión **no borra nada** —si la tabla tiene filas, se
detiene y lo dice—, hace falta `--reiniciar` para reemplazarlas, y sobre una base remota hace falta
además `--confirmar-remoto`.

`npm run datos` sigue siendo el atajo de desarrollo de siempre: borra el archivo local y lo recrea
sembrado. Se niega a correr si las variables apuntan a una base remota.

## CI/CD

```text
Desarrollador → Git → GitHub → GitHub Actions → CI → Vercel → Turso
                                                │
                                          ¿CI falló?
                                                │
                                          NO HAY DESPLIEGUE
```

Tres workflows en [.github/workflows/](.github/workflows/):

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `ci.yml` | push a una rama · pull request | install → lint → typecheck (N/A) → pruebas → build → humo |
| `deploy-preview.yml` | pull request | CI, y si pasa, un preview en Vercel con su propia URL |
| `deploy-production.yml` | push a `main` | CI → migrar Turso → `vercel deploy --prod` → verificar `/api/health` |

El CI está escrito **una sola vez**: los dos workflows de despliegue lo invocan con
`uses: ./.github/workflows/ci.yml`. Así no puede pasar que la puerta del preview y la de producción
revisen cosas distintas.

La regla del despliegue está en el grafo de dependencias, no en un comentario: un job con
`needs: ci` no arranca si el CI falló. Y el despliegue lo dispara el pipeline en vez del auto-deploy
de Vercel justamente por eso — el auto-deploy publica antes de saber si las pruebas pasaron.

El CI corre contra un archivo temporal del runner y **no recibe los secretos de Turso**: no tiene
con qué tocar la base de producción.

**Todo el detalle está en [docs/CI-CD.md](docs/CI-CD.md)**: qué es CI, qué es CD y cuál se usa acá,
el vocabulario de GitHub Actions, la explicación de cada YAML, la diferencia entre GitHub Secrets y
las variables de entorno de Vercel, y la lista de evidencias para la entrega.

### Comprobar el despliegue

```
curl https://<proyecto>.vercel.app/api/health
```

```json
{ "status": "ok", "database": "connected", "driver": "libsql", "backend": "turso", "reservas": 10 }
```

Hace una lectura real contra la base. No devuelve la URL de la base ni el token, y la prueba de
humo verifica activamente que no los filtre.

```
node herramientas/humo.js https://<proyecto>.vercel.app
```

Interroga una aplicación ya desplegada: la salud, las pantallas, la cotización. Contra una URL
remota solo hace lecturas, y exige que el backend reportado sea `turso` — una app serverless
sirviendo desde un archivo estaría perdiendo cada reserva.

## Los documentos

El sistema se recibió sin un solo documento. Estos se escribieron reconstruyéndolo:

- **[ESPECIFICACION.md](ESPECIFICACION.md)** — qué debe hacer el sistema. Cada afirmación con su
  fuente declarada: la administradora, el comportamiento del sistema recibido, o una decisión
  explícita del cliente. **Es la fuente de verdad**: las pruebas responden a este documento, nunca
  al código.
- **[HALLAZGOS.md](HALLAZGOS.md)** — todo lo que la suite descubrió al contrastar el sistema contra
  la especificación, con la prueba que delata cada cosa y la evidencia de cierre.
- **[STATUS.md](STATUS.md)** — el estado del trabajo.
- **[docs/CI-CD.md](docs/CI-CD.md)** — el pipeline de integración y despliegue continuo, explicado
  de cero. Posterior a la entrega del caso.

## Cómo está armado

```
server.js         el sistema: rutas, reglas del negocio y vistas
bd.js             acceso a datos: el único archivo que sabe con qué base habla
datos.js          atajo de desarrollo: rehace la base local sembrada
verificar.sh      la puerta de calidad
api/index.js      punto de entrada serverless de Vercel
vercel.json       manda todas las rutas a esa función única
database/         el esquema versionado y la siembra
herramientas/
  construir.js    verificación del artefacto desplegable
  humo.js         interroga la app —local o desplegada— y su base
pruebas/          la suite
  soporte/        lo que las pruebas usan para hablar con el sistema
docs/CI-CD.md     el pipeline explicado
.github/workflows/  CI y despliegue
```

El esquema **no** está en el código: vive en `database/migrations/*.sql`. Estuvo escrito dos veces
—en `server.js` y en `datos.js`— y eso fue el hallazgo E-9 del caso práctico; después pasó a un
`esquema.js` compartido, y con la llegada de las migraciones quedó donde corresponde, en SQL
versionado.

No hay build de compilación, ni bundler, ni carpeta de archivos estáticos: el HTML se arma en el
servidor y la
hoja de estilo viaja dentro de él, en la constante `ESTILOS` de `server.js`. Lo que sí verifica
`npm run verificar-artefacto` es que el artefacto desplegable sea coherente: que todo parsee, que la entrada
serverless cargue, y que **ningún archivo de tiempo de ejecución dependa de una `devDependency`**.
Esto último es lo que justifica el script: `better-sqlite3` es un módulo nativo que quedó como
dependencia de desarrollo —lo usa el arnés de pruebas, no el sistema—, y si alguien vuelve a
requerirlo desde `server.js` o `bd.js`, en local funciona y en producción el despliegue arranca
roto.

La hoja de estilo está organizada en
dos pisos: **primero los tokens** —un nombre por cada decisión de color, espacio, tipografía y
forma, declarados una sola vez en `:root`— y después las reglas, que solo consumen tokens.
Ningún color literal aparece fuera de ese bloque, y el tema oscuro se limita a redefinir los
mismos nombres. Para cambiar el verde de la marca en todo el sistema se toca una línea.

Los cuatro iconos —`check-circle`, `x-circle`, `warning` y `lightbulb`, del vocabulario de
Phosphor— van dibujados como `data:` URI y se pintan con `mask`, así que heredan el color del
texto: una sola definición sirve para todos los estados y ninguno se pide a un servidor externo.

### Una advertencia para quien toque las vistas

Quince pruebas leen el HTML con expresiones regulares que exigen etiquetas pegadas. En concreto:

| No tocar | Por qué |
|---|---|
| `<td>8:00</td><td …>Libre</td>` | El estado tiene que ser texto directo del `<td>`, sin nada anidado adentro. |
| `<td>₡15.000</td>` | La celda de la tarifa no admite atributos. |
| `<li>texto</li>` | Cualquier etiqueta dentro del `<li>` deja el conteo de errores en cero. |
| `<h2>` | Sin atributos: dos pruebas parten el HTML por esa cadena literal. |
| `<option value="8">` | Sin atributos extra. |
| `<select name="hora"` | `name` va primero; poner `id` antes rompe el regex. |

Por eso las píldoras, los iconos y la regla de la luz están hechos **con CSS sobre el markup que
ya existía**, y no envolviendo texto en etiquetas nuevas. Si algo hace falta cambiar ahí, el
camino es hablarlo antes: aflojar un helper de pruebas es una decisión, no un descuido.
