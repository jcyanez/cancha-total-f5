# CLAUDE.md — Unidad SETUP-C7

Este documento rige **la remediación real del 2026-09-11** sobre `cancha-total`: el cierre de los
hallazgos de comportamiento del Caso 7 con la red de pruebas ya puesta. Complementa, y no
reemplaza, al `CLAUDE.md` de `Week5/`: donde ese archivo habla del caso completo, este habla de
esta sesión de cierre.

## 1. Alcance

**Dentro:** `H-2` a `H-8` — los siete hallazgos de comportamiento que numera la consigna del Caso
7. `HALLAZGOS.md` documenta la correspondencia declarada con la numeración del repositorio
(`C-1`..`C-6`): `H-3` y `H-4` son las dos condiciones observables de `C-2` (teléfono obligatorio /
teléfono de ocho dígitos); el resto es 1 a 1.

**Fuera:** `H-9`, `H-10`, `H-11`. No se abren, no se tocan sus pruebas ni su código, y no se
cierran en esta unidad. Si aparecen mientras se trabaja un grupo, se anotan y se siguen de largo.

## 2. Grupos de cierre

Cinco grupos, uno por código compartido. La agrupación se confirma **leyendo el código antes de
agrupar** — HALLAZGOS.md, las pruebas citadas y el código de producción que ejercitan — nunca se
asume de memoria:

| Grupo | Hallazgos |
|---|---|
| 1 | `H-2` |
| 2 | `H-3` / `H-4` |
| 3 | `H-5` / `H-6` |
| 4 | `H-7` |
| 5 | `H-8` |

**Una instrucción por grupo.** Cada grupo se despacha por separado, dirigido al subagente
`cerrador-hallazgos`, que atiende exactamente ese grupo y ningún otro. No se combinan dos grupos en
una misma instrucción ni se reparte un grupo entre dos invocaciones.

## 3. Reglas de cierre (no negociables)

- No se agregan funciones nuevas ni se amplía el alcance del sistema.
- No se cambian nombres, valores esperados ni aserciones de ninguna prueba.
- Sobre una prueba marcada como fallo esperado, la única edición permitida es **quitar la marca
  `{ todo: ... }` entera**, y solo después de comprobar que la prueba pasa tal cual está escrita,
  sin haber tocado su cuerpo.
- Después de cerrar cada grupo se corre la suite completa y se revisa el `diff` antes de darlo por
  terminado. Ningún grupo se declara cerrado sin esa evidencia a la vista.

## 4. Historial

Esta unidad **no reescribe el historial**: nada de `commit --amend`, `rebase` ni `push --force`.
Los commits de cierre se agregan encima de los existentes, uno por grupo, sin mezclar estructura
con comportamiento en el mismo commit.

## 5. Herramientas y permisos de esta unidad

`.claude/settings.json` mantiene, sin relajarlos, los resguardos de esta sesión: `Edit(./pruebas/**)`
pide confirmación, `git push` pide confirmación tanto exacto como con argumentos, los archivos de
secretos (`.env*`) quedan denegados de lectura, y el hook `Stop` corre `verificar.sh` antes de
cerrar el turno.

El subagente `cerrador-hallazgos` (`.claude/agents/cerrador-hallazgos.md`) trabaja con herramientas
mínimas — `Read`, `Glob`, `Grep`, `Edit`, `Bash` — sin acceso a red, sin delegar en otros agentes y
sin publicar nada: ni `commit` ni `push` son suyos. Cierra el grupo que se le asigna y entrega su
informe; confirmar y publicar queda para quien lo invocó.
