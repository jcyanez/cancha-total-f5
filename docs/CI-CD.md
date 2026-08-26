# Integración y Entrega Continua — Cancha Total F5

Este documento explica el pipeline que se le puso al sistema de reservas: qué hace cada pieza, por
qué está donde está, y qué se puede demostrar con él. Está escrito para ser leído de arriba a
abajo por alguien que no conoce el proyecto.

El sistema en cuestión es un monolito de Node + Express con vistas renderizadas en el servidor y
una sola tabla en SQLite. No es un caso de laboratorio: es código heredado, sin documentación, con
una suite de 87 pruebas que se le construyó encima. Lo que sigue es lo que hizo falta para que ese
código llegue a producción por un camino automático y verificable.

---

## 1. Qué es Integración Continua (CI)

**Integrar** es juntar el trabajo de uno con el de los demás. Sin automatización, integrar es un
evento: se junta todo cada tanto, y cada vez duele más porque hay más cambios acumulados y nadie
sabe cuál rompió qué.

**Integración Continua** es integrar seguido —varias veces al día— y que cada integración sea
verificada por una máquina, siempre igual, sin que nadie tenga que acordarse de correr nada.

La idea central no es "tener un servidor que corre pruebas". Es esta:

> Después de cada cambio, hay una respuesta automática y objetiva a la pregunta
> «¿el proyecto sigue estando bien?».

Tres cosas la hacen posible, y las tres están en este repositorio:

| Requisito | Cómo se cumple acá |
|---|---|
| Una definición de "está bien" que no dependa de quién juzga | `verificar.sh` local y `ci.yml` remoto, con las mismas etapas |
| Que correrla sea barato y automático | GitHub Actions, en cada `push` y cada `pull_request` |
| Que un fallo sea visible e imposible de ignorar | El job queda rojo y el despliegue no arranca |

Lo que este CI verifica, en orden:

```text
Install    npm ci contra el lockfile — instala exactamente lo declarado
Lint       ESLint 9, reglas de defecto (no de estilo)
Typecheck  N/A — el proyecto es JavaScript sin tipos (ver §5)
Tests      87 pruebas de node:test
Build      parseo, fugas a devDependencies, carga de la entrada serverless
Humo       la app arranca, responde y llega de verdad a su base de datos
```

Un detalle que suele pasarse por alto: **el CI corre contra un archivo SQLite temporal del
runner, nunca contra Turso.** Los secretos de Turso no se le pasan a `ci.yml`. No es una
recomendación que alguien deba recordar: el workflow no los recibe, así que no tiene con qué
tocar la base de producción.

---

## 2. Qué es Entrega / Despliegue Continuo (CD)

Las dos siglas son "CD" y se confunden todo el tiempo. La diferencia es una sola:

**Continuous Delivery (Entrega Continua)** — cada cambio que pasa el CI queda *listo para
desplegar*, empaquetado y verificado. El paso a producción existe pero lo autoriza una persona.

**Continuous Deployment (Despliegue Continuo)** — cada cambio que pasa el CI *se despliega solo*.
No hay botón.

```text
Continuous Delivery                Continuous Deployment
    commit                              commit
      ↓                                   ↓
     CI ✅                                CI ✅
      ↓                                   ↓
   artefacto listo                    producción
      ↓
   [una persona aprueba]
      ↓
   producción
```

### Cuál usamos acá

**Continuous Deployment** para producción: un push a `main` que pasa el CI se despliega solo, sin
intervención. Es lo que pide el caso y es lo que hace `deploy-production.yml`.

Con un matiz que vale explicar en la defensa: el job de despliegue declara
`environment: production`. Hoy ese *environment* de GitHub no tiene reglas de protección, así que
el despliegue es automático — Deployment puro. Si en Settings → Environments se le agregara un
*required reviewer*, el mismo pipeline, sin cambiarle una línea, se convertiría en Continuous
Delivery: el artefacto quedaría construido y verificado, esperando una aprobación humana.

Es decir: la diferencia entre las dos CD, en este proyecto, es una casilla de configuración y no
un rediseño. Ese es justamente el punto de tener el despliegue expresado como un job con
dependencias.

### Por qué GitHub Actions y no el auto-deploy de Vercel

Vercel puede conectarse al repositorio y desplegar solo con cada push. Es cómodo, y para este
trabajo no sirve, por una razón concreta:

```text
Auto-deploy de Vercel              Este pipeline
   push                               push
     ↓                                  ↓
  despliega  ← ¿y las pruebas?         CI
     ↓                                  ↓
  (las pruebas corren aparte,      ¿pasó?  ── NO ──> se detiene. No hay despliegue.
   y si fallan, ya desplegaste)          │
                                        SÍ
                                         ↓
                                     despliega
```

