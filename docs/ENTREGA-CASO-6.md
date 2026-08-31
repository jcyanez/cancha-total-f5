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

**Recomendación final: `CONDITIONAL`** — todo lo que depende del repositorio y del pipeline está en
verde. Quedan dos puntos que dependen de la consola de Vercel y no del código; están detallados en
§ 3 y § 4.

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
| 25 | **Preview del PR en verde** | `PARTIAL` | El *despliegue* del preview funciona; falla su *verificación*. Ver § 3. |
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

**Lo que funciona.** El job `Desplegar preview` corre el CI, instala la CLI fijada (`Vercel CLI
59.10.0` en el log), verifica las credenciales, vincula el proyecto, y hace `vercel pull`,
`vercel build` y `vercel deploy`. **El preview se despliega correctamente y obtiene su URL.**

**Lo que falla.** El paso siguiente, *"Interrogar el preview"*, que corre `herramientas/humo.js`
contra esa URL. Los despliegues de vista previa de este proyecto están detrás de **Vercel
Authentication**: un pedido anónimo recibe la pantalla de autenticación de Vercel en vez de la
aplicación. La prueba de humo detecta exactamente eso y lo dice:

> El despliegue está detrás de la protección de Vercel: contesta con su pantalla de autenticación,
> no con la aplicación. […] No hay ninguna llave configurada en este momento.

Corrida real: [runs/33446711283](https://github.com/jcyanez/cancha-total-f5/actions/runs/33446711283).

**La causa exacta.** El workflow ya pasa `VERCEL_AUTOMATION_BYPASS_SECRET` al paso, pero ese secreto
**no existe en el repositorio**, así que llega vacío. No es un defecto del pipeline ni del código:
es una configuración que vive en la consola de Vercel y que no se puede crear desde este repositorio.

**Qué falta, exactamente.** Una de estas dos, ambas fuera del código:

1. Vercel → Project Settings → Deployment Protection → **Protection Bypass for Automation** →
   generar la llave, y cargarla como secreto con ese nombre exacto. El preview queda protegido para
   el público y abierto para la automatización.
2. Vercel → Project Settings → Deployment Protection → **Vercel Authentication** → desactivar. Deja
   las URLs de preview públicas.

Se clasifica `PARTIAL` y no `VERIFIED_FAIL` porque la mitad que depende de este repositorio —CI,
build, deploy y la URL del preview— funciona y está demostrada; lo que falta es una llave de una
consola externa. Y no se clasifica `VERIFIED_PASS` porque **el check está rojo**, y afirmar lo
contrario sería inventar evidencia.

`Deploy Preview` **no es** el check requerido para fusionar. El check requerido es
`Lint · Pruebas · Build · Humo`, y está verde.

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
