---
id: SPEC-C7-REMEDIACION
title: Ciclo de cierre del Caso Práctico 7
status: Approved
owner: Juan Carlos Yanez
created: 2026-09-11
updated: 2026-09-11
---

# Ciclo de cierre del Caso Práctico 7

Este es el contrato que yo aprobé para la unidad **SETUP-C7**. Lo escribo en primera persona
porque es mi decisión, no una convención heredada de otro documento: fija qué cierro, con quién,
en qué orden y con qué evidencia, antes de tocar una sola prueba. Complementa, sin repetir, a
[`HALLAZGOS.md`](../HALLAZGOS.md), a `CLAUDE.md` (raíz de `Week5/` y de `cancha-total/`) y a
[`.claude/agents/cerrador-hallazgos.md`](../.claude/agents/cerrador-hallazgos.md).

## 1. Problema

`HALLAZGOS.md` ya registra los siete hallazgos de comportamiento del Caso 7 como cerrados: nacieron
en el cierre del Caso Práctico 5 y viven hoy en `main` con sus pruebas en verde, sin marca de fallo
esperado. Eso resuelve el sistema, pero no resuelve lo que a mí me pide esta unidad: un **ciclo de
cierre auditable**, con subagente de alcance mínimo y permisos declarados por escrito, que se pueda
correr grupo por grupo y dejar evidencia propia — la mía, no la de memoria de quien lo ejecutó.

El PR #7 (`13f1720`) ya puso la mitad de eso: el subagente `cerrador-hallazgos` y los permisos de
`.claude/settings.json`. Lo que falta, y lo que fijo acá, es el contrato — qué cuenta como cerrado,
en qué grupos se reparte, qué evidencia exijo por cada uno y cómo me asegura que esta remediación
no le muestra a `main` un solo commit en rojo.

## 2. Alcance

Los siete hallazgos de comportamiento que numera la consigna del Caso 7, `H-2` a `H-8`, con la
correspondencia que ya declaré en `HALLAZGOS.md § Cumplimiento del Caso 7`:

| Hallazgo (consigna) | Hallazgo (repositorio) | Condición observable | Pruebas |
|---|---|---|---|
| `H-2` | `C-1` | `RN-19` — la hora con luz cuesta ₡20.000 desde las 17:00 | `pruebas/tarifas.test.js` (3) |
| `H-3` | `C-2` (a) | `RN-13` — el teléfono es obligatorio | `pruebas/validaciones.test.js` → *sin teléfono no se registra la reserva* |
| `H-4` | `C-2` (b) | `RN-13` — el teléfono tiene exactamente ocho dígitos | `pruebas/validaciones.test.js` → *siete dígitos*, *nueve dígitos*, *con letras* |
| `H-5` | `C-3` | `RN-24` — las canceladas no cuentan para cliente frecuente | `pruebas/cliente-frecuente.test.js` (1) |
| `H-6` | `C-4` | `RN-23` — «el mismo mes» es el mes de registro | `pruebas/cliente-frecuente.test.js` (2) |
| `H-7` | `C-5` | `RN-27`, `RN-28` — se cancela hasta 24 horas antes del inicio | `pruebas/cancelacion.test.js` (1) |
| `H-8` | `C-6` | `PANT-16` — lo que escribe el cliente se muestra como texto | `pruebas/pantallas.test.js` (1) |

## 3. Exclusiones

- **`H-9`, `H-10`, `H-11` quedan fuera.** No los abro, no toco sus pruebas ni su código de
  producción, y no los cierro en esta unidad. Si el subagente los encuentra al paso mientras
  atiende un grupo, los anota en su informe y sigue de largo sin tocarlos.
- **No agrego funciones nuevas ni amplío el alcance del sistema.** Ningún grupo de cierre es
  licencia para resolver algo que la consigna no pidió.
- **No cambio el stack ni reemplazo SQLite.** Sigue fuera de alcance por consigna, tanto en el
  Caso 5 como en este ciclo.

## 4. Actores y permisos

- **Yo (Juan Carlos Yanez), dueño de la unidad.** Aprobé este contrato, despacho cada grupo, reviso
  el diff y la suite después de cada cierre, y soy la única parte que puede hacer `commit` o
  `push`.