Con el auto-deploy, las pruebas y el despliegue son dos carreras paralelas: producción puede
recibir código que el CI todavía no aprobó, o que rechazó. La puerta deja de ser una puerta.

Acá el despliegue lo dispara explícitamente el pipeline, y **solo después** del CI. La regla no
está escrita en un comentario que alguien pueda ignorar: está en el grafo de dependencias de
GitHub Actions, que es lo que decide qué corre.

---

## 3. Arquitectura

```text
  Desarrollador
       │  git commit
       ▼
      Git  (repositorio local)
       │  git push
       ▼
    GitHub  ──  jcyanez/cancha-total-f5
       │  dispara el evento
       ▼
 GitHub Actions
       │
       ├─────────── CI  (ci.yml) ────────────────────────┐
       │   Install → Lint → Typecheck → Test → Build     │
       │                                    → Humo       │
       └─────────────────────┬───────────────────────────┘
                             │
                    ¿el CI pasó?
                    ┌────────┴────────┐
                   NO                SÍ
                    │                 │
              ╔═════▼══════╗          ▼
              ║  SE PARA   ║     Migrar Turso   (esquema al día, idempotente)
              ║ sin deploy ║          │
              ╚════════════╝          ▼
                                 vercel pull
                                 vercel build --prod
                                 vercel deploy --prebuilt --prod
                                      │
                                      ▼
                                   Vercel  ── URL pública *.vercel.app
                                      │
                                      │  TURSO_DATABASE_URL
                                      │  TURSO_AUTH_TOKEN   (env vars de Vercel)
                                      ▼
                                   Turso   ── libSQL en la nube
                                      │
                                      ▼
                             Verificar /api/health
                             (lectura real contra Turso)
```

Los dos caminos, completos:

```text
push a una rama            pull request → main          push / merge a main
      │                           │                            │
      ▼                           ▼                            ▼
     CI                          CI                           CI
      │                           │                            │
      ▼                           ▼                            ▼
  (nada más)              Vercel Preview                 Migrar Turso
                                  │                            │
                                  ▼                            ▼
                          URL temporal                 Vercel Production
                          + comentario en el PR                │
                                                              ▼
                                                        URL definitiva
                                                              │
                                                              ▼
                                                     verificar /api/health
```

---

## 4. GitHub Actions: el vocabulario

Seis palabras alcanzan para leer cualquier workflow. Van con el ejemplo de este repositorio al
lado, porque en abstracto no se entienden.

| Término | Qué es | Acá |
|---|---|---|
| **workflow** | Un archivo `.yml` en `.github/workflows/`. Describe un proceso automático completo. | `ci.yml`, `deploy-production.yml`, `deploy-preview.yml` |
| **event** | Lo que hace arrancar un workflow. | `push`, `pull_request`, `workflow_dispatch` (a mano), `workflow_call` (lo llama otro workflow) |
| **job** | Un tramo del workflow. Corre en su propia máquina limpia. Varios jobs pueden ir en paralelo, o encadenarse con `needs:`. | `ci`, `migrar`, `desplegar`, `verificar` |
| **step** | Un paso dentro de un job. O corre un comando (`run:`) o usa una acción de otro (`uses:`). | `run: npm ci`, `uses: actions/checkout@v7` |
| **runner** | La máquina que ejecuta el job. GitHub las presta. | `runs-on: ubuntu-latest` |
| **secret** | Un valor cifrado que GitHub guarda y le pasa al workflow como variable de entorno. No se puede leer desde la interfaz una vez guardado, y GitHub lo enmascara en los logs. | `VERCEL_TOKEN`, `TURSO_AUTH_TOKEN` |

Dos piezas más que este pipeline usa y que conviene nombrar:

- **`needs:`** — la dependencia entre jobs. `needs: ci` significa *este job no arranca si `ci` no
  terminó bien*. Es el mecanismo con el que está construida la puerta, y no admite matices: no es
  un `if` que alguien pueda ablandar, es la topología del grafo.

- **`workflow_call`** — permite que un workflow sea invocado por otro, como una función. Es lo que
  hace que el CI esté escrito **una sola vez** y lo usen los tres caminos. Sin esto habría tres
  copias de las mismas etapas, y con el tiempo tres definiciones distintas de "está bien".

- **`concurrency`** — agrupa ejecuciones para que no se pisen. En CI cancela la corrida anterior
  de la misma rama (revisar un commit ya viejo es gastar un runner). En producción **no** cancela:
  un despliegue a medias no se aborta.

---

## 5. El pipeline desarrollado

Tres archivos. La decisión de fondo es que las etapas de verificación viven en uno solo y los
otros dos lo llaman.

### `ci.yml` — la definición de "está bien"

