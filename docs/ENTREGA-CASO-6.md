# Caso práctico 6 — Matriz requisito → evidencia

Este documento no explica el pipeline: eso está en [CI-CD.md](CI-CD.md). Acá cada requisito tiene
al lado **cómo se comprobó** y **el enlace real** de la comprobación, con un estado honesto:

| Estado | Significa |
|---|---|
| `VERIFIED_PASS` | Se comprobó y cumple. El enlace o el comando de la columna de evidencia lo demuestra. |
| `VERIFIED_FAIL` | Se comprobó y no cumple. |
| `PARTIAL` | Cumple en parte. La columna dice exactamente qué parte falta y por qué. |
| `NOT_VERIFIED` | No se pudo comprobar. La columna dice qué haría falta. |
| `N/A` | No aplica a este stack. |

**Recomendación final: `CONDITIONAL`** — los 24 requisitos que dependen del repositorio y del
pipeline están verdes y verificados. Quedan tres `PARTIAL`, y ninguno se puede cerrar desde este
repositorio:

| | Qué falta | Dónde se arregla |
|---|---|---|
| § 3 | `TURSO_AUTH_TOKEN` en el entorno **Preview** | Consola de Vercel |
| § 4 | Una base Turso desechable para correr la suite completa | Consola de Turso + autorización |
| § 5 | Rotar un secreto mal cargado | Consola de Vercel + GitHub |

Ninguno de los tres afecta el check requerido para fusionar, ni la cadena que protege producción.

---

## 1. La matriz