- **El subagente `cerrador-hallazgos`.** Herramientas mínimas — `Read`, `Glob`, `Grep`, `Edit`,
  `Bash` —, `permissionMode: acceptEdits`, `maxTurns: 12`, sin la herramienta `Agent` y sin acceso a
  red. Atiende exactamente el grupo que le despacho y ningún otro; no delega, no publica, y su
  informe final indica el grupo atendido, los archivos revisados o modificados, el resultado exacto
  de la suite, y cualquier hallazgo fuera de alcance que haya visto de paso.
- **`.claude/settings.json` de esta unidad.** `Edit(./pruebas/**)` y `Bash(git push)` /
  `Bash(git push *)` quedan en `ask`, tanto exactos como con argumentos; `Read` de `.env*` queda
  denegado; el hook `Stop` corre `verificar.sh` antes de cerrar cualquier turno. Ninguno de estos
  resguardos se relaja durante el ciclo.

## 5. Cinco grupos

Uno por código compartido, confirmado leyendo `HALLAZGOS.md`, las pruebas citadas y el código de
producción que ejercitan — nunca asumido de memoria:

| Grupo | Hallazgos | Código compartido | Pruebas |
|---|---|---|---|
| 1 | `H-2` | `tarifaDelBloque()` en `server.js` | `pruebas/tarifas.test.js` |
| 2 | `H-3` / `H-4` | Las dos ramas de teléfono en `POST /reservas` (`if (!telefono)` / `else if (!/^[0-9]{8}$/.test(telefono))`) | `pruebas/validaciones.test.js` |
| 3 | `H-5` / `H-6` | La consulta de conteo mensual de cliente frecuente (`estado = 'activa'` y `substr(creada_en, 1, 7)`) | `pruebas/cliente-frecuente.test.js` |
| 4 | `H-7` | `horasHastaElPartido()` contra `HORAS_DE_PLAZO_PARA_CANCELAR` | `pruebas/cancelacion.test.js` |
| 5 | `H-8` | `escaparHTML()` y `escaparParaGuion()` | `pruebas/pantallas.test.js` |

**Una instrucción por grupo.** Despacho cada grupo por separado al subagente. No combino dos grupos
en una misma instrucción ni reparto un grupo entre dos invocaciones.

## 6. Criterios binarios

Un grupo está cerrado si, y solo si, las siete condiciones dan verdadero:

1. La prueba o pruebas del grupo existen con el mismo nombre, comentario y aserción que tenían
   antes de empezar — nada de eso se tocó.
2. La única edición sobre esas pruebas es haber quitado la marca `{ todo: ... }` completa, y solo
   después de comprobar que la prueba pasa tal cual está escrita.
3. La suite completa (`node --test "pruebas/*.test.js"`) corre antes y después del cierre; el
   conteo de verdes, marcadas y fallos de cada corrida queda registrado.
4. `verificar.sh` sale en `0` con el cierre puesto.
5. El `diff` del grupo no toca ningún archivo de prueba fuera del suyo ni ningún archivo de
   producción fuera del código compartido que ese grupo declaró.
6. El commit del grupo es de una sola clase — comportamiento o estructura —, nunca mezcla las dos.
7. El informe del subagente confirma que no usó la herramienta `Agent`, no tuvo acceso a red y no
   ejecutó `commit` ni `push`.

## 7. Unidades de trabajo

| Unidad | Qué hace | Dónde | Estado |
|---|---|---|---|
| 0 | Define el subagente y los permisos de esta sesión | `main`, vía PR #7 (`13f1720`) | **Cerrada** |
| 1 | Fija este contrato (`docs/CASO-7-CICLO-DE-CIERRE.md`) | Rama de esta unidad, `codex/caso7-setup-ciclo-cierre` | En curso |
| 2 | Prepara una rama base controlada que reproduce temporalmente el estado rojo de `H-2`..`H-8` | Rama controlada, fuera de `main` | Pendiente |
| 3–7 | Despacho de los cinco grupos al `cerrador-hallazgos`, uno por uno, sobre la rama controlada | Rama controlada | Pendiente |
| 8 | Reviso el diff y la suite completa de cada grupo antes de declararlo cerrado | Rama controlada | Pendiente |
| 9 | Abro el PR de cierre hacia `main` solo cuando los cinco grupos están cerrados y la suite da lo mismo que en `main` hoy | Rama controlada → `main` | Pendiente |