Se dispara con:

```yaml
on:
  push:
    branches-ignore: [main]   # main lo maneja deploy-production.yml
  pull_request:
    branches: [main]
  workflow_call:              # para que los otros dos lo puedan invocar
```

`main` queda excluido del `push` a propósito. Si no lo estuviera, un push a `main` dispararía dos
cosas a la vez: este workflow por su cuenta y el de despliegue con el CI adentro. Correría el
mismo CI dos veces en paralelo y el historial de Actions quedaría ilegible. Excluyéndolo, cada
evento tiene un dueño.

Las etapas:

| Etapa | Comando | Qué atrapa |
|---|---|---|
| Install | `npm ci` | Un `package.json` y un `package-lock.json` que no coinciden. `npm ci` falla; `npm install` los "arregla" en silencio y te tapa el problema. |
| Lint | `npm run lint` | Variables no declaradas, `await` olvidados, `catch` vacíos sin explicación. En JavaScript sin tipos, `no-undef` es lo único que separa `hoyISO()` de `hoyIS0()`. |
| Typecheck | *(informativo)* | Nada: no aplica. Ver abajo. |
| Test | `npm test` | Las 87 pruebas del negocio. Cada una levanta el sistema real como proceso hijo, con el reloj congelado y su propia base. |
| Build | `npm run verificar-artefacto` | Que el artefacto desplegable sea coherente. Ver abajo. |
| Humo | `npm run humo` | Que la aplicación arranque, conteste y **alcance su base de datos**. |

**Sobre el typecheck.** El proyecto es JavaScript sin anotaciones de tipos: no hay TypeScript, ni
`tsconfig.json`, ni JSDoc tipado. Un `tsc --noEmit` no verificaría nada, y un script que imprime
`ok` para llenar la casilla sería una etapa verde que no verifica nada — peor que no tenerla,
porque miente. El paso está en el workflow, con su nombre, declarando que no aplica y por qué. La
verificación estática que sí corre es el parseo de los 19 archivos, y está en la etapa de Build.

**Sobre el build.** El proyecto no transpila: no hay bundler, ni TypeScript, ni carpeta `dist/`.
Pero sí hay cosas que se pueden romper en el artefacto, y `herramientas/construir.js` verifica las
tres que importan:

1. **Todo parsea** — `node --check` sobre los 19 archivos `.js`.
2. **Ningún archivo de ejecución depende de una `devDependency`** — este es el que justifica el
   script. `better-sqlite3` es un módulo nativo que quedó como `devDependency`: lo usa el arnés de
   pruebas, no el sistema. Si alguien vuelve a escribir `require('better-sqlite3')` dentro de
   `server.js` o `bd.js`, localmente funciona perfecto y **en producción el despliegue arranca
   roto**. La etapa lo detiene antes. Está verificado que falla: inyectándole ese `require`, sale
   con código 1 y nombra el archivo.
3. **La entrada serverless carga** — que `api/index.js` se pueda cargar y exporte una función, que
   es lo que Vercel va a invocar.

El build *de verdad*, el que produce el paquete que se sube, lo corre Vercel con `vercel build` en
el workflow de despliegue. Esta etapa es su antesala.

### `deploy-production.yml` — la puerta

Cuatro jobs encadenados. El encadenamiento **es** la regla del caso:

```yaml
jobs:
  ci:
    uses: ./.github/workflows/ci.yml     # el mismo CI de los PR

  migrar:
    needs: ci                            # ← si ci falla, esto no existe

  desplegar:
    needs: migrar

  verificar:
    needs: desplegar
```

1. **`ci`** — invoca `ci.yml`. No hay etapas duplicadas.
2. **`migrar`** — aplica las migraciones a Turso antes de que llegue el código nuevo. Son
   idempotentes y ninguna lleva `DROP`: correrlas en cada despliegue no toca los datos. Si faltan
   los secretos, se detiene con un mensaje que dice cuál falta.
3. **`desplegar`** — el patrón oficial de tres pasos de Vercel:
   ```bash
   vercel pull --yes --environment=production   # baja config y env vars
   vercel build --prod                          # construye acá, en el runner
   vercel deploy --prebuilt --prod              # sube lo ya construido
   ```
   `--prebuilt` es lo que hace que el artefacto que se sube sea *exactamente* el que este pipeline
   verificó: Vercel no vuelve a construir nada.
4. **`verificar`** — le pregunta a la URL pública, ya en producción, si llega a Turso. Que el
   despliegue termine sin error no dice que la aplicación funcione.

El token de Vercel va por el entorno del job (`env: VERCEL_TOKEN:`), no en la línea de comando. La
CLI lo lee de ahí. Así el token no aparece escrito en ningún comando, ni siquiera enmascarado.