| # | Requisito | Estado | Evidencia |
|---|---|---|---|
| 1 | Repositorio público | `VERIFIED_PASS` | [github.com/jcyanez/cancha-total-f5](https://github.com/jcyanez/cancha-total-f5) · `gh repo view --json visibility` → `PUBLIC` |
| 2 | `main` protegida | `VERIFIED_PASS` | `gh api .../branches/main --jq .protected` → `true` (era `false` al empezar) |
| 3 | Pull request obligatorio | `VERIFIED_PASS` | `required_pull_request_reviews` presente, `required_approving_review_count: 0` |
| 4 | CI requerido para fusionar | `VERIFIED_PASS` | `required_status_checks.contexts` → `["Lint · Pruebas · Build · Humo"]`, `strict: true` |
| 5 | La protección alcanza al administrador | `VERIFIED_PASS` | `enforce_admins.enabled` → `true` · `restrictions` → `null` (sin actores de bypass) |
| 6 | Force-push y borrado deshabilitados | `VERIFIED_PASS` | `allow_force_pushes.enabled` → `false` · `allow_deletions.enabled` → `false` |
| 7 | Acciones externas fijadas a SHA | `VERIFIED_PASS` | 8/8 referencias externas con SHA de 40. `checkout@3d3c42e5…`, `setup-node@82076278…`, ambos resueltos contra la API de GitHub. Las 2 referencias `./.github/workflows/ci.yml` son locales. |
| 8 | CLI de Vercel en versión exacta | `VERIFIED_PASS` | `"vercel": "59.10.0"` en `devDependencies`, sin `^` ni `~`, fijada en `package-lock.json`. El log de la corrida imprime `Vercel CLI 59.10.0`. |
| 9 | PR con corrida **roja** | `VERIFIED_PASS` | Commit [`65f5c90`](https://github.com/jcyanez/cancha-total-f5/pull/2/commits/65f5c90a5b9e14b6d2048bb77f0e86aab2086d01) · [runs/33446508303](https://github.com/jcyanez/cancha-total-f5/actions/runs/33446508303) → `# tests 88 · # pass 87 · # fail 1` |
| 10 | El **mismo** PR con commit posterior verde | `VERIFIED_PASS` | Commit [`6f4921e`](https://github.com/jcyanez/cancha-total-f5/pull/2/commits/6f4921e9bd84ef7653a2d6c00d2865469a8d5898) · [runs/33446710929](https://github.com/jcyanez/cancha-total-f5/actions/runs/33446710929) → `# tests 87 · # pass 87 · # fail 0` |
| 11 | El PR estuvo **bloqueado** mientras estuvo rojo | `VERIFIED_PASS` | `gh pr view 2 --json mergeStateStatus` → `BLOCKED` con el commit rojo como cabeza |
| 12 | Ningún despliegue durante el rojo | `VERIFIED_PASS` | `Desplegar preview` en `skipping` ([runs/33446508659](https://github.com/jcyanez/cancha-total-f5/actions/runs/33446508659)) porque `needs: ci` no se cumplió. Ninguna corrida nueva de *Deploy Production*. |
| 13 | Sin push directo nuevo a `main` | `VERIFIED_PASS` | Todo entró por [PR #2](https://github.com/jcyanez/cancha-total-f5/pull/2). `main` termina en un merge commit del PR. |
| 14 | 87/87 pruebas originales verdes | `VERIFIED_PASS` | `./verificar.sh` local → `# pass 87 / # fail 0`, salida 0. Mismo resultado en CI. |
| 15 | Valores esperados originales sin modificar | `VERIFIED_PASS` | `git diff 9fbed1a HEAD -- pruebas/` → **vacío**. `pruebas/` es byte por byte el del cierre del Caso 5; la migración a Turso no tocó un solo archivo de pruebas. Ver § 2. |
| 16 | El CI no necesita credenciales externas | `VERIFIED_PASS` | `ci.yml` no recibe ningún secreto. Corre contra un archivo temporal del runner. |
| 17 | Producción en Vercel funcionando | `VERIFIED_PASS` | <https://cancha-total-f5.vercel.app> · humo remoto **10/10** |
| 18 | Producción conectada a Turso | `VERIFIED_PASS` | `/api/health` → `{"status":"ok","database":"connected","driver":"libsql","backend":"turso"}`. El humo **exige** `backend=turso` y sería rojo con un archivo efímero. |
| 19 | La cadena completa del despliegue | `VERIFIED_PASS` | [Deploy Production](https://github.com/jcyanez/cancha-total-f5/actions/workflows/deploy-production.yml): `CI → Migrar Turso → Desplegar a Vercel → Verificar producción`, encadenados por `needs:`. |
| 20 | README y documentación con enlaces reales | `VERIFIED_PASS` | [README.md](../README.md), [CI-CD.md](CI-CD.md) § 5 y § 10, y este archivo. Ningún enlace inventado. |
| 21 | Commit directo histórico explicado | `VERIFIED_PASS` | [`d4fa9f9`](https://github.com/jcyanez/cancha-total-f5/commit/d4fa9f9a8c16ee74e10f91101b45a2522c59e298), anterior a la protección. Ver [CI-CD.md § 10.5](CI-CD.md). No se ocultó ni se reescribió. |
| 22 | Ninguna credencial expuesta en el repositorio | `VERIFIED_PASS` | 130 blobs de **toda la historia** inspeccionados contra 6 familias de patrones: sin coincidencias. `.env` y `.vercel/` nunca estuvieron rastreados. |
| 23 | Dependencias de producción sin vulnerabilidades altas | `VERIFIED_PASS` | `npm audit --omit=dev --audit-level=high` → `found 0 vulnerabilities` |
| 24 | Árbol de trabajo limpio | `VERIFIED_PASS` | `git status --short` → vacío |
| 25 | **Preview del PR en verde** | `PARTIAL` | El preview **se despliega**, y desde este PR se atraviesa su autenticación (dos defectos reales corregidos). Queda rojo porque el entorno *Preview* de Vercel no tiene `TURSO_AUTH_TOKEN`. Ver § 3. |
| 26 | **Las 87 pruebas contra Turso** | `PARTIAL` | Suite completa contra libSQL local + prueba remota de solo lectura contra Turso. Ver § 4. |
| 27 | Higiene de secretos del repositorio | `PARTIAL` | Un secreto mal cargado, a rotar. Ver § 5. |
| 28 | Typecheck | `N/A` | El proyecto es JavaScript sin anotaciones de tipos. Declarado como no aplicable en `ci.yml`, sin fingir una casilla verde. |

---

## 2. Por qué el requisito 15 se puede afirmar sin matices

El requisito dice que la suite del Caso 5 pasa contra el almacenamiento nuevo **y que sus valores
esperados no fueron modificados**. La segunda mitad se puede demostrar de la forma más fuerte
posible:

```bash
git diff 9fbed1a HEAD -- pruebas/
# (sin salida)
```

`9fbed1a` es el último commit del Caso práctico 5 que tocó `pruebas/`. Entre ese commit y hoy pasó
toda la migración a Turso, el pipeline entero y este PR. El directorio `pruebas/` no cambió **ni un
byte**. No hay que revisar aserción por aserción: no hay diferencia que revisar.

Los dos commits de este PR que sí tocaron `pruebas/` se cancelan entre sí: uno agregó el archivo
temporal de demostración y el siguiente lo borró.

---

## 3. Requisito 25 — el preview del PR

Este punto se persiguió hasta el fondo y se arreglaron **dos defectos reales** en el camino. Vale
la pena contarlo por capas, porque cada capa se creyó "la causa" hasta que la siguiente apareció.

### Capa 1 — faltaba la llave de paso *(resuelta)*

Los despliegues de vista previa están detrás de **Vercel Authentication**: un pedido anónimo recibe
la pantalla de autenticación en vez de la aplicación. El workflow ya pasaba
`VERCEL_AUTOMATION_BYPASS_SECRET`, pero el secreto no existía en el repositorio y llegaba vacío.
Corrida: [runs/33447313168](https://github.com/jcyanez/cancha-total-f5/actions/runs/33447313168).

Se configuró la llave. **Resuelto.**

### Capa 2 — la sonda pedía una cookie que no puede guardar *(defecto real, corregido)*

Con la llave puesta, el paso pasó a fallar con `fetch failed`, a secas. Ese mensaje no dice nada:
`fetch` envuelve **todo** error de red en un `TypeError` cuyo mensaje es siempre ése, y lo que
explica qué pasó viaja en `error.cause`, que nadie estaba leyendo. Un fallo de DNS y uno de TLS se
veían idénticos en el log.

Se hizo que la sonda informe la causa —y, de paso, que espere a que un despliegue recién creado se
vuelva alcanzable, en vez de apostar a un `sleep` fijo de diez segundos—. La causa apareció:

```text
aún no contesta (1/12): fetch failed — redirect count exceeded
```

`herramientas/humo.js` mandaba dos cabeceras: la llave, y `x-vercel-set-bypass-cookie: true`. La
segunda le pide a Vercel que además de dejar pasar el pedido, la respuesta **plante una cookie**; y
para plantarla, **redirige**. Un navegador guarda la cookie, sigue el redirect una vez y entra.
`fetch` no tiene tarro de cookies: sigue el redirect, vuelve a llegar sin la cookie, Vercel vuelve a
redirigir, y así hasta que fetch se planta.

Se quitó esa cabecera: la de la llave sola ya autoriza el pedido. **Resuelto.**

> Y hay un corolario que conviene registrar: **Vercel solo entra en el baile de la cookie cuando la
> llave es válida.** Con una llave incorrecta contesta su pantalla de autenticación y no redirige
> nada — comprobado. Es decir, el bucle de redirects fue la prueba de que la llave configurada es
> la correcta.

### Capa 3 — el entorno *Preview* de Vercel no tiene con qué hablarle a Turso *(pendiente, fuera del repositorio)*

Ya del otro lado de la autenticación, el preview contesta **500**, y lo que devuelve es **la página
de error de la propia aplicación** (`<title>Error - Cancha Total F5…`), no la de Vercel. O sea: el
despliegue existe, la función arranca y Express está atendiendo. Lo que falla es la base.

El diagnóstico se puede afinar leyendo el código, sin adivinar. `/api/health` **atrapa** los errores
de base y contesta **503 con un JSON** que dice `database: "disconnected"`:

```js
} catch (error) {
  res.status(503).json({ status: 'error', database: 'disconnected', ... });
}
```

Pero lo que llega es **500 con HTML**. Entonces el handler nunca terminó de correr: la excepción se
levanta en su primera línea, `bd.descripcionDeLaBase()`, que está **fuera** del `try`, y la atrapa
el manejador de errores de Express. La única excepción de configuración que encaja está en
[`bd.js`](../bd.js):

> `TURSO_DATABASE_URL apunta a una base remota pero falta TURSO_AUTH_TOKEN.`

Y encaja con el resto de la evidencia: **sin** `TURSO_DATABASE_URL` la aplicación caería al archivo
local y contestaría **200** con `backend=archivo-local` (fallaría la comprobación "usa Turso", pero
no daría 500). Con la URL puesta y sin token, tira antes de poder contestar nada.

**Conclusión:** el entorno **Preview** del proyecto en Vercel tiene `TURSO_DATABASE_URL` pero le
falta `TURSO_AUTH_TOKEN`. Eso vive en la consola de Vercel —Project Settings → Environment
Variables, columna *Preview*— y no hay nada en este repositorio que pueda arreglarlo.

Corrida con este estado: [runs/33450210373](https://github.com/jcyanez/cancha-total-f5/actions/runs/33450210373).

### Por qué esto no bloquea la entrega

`Deploy Preview` **no es** el check requerido para fusionar. El requerido es
`Lint · Pruebas · Build · Humo`, y está verde. La cadena que protege producción —CI → migrar →
desplegar → verificar— no pasa por el preview.

Se clasifica `PARTIAL` y no `VERIFIED_FAIL` porque todo lo que depende de este repositorio funciona
y está demostrado: el CI corre, la CLI fijada construye, el despliegue del preview **se completa** y
obtiene su URL, y la autenticación se atraviesa. Lo que falta es una variable de entorno en una
consola externa. Y no se clasifica `VERIFIED_PASS` porque **el check está rojo**, y decir lo
contrario sería inventar evidencia.

> Una decisión que quedó sin tomar, a propósito: darle al entorno Preview las credenciales de
> **producción** dejaría el check en verde en un minuto, y por eso mismo no se hizo sin preguntar.
> Significaría que cualquier PR abierto comparte la base real, y que alguien navegando un preview
> puede escribir reservas de verdad. Es una decisión de infraestructura con consecuencias sobre
> datos reales, no un ajuste de pipeline. Lo correcto es una base de preview aparte, migrada por
> su propio camino.

---

## 4. Requisito 26 — la suite contra Turso

Lo que se puede afirmar, y lo que no:

| Afirmación | Estado |
|---|---|
| Ningún archivo de `pruebas/` fue modificado en la migración a Turso | **Sí**, demostrado en § 2 |
| Las 87 pruebas pasan | **Sí**, local y en CI |
| Las 87 pruebas corren contra **libSQL**, el mismo driver que usa producción | **Sí** — `@libsql/client` en los dos lados, sobre un archivo temporal del runner |
| La aplicación desplegada usa Turso | **Sí** — `backend=turso` en `/api/health` |
| El humo remoto consulta Turso de verdad | **Sí** — lectura real, 10/10 |
| Las 87 pruebas corrieron contra una base **Turso remota** | **No.** No ocurrió, y no se afirma. |

La suite es destructiva por diseño: cada prueba levanta el sistema sobre una base propia que crea,
llena y desecha. Apuntarla a la base de producción borraría reservas reales. Correrla contra Turso
exigiría una base separada y desechable (`cancha-total-f5-test`), con credenciales propias fuera del
CI principal — y crear o escribir en esa base necesita una autorización explícita que no se pidió,
porque no es imprescindible para el requisito.

Además hay una razón de diseño para no hacerlo en la puerta: **el CI no debe depender de un servicio
externo.** Si la puerta necesitara Turso, una caída de Turso dejaría de poder fusionar nada, y el CI
pasaría a tener credenciales con las que tocar una base remota. Hoy no las tiene, y eso es
deliberado.

Por eso el estado honesto es `PARTIAL`: **suite completa contra libSQL local, más verificación
remota de solo lectura contra Turso.**

---

## 5. Requisito 27 — higiene de secretos

El repositorio, en toda su historia, está limpio: 130 blobs inspeccionados, cero coincidencias.

Hay un hallazgo, y no está en el código sino en la configuración del repositorio: **existe un
secreto de Actions cuyo *nombre* es una cadena de 32 caracteres alfanuméricos en mayúsculas** — la
forma exacta del *valor* de una llave de bypass de Vercel. El patrón es compatible con haber
ejecutado `gh secret set <VALOR>` sin `--body`, con lo cual el valor terminó ocupando el campo del
nombre.

- **No se reproduce el nombre acá**, ni en ningún log, por si efectivamente es una credencial.
- Los nombres de los secretos de Actions solo los ve quien tiene acceso de escritura al
  repositorio, así que la exposición es acotada — pero es una exposición.
- **Debe rotarse**: generar una llave nueva en Vercel (lo que invalida la anterior) y cargarla con
  el nombre correcto, `VERCEL_AUTOMATION_BYPASS_SECRET`. Después, borrar el secreto mal nombrado.
- No se intentó ocultar reescribiendo nada: un secreto de Actions no vive en la historia de Git.

Que ese valor esté mal cargado es también la causa directa del § 3: el secreto con el nombre que el
workflow busca no existe.

---

## 6. Limitaciones que no se pueden corregir sin reescribir la historia

Una sola, y es menor:

**El commit directo `d4fa9f9` en `main`.** Ocurrió antes de que la protección existiera. Sacarlo
exigiría reescribir la historia de `main` y un `push --force`, las dos cosas prohibidas por la
consigna — y con razón: borraría justamente la evidencia de cuándo empezó a regir la política. Se
deja a la vista y explicado.

Del mismo modo se conservan la rama `demo/ci-falla` y el PR #1 (fusionado con `Deploy Preview` en
rojo, cuando todavía no había protección ni check obligatorio). Son evidencia histórica de un estado
anterior del repositorio. Lo que corrige este PR no es el pasado, es la política: **desde ahora, un
PR con el check requerido en rojo no se puede fusionar, y el dueño del repositorio tampoco puede
saltarlo.**