Ningún grupo se despacha antes de que el anterior tenga su evidencia completa revisada.

## 8. Evidencia exigida por PR

Cada PR de esta unidad — el de este contrato y los de cierre por grupo — trae, sin excepción:

- La salida de la suite antes y después del cambio: cuántas pruebas, cuántas en verde, cuántas
  marcadas como fallo esperado, cuántos fallos.
- La salida de `verificar.sh`, con su código de salida.
- El `diff` acotado al grupo: sobre `pruebas/`, ninguna línea que no sea la marca `{ todo: ... }`
  removida; sobre producción, solo el código compartido que ese grupo declaró.
- El informe del subagente, íntegro: grupo atendido, archivos revisados o modificados, resultado
  exacto de la suite, y cualquier afirmación previa que la evidencia haya desmentido.
- Confirmación de que ningún commit del PR mezcla estructura con comportamiento.

Sin esa evidencia a la vista, el grupo no se declara cerrado — lo dice también
`cancha-total/CLAUDE.md § 3`, y lo repito aquí porque es la condición que hace auditable todo el
ciclo.

## 9. Matriz de trazabilidad

| `H-#` | `C-#` | Grupo | Pruebas | Código de producción | Estado en `main` hoy |
|---|---|---|---|---|---|
| `H-2` | `C-1` | 1 | `pruebas/tarifas.test.js` | `tarifaDelBloque()`, `server.js` | Cerrado (Caso 5) |
| `H-3` | `C-2` (a) | 2 | `pruebas/validaciones.test.js` | `POST /reservas`, rama `if (!telefono)` | Cerrado (Caso 5) |
| `H-4` | `C-2` (b) | 2 | `pruebas/validaciones.test.js` | `POST /reservas`, rama `else if (!/^[0-9]{8}$/...)` | Cerrado (Caso 5) |
| `H-5` | `C-3` | 3 | `pruebas/cliente-frecuente.test.js` | Conteo mensual, filtro `estado = 'activa'` | Cerrado (Caso 5) |
| `H-6` | `C-4` | 3 | `pruebas/cliente-frecuente.test.js` | Conteo mensual, `substr(creada_en, 1, 7)` | Cerrado (Caso 5) |
| `H-7` | `C-5` | 4 | `pruebas/cancelacion.test.js` | `horasHastaElPartido()` | Cerrado (Caso 5) |
| `H-8` | `C-6` | 5 | `pruebas/pantallas.test.js` | `escaparHTML()`, `escaparParaGuion()` | Cerrado (Caso 5) |

La columna de estado dice lo que hoy es cierto en `main`: los siete ya están cerrados desde el
Caso 5. El ciclo que define este contrato no los reabre — reproduce su rojo **en una rama aparte**
para dejar, del propio Caso 7, la evidencia de cierre grupo por grupo que la consigna pide, con el
subagente y los permisos de esta unidad.

## 10. Garantía sobre `main`

Declaro estas tres condiciones como innegociables para todo el ciclo:

- **Una rama base controlada, fuera de `main`, reproduce temporalmente el rojo de `H-2` a `H-8`.**
  Esa reproducción — volver a poner la marca `{ todo: ... }` sobre las pruebas ya citadas, o
  revertir puntualmente el código de producción que las hace pasar — vive solo en esa rama, nunca
  en `main`.
- **`main` no recibe en ningún momento el estado rojo.** Ningún commit de esta unidad que deje la
  suite en rojo se fusiona a `main`; el PR de cierre hacia `main` solo se abre cuando la rama
  controlada está tan verde como `main` lo está hoy.
- **Esta es una remediación actual, no una reescritura del historial.** Los commits de cierre se
  agregan encima de los existentes, uno por grupo, sin `commit --amend`, sin `rebase` y sin
  `push --force`. El commit del proveedor (`65ce4b4`) y los veinte commits del cierre del Caso 5
  no se tocan.