### `deploy-preview.yml` — la misma puerta, otro destino

Igual que producción salvo dos cosas: el entorno es `preview` en vez de `production`, y no lleva
`--prod`. Al final deja la URL como comentario en el pull request.

**El preview no migra.** Apunta a las variables del entorno *Preview* de Vercel, y mover el
esquema desde un PR sin fusionar es exactamente cómo se rompe la producción por accidente. El
esquema lo mueve el workflow de producción, después del merge.

Un PR que viene de un *fork* no recibe los secretos del repositorio: es una decisión de diseño de
GitHub, porque si no, cualquiera podría abrir un PR y quedarse con el token. En ese caso el CI
corre igual y el preview se omite. El workflow lo declara explícitamente con un `if:`.

---

## 6. Turso

### SQLite, libSQL y Turso: qué es cada cosa

```text
SQLite    Un motor de base de datos que vive en un archivo. Sin servidor, sin red,
          sin puerto. Es la base de datos más desplegada del mundo y es lo que este
          sistema usaba: un archivo reservas.db al lado del código.

libSQL    Un fork abierto de SQLite que le agrega lo que SQLite no tiene por
          diseño: acceso por red, réplicas, concurrencia entre procesos. El
          dialecto SQL es el mismo.

Turso     libSQL como servicio: la base vive en la nube, se habla con ella por
          HTTP, y se autentica con un token.
```

Que el dialecto sea el mismo es lo que hizo viable esta migración. El esquema —`INTEGER PRIMARY
KEY AUTOINCREMENT`, `TEXT`, `DEFAULT (datetime('now'))`— y todo el SQL del sistema —`COUNT(*)`,
`substr()`, `UPDATE`, `ORDER BY`— valen igual en las dos. **Cero migración de tipos, cero claves
foráneas que reescribir, cero SQL específico del motor.**

### Lo que sí hubo que cambiar

No fue el SQL: fue la **firma**.

```javascript
// Antes: better-sqlite3, síncrono. El valor está ahí, en la misma línea.
const fila = db.prepare('SELECT ... WHERE id = ?').get(id);

// Ahora: libSQL, asíncrono. Lo que vuelve es una promesa.
const fila = await bd.consultarUno('SELECT ... WHERE id = ?', [id]);
```

Seis puntos de acceso a datos y los cinco manejadores que los llaman pasaron a `async`. Es una
conversión mecánica pero no es gratis: en un manejador asíncrono, un `await` olvidado no explota
—devuelve un objeto `Promise`— y termina interpolado en el HTML como `[object Promise]`. Por eso
el lint está en el pipeline y no es opcional.

Y por eso también, la migración se verificó de dos maneras:

- Las **87 pruebas** siguieron en verde, y **ningún archivo de `pruebas/` se tocó**.
- Se levantaron los dos sistemas —el de antes y el migrado— con el mismo reloj congelado y bases
  sembradas idénticas, y se compararon **27 respuestas HTTP byte a byte**: las nueve pantallas,
  nueve acciones (reservar, bloques ocupados, validaciones, XSS, cancelaciones) y las pantallas
  otra vez después de las acciones. **27 de 27 idénticas.** El cambio de driver no movió un
  carácter de lo que ve el usuario.

### Por qué better-sqlite3 no sobrevive en Vercel

Dos razones, y la segunda es la definitiva:

1. Es un módulo **nativo** (compilado, no JavaScript). Empaquetarlo en una función serverless es
   posible pero frágil.
2. El filesystem de Vercel es **de solo lectura** salvo `/tmp`, y `/tmp` es **efímero y por
   instancia**. Una reserva escrita en un archivo ahí se pierde en el próximo arranque en frío, o
   simplemente no la ve la instancia siguiente.

O sea: aun compilando bien, el sistema habría funcionado en la demo y perdido reservas en
producción. Eso es lo que obliga a mover los datos afuera, y es lo que Turso resuelve.

### Un solo driver para los dos lados

`bd.js` es el único archivo del sistema que sabe con qué base habla:

```text
CANCHA_BD definida          →  ese archivo         (las pruebas)
TURSO_DATABASE_URL definida →  Turso, por HTTP     (Vercel)
ninguna de las dos          →  ./reservas.db       (desarrollo)
```

Un solo driver, `@libsql/client`, para las tres. **El camino que ejercitan las pruebas es el
mismo que corre en producción**, y eso es lo que hace que el CI signifique algo: si probáramos con
un driver y desplegáramos con otro, el verde del CI no diría nada sobre producción.

Dos detalles de implementación que valen la pena:

- **El import importa.** `@libsql/client/web` es HTTP puro, sin binding nativo: es el que
  sobrevive en una función serverless. El import normal trae el binding nativo, que hace falta
  —y solo hace falta— para abrir un archivo en disco. `bd.js` elige uno u otro según la clase de
  base, y por eso la función que se despliega no arrastra código nativo.

- **El orden de precedencia protege la base de producción.** `CANCHA_BD` gana sobre
  `TURSO_DATABASE_URL`. No es un capricho: el arnés de pruebas siempre pasa `CANCHA_BD`. Si Turso
  ganara, bastaría con tener `TURSO_DATABASE_URL` exportada en la terminal para que `npm test`
  escribiera —y borrara— en la base real. Está verificado: con una URL de Turso falsa exportada,
  las 87 pruebas siguen corriendo contra su archivo temporal.

### Las variables

| Variable | Qué es | Dónde vive |
|---|---|---|
| `TURSO_DATABASE_URL` | La dirección de la base. Forma `libsql://<base>-<org>.turso.io`. No es un secreto en sentido estricto —sin token no sirve de nada— pero identifica la infraestructura y se trata como secreto. | GitHub Secrets (para migrar) + Vercel env vars (para servir) |
| `TURSO_AUTH_TOKEN` | La credencial. Un JWT. **Esto sí es un secreto.** Con él se lee y se escribe la base. | GitHub Secrets + Vercel env vars |

Las dos van juntas: una sin la otra hace fallar el arranque con un mensaje que nombra la que
falta. Nunca su valor.

### Migraciones

```text
database/
  migrations/
    001-crear-tabla-reservas.sql    la tabla, transcrita sin cambios del original
    002-indices-de-consulta.sql     dos índices para las consultas que se repiten
  migrar.js                          el corredor
  sembrar.js                         datos de ejemplo
```

```bash
npm run db:migrate    # aplica lo que falte, contra la base que digan las env vars
npm run db:seed       # datos de ejemplo
```

Las cuatro propiedades que el corredor garantiza:

- **Versionables** — el nombre del archivo es la versión, y una tabla `migraciones` registra lo
  aplicado. Correrlo dos veces no repite nada.
- **Reproducibles** — el esquema sale de un archivo `.sql` versionado, no del código. Antes estaba
  escrito dos veces (en `server.js` y en `datos.js`), que era el hallazgo E-9 del caso.
- **Idempotentes** — todas usan `IF NOT EXISTS`. El servidor las corre en cada arranque en frío
  sin consecuencias.
- **Seguras** — **ninguna lleva `DROP`.** Correr `db:migrate` sobre la base de producción no toca
  un solo dato. Por eso el pipeline puede hacerlo en cada despliegue.

La siembra es aparte y es deliberadamente arisca: por omisión **no borra nada** (si la tabla tiene
filas, se detiene y lo dice), hace falta `--reiniciar` para reemplazar, y sobre una base remota
hace falta además `--confirmar-remoto`. La base de producción no se limpia por accidente ni por un
script de CI.

El índice de la migración 002 merece una nota, porque no existía antes: con la base en un archivo
local no cambiaba nada medible, pero con la base al otro lado de la red cada consulta es un viaje.
Por la misma razón, la grilla de disponibilidad —que preguntaba el estado de 28 bloques con 28
consultas— ahora los trae en una. El HTML que sale es idéntico; lo que cambió es cuánto cuesta
producirlo.

---

## 7. Vercel

### Qué es un deployment

Cada vez que Vercel construye y publica una versión, crea un **deployment**: un artefacto inmutable
con su propia URL única, que queda para siempre. No se sobreescriben; se acumulan. Volver atrás es
apuntar el dominio a un deployment anterior, no reconstruir nada.

### Preview y Production

```text
Production                          Preview
─────────────────────               ─────────────────────
El deployment al que apunta         Un deployment cualquiera con su
el dominio principal del            URL única. Convive con producción
proyecto.                           sin tocarla.

Se despliega con --prod.            Se despliega sin --prod.

Un solo deployment de               Tantos como se quiera, uno por
producción a la vez.                pull request.

Usa las env vars del entorno        Usa las env vars del entorno
"Production".                       "Preview".
```

El valor del preview: se puede **abrir en el navegador** el código de un pull request, con su
propia URL, antes de fusionarlo, sin arriesgar producción. Y como el CI corre antes, la URL solo
existe si el código pasó las pruebas.

### Environment variables

Vercel guarda variables por entorno: Production, Preview y Development. La misma variable puede
tener distinto valor en cada uno — y en un proyecto de verdad, `TURSO_DATABASE_URL` debería
apuntar a bases distintas en Production y en Preview, para que un preview no escriba en los datos
reales.

Son variables **del runtime**: existen dentro de la función cuando atiende un pedido. No son
visibles para el navegador, y ese límite es lo que hace que el token de Turso pueda estar ahí.

### El punto de entrada

Una función serverless no escucha en un puerto: recibe `(req, res)` y contesta. Una aplicación de
Express **es** una función `(req, res)`, así que alcanza con exportarla:

```javascript
// api/index.js
const { app } = require('../server.js');
module.exports = app;
```

Tres líneas. Que sean tres y no trescientas es mérito de una decisión anterior a todo esto: durante
el caso práctico, el hallazgo E-1 hizo que `server.js` dejara de llamar a `listen()` cuando no es
el módulo principal. Eso se hizo para poder cargarlo desde las pruebas sin ocupar un puerto — y
resultó ser exactamente lo que hace falta para el serverless. Código que se puede probar es código
que se puede desplegar; suele ser la misma propiedad vista desde dos lados.

Y `vercel.json` manda todas las rutas a esa única función, porque el enrutamiento lo hace Express:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/api" }] }
```

### Las tres decisiones de `vercel.json`

El archivo tiene cuatro claves y ningún comentario. La falta de comentarios no es descuido:
`vercel deploy` valida el esquema de forma estricta y **rechaza cualquier clave que no conozca** —
incluida la convención `"//"` que se usa para comentar JSON. Curiosamente `vercel build` y `vercel
pull` sí la aceptan, así que el error aparece recién en el último paso. Por eso las explicaciones
viven acá.

**`rewrites`** — todas las rutas van a `/api`. El enrutamiento lo hace Express, no Vercel.

**`functions.api/index.js.maxDuration: 15`** — margen sobre los 10 s por omisión, para el primer
arranque en frío, que además tiene que abrir la conexión a Turso.

**`git.deploymentEnabled: false`** — apaga el auto-deploy de Vercel. Es la línea que hace *cierta*
la afirmación de que el despliegue lo controla GitHub Actions: sin ella, Vercel también desplegaría
por su cuenta con cada push, antes del CI, y habría dos caminos a producción de los cuales solo uno
pasa por la puerta.

**Y una decisión que NO está en este archivo, y por eso conviene nombrarla:** el script que verifica
el artefacto se llama `verificar-artefacto` y no `build`. Vercel ejecuta automáticamente un script
llamado exactamente `build` si lo encuentra en `package.json`, y después exige una carpeta de salida
estática. La exigencia es razonable —un build que no produce archivos no tiene sentido para un
sitio— pero esta aplicación no produce archivos: renderiza el HTML en cada pedido. Con el nombre
`build`, el despliegue moría con `No Output Directory named "public" found` justo después de que el
script terminara bien. La etapa del pipeline sigue llamándose Build; lo que cambió es el nombre del
script.

---

## 8. Seguridad: por qué los secretos no van a Git

### El problema

Git no olvida. Un token commiteado y borrado en el commit siguiente **sigue estando** en el
historial, recuperable con `git log -p`. Si el repositorio es público —o se vuelve público, o se
clona, o se hace un fork— ese token está expuesto para siempre. La única reparación real es rotar
la credencial, no borrar el archivo.

Y no hace falta que un humano lo encuentre: hay bots recorriendo GitHub en tiempo real buscando
exactamente estos patrones. La ventana entre el push y el primer intento de uso se mide en minutos.

### Lo que se hizo acá

| Medida | Dónde |
|---|---|
| `.env` y `.env.*` en `.gitignore`, con `!.env.example` como excepción | `.gitignore` |
| `.env.example` versionado con **solo los nombres**, ningún valor | `.env.example` |
| Los secretos entran al pipeline como GitHub Secrets, cifrados | los tres workflows |
| El token de Vercel va por el entorno del job, nunca en una línea de comando | `deploy-production.yml` |
| `/api/health` no devuelve la URL de la base, ni el token, ni el mensaje crudo del driver | `server.js` |
| Si el driver falla, se propaga `error.code`, no `error.message` (que puede traer la URL adentro) | `bd.js` |
| Los chequeos de secretos dicen **qué** falta, nunca su valor | `deploy-production.yml` |
| La prueba de humo verifica activamente que `/api/health` no filtre nada | `herramientas/humo.js` |
| `.vercel/` en `.gitignore` (guarda `orgId` y `projectId`) | `.gitignore` |

Esa penúltima línea merece atención: la prueba de humo tiene una comprobación que busca `libsql:`,
`authToken`, `eyJ` (el prefijo de un JWT) y `turso.io` en la respuesta de `/api/health`. Si alguien
"mejora" el endpoint agregándole información de diagnóstico y filtra la URL, **el CI se pone rojo**.
La regla no depende de que alguien se acuerde.

### GitHub Actions Secrets vs. Vercel Environment Variables

Es la pregunta que más se confunde. Son dos almacenes distintos porque sirven a dos momentos
distintos:

```text
GitHub Actions Secrets                Vercel Environment Variables
──────────────────────                ────────────────────────────
Los lee el RUNNER,                    Los lee la FUNCIÓN,
durante el pipeline.                  cuando atiende un pedido.

Existen mientras el job corre.        Existen mientras la app está viva.

Sirven para: construir, migrar,       Sirven para: que la aplicación
desplegar.                            desplegada funcione.

Si faltan: el pipeline falla.         Si faltan: la app despliega bien
                                      y devuelve 503 en /api/health.
```

Cuál necesita cada uno, y por qué:

| Secreto | GitHub Actions | Vercel | Razón |
|---|---|---|---|
| `VERCEL_TOKEN` | **Sí** | No | Autentica la CLI para desplegar. La app no despliega nada. |
| `VERCEL_ORG_ID` | **Sí** | No | Identifica el proyecto a desplegar. |
| `VERCEL_PROJECT_ID` | **Sí** | No | Idem. |
| `TURSO_DATABASE_URL` | **Sí** | **Sí** | Actions la necesita para migrar; la app, para leer y escribir. |
| `TURSO_AUTH_TOKEN` | **Sí** | **Sí** | Igual. |

Las dos de Turso están en los dos lados, y **no es duplicación por descuido**: son dos sistemas
distintos accediendo a la misma base en dos momentos distintos. GitHub Actions la toca una vez por
despliegue, para migrar el esquema. Vercel la toca en cada pedido de cada usuario. No hay forma de
que uno le preste sus credenciales al otro.

Las tres de Vercel, en cambio, están **solo** en GitHub, porque desplegar es algo que hace el
pipeline y no la aplicación. Dárselas a la aplicación sería darle a un servidor web público la
capacidad de desplegar código.

---

## 9. Prueba del pipeline correcto

Lo que hay que ver y en qué orden:

```text
1.  git commit + git push a main
        ↓
2.  GitHub → Actions → "Deploy Production" arranca solo
        ↓
3.  job CI            ✅  install · lint · 87 pruebas · build · humo
        ↓
4.  job Migrar Turso  ✅  esquema al día (idempotente: "ya estaba")
        ↓
5.  job Desplegar     ✅  vercel pull → build --prod → deploy --prebuilt --prod
        ↓
6.  job Verificar     ✅  /api/health contra la URL pública
        ↓
7.  Abrir la URL: la aplicación responde y muestra reservas de Turso
```

El paso 6 es el que cierra el círculo del caso, y conviene explicar por qué está separado del 5:
que `vercel deploy` termine sin error dice que el artefacto se subió, **no** que la aplicación
funcione. Una app puede desplegarse perfecto y no poder leer una sola fila. El job `verificar`
consulta `/api/health`, que hace una lectura real contra Turso, y además exige que el backend
reportado sea `turso` y no un archivo. Si la aplicación estuviera sirviendo desde un archivo
efímero de `/tmp`, ese job se pondría rojo.

---

## 10. Prueba del pipeline fallido

El objetivo es demostrar que el CI **protege** producción, no que sabe fallar.

```text
Rama aparte:  demo/ci-falla

1.  Se rompe una prueba a propósito, en una rama, nunca en main
        ↓
2.  git push origin demo/ci-falla
        ↓
3.  GitHub → Actions → "CI" arranca
        ↓
4.  Etapa "Pruebas"   ❌  la aserción falla, con el valor esperado y el obtenido
        ↓
5.  El job queda rojo
        ↓
6.  NO HAY DESPLIEGUE. Ni preview, ni producción.
        ↓
7.  Producción sigue sirviendo la última versión buena. Intacta.
        ↓
8.  Se revierte el cambio y el CI vuelve a verde
```

Los pasos 6 y 7 son el punto entero del ejercicio. No es que "el CI avisó": es que **el despliegue
no ocurrió**, porque `needs: ci` no se cumplió, y por lo tanto los jobs de despliegue no llegaron
a existir. La protección no es una alarma que alguien tiene que atender; es una precondición.

Y el paso 1 importa: se hace **en una rama**, no en `main`. La rama principal no se rompe para
demostrar nada.

Qué romper. La opción más limpia y más legible en el log es cambiar un número esperado en una
prueba de tarifa — por ejemplo, que las 17:00 cuesten ₡15.000 en vez de ₡20.000. El fallo sale con
el esperado y el obtenido al lado, se entiende de un vistazo, y no toca código de producción.

> **Nota metodológica.** En el caso práctico original, una prueba en rojo era un *hallazgo* del
> sistema y estaba prohibido ablandarla. Acá es lo contrario y a propósito: la prueba se rompe
> deliberadamente para exhibir la puerta, en una rama que nunca se fusiona. Son dos actividades
> distintas y conviene no confundirlas al presentar el trabajo.

---

## 11. Evidencias para la entrega

Las capturas que hay que tomar, en orden de presentación. Cada una con qué tiene que ser visible
en la imagen.

| # | Captura | Dónde | Qué tiene que verse |
|---|---|---|---|
| 1 | Repositorio en GitHub | `github.com/jcyanez/cancha-total-f5` | El nombre, el árbol de archivos, el badge del CI en el README |
| 2 | Carpeta de workflows | `.github/workflows/` | Los tres archivos `.yml` |
| 3 | Contenido de `ci.yml` | vista de archivo | Las etapas: install, lint, test, build |
| 4 | **CI en verde** | Actions → una corrida exitosa | Los pasos con tilde verde, y el tiempo de cada uno |
| 5 | Detalle de las pruebas | Actions → paso "Pruebas" desplegado | `# pass 87` y `# fail 0` |
| 6 | **Grafo del deploy** | Actions → "Deploy Production" | Los cuatro jobs encadenados: CI → Migrar → Desplegar → Verificar |
| 7 | **Action fallida** | Actions → la corrida de `demo/ci-falla` | La X roja en "Pruebas" **y que no haya jobs de despliegue** |
| 8 | Comparación lado a lado | Actions, lista de corridas | Una roja y una verde, para que se vea el contraste |
| 9 | **GitHub Secrets** | Settings → Secrets and variables → Actions | **Solo los nombres.** Los valores no se pueden mostrar y no hay que intentarlo |
| 10 | Proyecto en Vercel | Dashboard de Vercel | El proyecto, con su último deployment en "Ready" |
| 11 | Deployments de Vercel | Vercel → Deployments | La lista, con Production y Preview distinguidos |
| 12 | Env vars de Vercel | Vercel → Settings → Environment Variables | Los nombres `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`, con los valores ocultos |
| 13 | **URL pública funcionando** | `https://<proyecto>.vercel.app` | La barra de direcciones con el dominio `.vercel.app` **y** la aplicación renderizada |
| 14 | Base de datos en Turso | Dashboard de Turso | La base, su región, su tamaño |
| 15 | Esquema en Turso | Turso → la base → Tables / Shell | La tabla `reservas` con sus columnas, y la tabla `migraciones` |
| 16 | **Datos en Turso** | Turso Shell: `SELECT * FROM reservas;` | Filas de verdad, con nombres de cliente |
| 17 | **La app leyendo Turso** | La URL pública, en `/dia/<fecha>` | Las **mismas** reservas que se ven en la captura 16 |
| 18 | Health check | `https://<proyecto>.vercel.app/api/health` | `"status":"ok"`, `"database":"connected"`, `"backend":"turso"` |
| 19 | Preview en un PR | Un pull request abierto | El comentario del bot con la URL del preview, y el CI en verde arriba |

Las que más peso tienen para la rúbrica son la **7** (que el despliegue no ocurrió), y el par
**16 + 17** juntas: la misma reserva vista en el panel de Turso y en la aplicación pública es la
prueba de que el flujo Vercel → Turso está realmente conectado y no simulado.

Un detalle de presentación para la 16 y la 17: conviene registrar una reserva con un nombre
inventado y reconocible desde la aplicación desplegada, y después buscarlo en el shell de Turso. Eso
demuestra el camino completo de **escritura**, que es más difícil de fingir que una lectura.

---

## 12. Resumen de archivos

| Archivo | Qué hace |
|---|---|
| `.github/workflows/ci.yml` | La definición de "está bien". Reutilizable con `workflow_call`. |
| `.github/workflows/deploy-production.yml` | CI → migrar → desplegar → verificar, en `main`. |
| `.github/workflows/deploy-preview.yml` | CI → preview, en cada pull request. |
| `bd.js` | Acceso a datos. El único archivo que sabe con qué base habla. |
| `api/index.js` | Punto de entrada serverless. Exporta la app de Express. |
| `vercel.json` | Manda todas las rutas a la función única. |
| `.vercelignore` | Deja `pruebas/` afuera del paquete, para que no arrastre el módulo nativo. |
| `database/migrations/*.sql` | El esquema, versionado. |
| `database/migrar.js` | Corredor de migraciones, idempotente y sin `DROP`. |
| `database/sembrar.js` | Datos de ejemplo, con guardas contra el borrado accidental. |
| `herramientas/construir.js` | Verificación del artefacto desplegable. |
| `herramientas/humo.js` | Interroga la app —local o desplegada— y su base. |
| `.env.example` | Los nombres de las variables. Ningún valor. |
| `verificar.sh` | La misma puerta que el CI, para correr antes de hacer push. |
