---
name: escribir-pruebas
description: Use when code that already works has no test suite — before refactoring, optimizing, or changing it. Turns the acceptance conditions of ESPECIFICACION.md and PLAN.md into an executable suite plus one verification command; when the codebase has no documents, reconstructs the specification with the person first. Writes tests and findings, never production code. Triggers on "escribir pruebas", "ponerle pruebas", "no tiene tests", "red de seguridad", "antes de refactorizar", "puerta de calidad", "verificar.sh".
---

# Escribir las pruebas

De código que ya funciona a una red que dice si sigue funcionando: la suite ejecutable, un
comando único de verificación, y la lista de lo que el código no cumple.

Sigue el estándar de `test-driven-development` (Superpowers) en lo que vale para código que ya
existe —la prueba describe el comportamiento esperado, no el código escrito— y descarta lo que
no aplica: acá el código está construido y **no se borra ni se reescribe**. La adaptación del
curso: esta habilidad escribe pruebas y descubre; **arreglar es otro turno, con otro encargo**.

**Anunciar al arrancar:** «Estoy usando la habilidad escribir-pruebas para poner la red de
seguridad. No voy a tocar el código de producción.»

---

## La regla de hierro

```
LA PRUEBA RESPONDE A LA ESPECIFICACIÓN, NUNCA AL CÓDIGO
```

Si no hay especificación, se reconstruye con la persona **antes** de escribir una sola prueba.
Nunca se deriva el valor esperado de lo que el código devuelve hoy.

---

## Proceso

1. **Buscar la fuente de verdad.** `ESPECIFICACION.md`, y `PLAN.md` si existe: sus condiciones
   de aceptación ya están escritas y son la materia prima. Un README de instalación **no es una
   especificación**: describe cómo se corre el sistema, no qué tiene que hacer. Sin condiciones
   de aceptación escritas, ir al Camino B antes de seguir.
2. **Derivar la lista de condiciones a probar.** Una fila por condición, con el nivel propuesto
   y la razón. Someterla a aprobación antes de escribir código de prueba.
3. **Escribir la suite**, condición por condición, con las reglas de escritura de abajo.
4. **Correr la suite.** Lo que falla **no se toca**: se anota en `HALLAZGOS.md` y su prueba
   queda marcada como fallo esperado con el número del hallazgo.
5. **Escribir `verificar.sh`**, el comando único que devuelve pasa o no pasa.
6. **PUNTO DE CONTROL:** presentar la suite, los hallazgos y el comando, y someterlo a la
   compuerta del usuario.

**Estado terminal:** la suite escrita, el comando corriendo y los hallazgos anotados. **No se
corrige ningún defecto encontrado, ni se refactoriza, ni se hace commit.**

---

## Camino B · el codebase no tiene documentos

Es el caso normal en código heredado, y es donde más fácil se rompe la regla de hierro: sin
especificación, la tentación es tomar lo que el código hace como lo que el código debe hacer.
No se hace. Se reconstruye la especificación primero, y la reconstruye **la persona**.

1. **Leer el código y extraer el comportamiento observable**, expresado en lenguaje del negocio,
   no del código: «al cerrar una reparación sin repuestos registrados, el sistema la cierra
   igual». Nada de nombres de funciones, archivos, clases ni rutas en esta lista.
2. **Devolver la lista numerada y preguntar punto por punto qué *debería* pasar.** La pregunta
   nunca es «¿está bien esto?»; es «¿qué tiene que pasar acá?». Agrupar por recorrido para que
   se pueda contestar de corrido, y repartir el detalle según la regla de abajo.
3. **Escribir `ESPECIFICACION.md`** con lo que la persona confirmó o corrigió, en texto que
   alguien pueda leer y discutir. **A partir de ahí ese documento es la fuente de verdad**, y
   una condición confirmada se trata como cualquier otra: no hay pruebas de segunda clase.
4. Compuerta del usuario sobre el documento. Recién entonces, volver al paso 2 del proceso.

Lo que la persona corrija respecto de lo que el código hace hoy no se arregla acá: produce una
prueba que va a fallar, y ese fallo es un hallazgo.

### Cuánto detalle lleva cada cosa

Una lista de cuarenta afirmaciones no se contesta: se aprueba en bloque, y ahí se pierde todo lo
que este paso existe para descubrir. El detalle se reparte por **lo que cada cosa decide**, no
por lo que ocupa en el código:

| Qué es | Cómo entra |
|---|---|
| **Reglas que mueven dinero o deciden si algo se puede hacer** — precios, descuentos, plazos, qué es obligatorio, quién puede qué | Una afirmación por regla, con su valor y su borde exactos, y **su propia pregunta** |
| **Comportamiento de pantalla** — mensajes, orden de las listas, qué se ve cuando no hay nada, qué se muestra junto | Una afirmación agrupada por recorrido, sin pregunta propia salvo que la persona la abra |
| **Código presente pero inactivo** — funciones que nadie llama, reglas comentadas | Una lista aparte, con **una sola** pregunta para todo el grupo |
| **Lo que el sistema no hace** — no se puede editar, no hay control de acceso | Al final, en una línea cada uno; se preguntan solo si la persona los menciona |

Los bordes se enuncian con el número exacto, porque es donde vive la diferencia entre lo que el
código hace y lo que el negocio quiere: «cobra la tarifa alta desde las 18:00», no «cobra más de
noche». Una afirmación sin su número no se puede contrastar ni volver prueba.

---

## El nivel de cada prueba

El nivel no se elige por gusto: se deriva de dónde vive la condición, y se declara.

- **Integración, por defecto.** La condición describe un recorrido del negocio: entra por donde
  entra la persona y termina en el efecto observable —el dato guardado, la respuesta del
  servicio, el estado que cambió—. Sobrevive intacta a que el código se reordene por dentro,
  que es justo lo que hace falta antes de reestructurar.
- **Unidad, cuando la condición es una regla con lógica propia**: un cálculo, una validación con
  casos borde, una tarifa, una regla de negocio con excepciones. Ahí las pruebas de recorrido
  son caras y ciegas, y una prueba directa con varios casos vale más.

Una suite sana de un prototipo tiene pocas pruebas de recorrido y las unitarias concentradas
donde hay lógica que merece casos.

---

## Cómo se escribe cada prueba

- **El nombre es la condición, en lenguaje del negocio.** «no cierra una reparación sin
  repuestos registrados», no «test cerrarReparacion 2».
- **Cada prueba declara qué cambio en el código la haría fallar**, en una línea junto a la
  prueba. Si no se puede nombrar ese cambio, la prueba no comprueba nada y no se escribe.
- **Prohibido derivar el valor esperado de la salida actual.** Correr el código para ver qué da
  y escribir eso como esperado produce una prueba que pasa siempre y no comprueba nada. El
  valor esperado sale de la especificación o de la persona.
- **Sin dobles salvo lo inevitable.** Sustituir las piezas internas por simulaciones convierte
  la prueba en un examen de la forma del código. Se usan solo para lo que está fuera del
  sistema y no se puede correr: cobros reales, correo saliente, servicios de terceros.
- **Sin reloj, sin red, sin orden, sin estado compartido.** Nada de la fecha de hoy, de números
  al azar sin semilla fija, de llamadas a internet, ni de pruebas que dependen de haber corrido
  otra antes. Una prueba que falla una de cada diez corridas destruye la puerta en dos días,
  porque la gente aprende a ignorarla.
- **Los datos de la prueba los crea la prueba** y quedan como estaban al terminar.

---

## Los hallazgos

Una prueba en rojo es un hallazgo, **nunca un defecto de la prueba**. No se ablanda la
aserción, no se borra la prueba, no se ajusta el valor esperado.

Cada hallazgo entra en `HALLAZGOS.md` con su clase, porque son dos trabajos distintos:

- **Comportamiento** — el código hace algo que contradice la especificación.
- **Estructura** — la condición no se puede probar sin cambiar el código.

```markdown
# Hallazgos

Lo que la suite descubrió y esta habilidad no corrige. Cada uno tiene su prueba escrita,
marcada como fallo esperado. Se cierran en el turno de refactorización, quitando la marca.

| # | Condición (de la especificación) | Qué hace hoy | Clase | Prueba |
|---|---|---|---|---|
| 1 | ... | ... | comportamiento | `ruta/al/archivo::nombre` |
```

**La marca de fallo esperado** es lo que permite que la puerta sirva desde el primer día: la
prueba queda escrita tal cual y anotada como conocida, con el número del hallazgo. Sin eso, un
`verificar.sh` que siempre falla se ignora en dos horas. El avance de la refactorización se
mide contando marcas quitadas.

---

## El comando único

`verificar.sh` en la raíz del proyecto. Corre la suite —y el chequeo de tipos y el linter si el
proyecto los tiene—, y termina en **0 si todo pasó** o en **2 si algo falló**, con el motivo en
la salida de error. Un solo comando: quien lo corre no tiene que acordarse de nada.

```bash
#!/usr/bin/env bash
# Puerta de calidad. 0 = se puede cerrar. 2 = algo falló.
set -u
<comando de pruebas del proyecto> || { echo "La suite falló." >&2; exit 2; }
echo "Verificación completa."
```

Si la persona lo pide, se conecta al cierre de turno con un hook `Stop` en
`.claude/settings.json` del proyecto, para que el agente no pueda dar el turno por terminado
con la suite en rojo:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/verificar.sh" } ] }
    ]
  }
}
```

Se avisan sus dos límites al proponerlo: corre al final de **cada** respuesta, así que una
verificación lenta castiga toda la conversación; y Claude Code lo ignora después de ocho
bloqueos seguidos sin avance.

---

## Reglas duras

- **No se toca el código de producción.** Ni para arreglar un defecto, ni para hacerlo más fácil
  de probar. Si algo no se puede probar sin cambiarlo, eso es un hallazgo de clase estructura.
- **No se sugieren cambios de código.** Los hallazgos describen qué no se cumple, no cómo
  arreglarlo: el diagnóstico es de esta habilidad, el remedio es del turno siguiente.
- **Lo que sí se escribe:** archivos de prueba, configuración del marco de pruebas, sus
  dependencias, `verificar.sh`, `HALLAZGOS.md` y —solo en el Camino B— `ESPECIFICACION.md`.
- **Ninguna prueba nace de lo que el código devuelve.**
- **No hacer commit por cuenta propia.**

---

## Racionalizaciones

| Excusa | Realidad |
|---|---|
| «La prueba falla, la ajusto y listo» | Ajustarla borra el único hallazgo que la suite produjo. Va a `HALLAZGOS.md`. |
| «El código es la especificación» | El código no dice qué debería pasar; dice qué pasa. Son cosas distintas y la diferencia es el defecto. |
| «Corro la función, veo qué da y eso pongo de esperado» | Prueba que pasa siempre. Es el modo de falla más común de las pruebas generadas. |
| «Aprovecho y arreglo este defecto de una vez» | Dos oficios en un turno: termina ajustando la aserción para que todo quede verde. |
| «Es más fácil probarlo si muevo esta función» | Es un hallazgo de estructura, no un permiso. |
| «Con cobertura alta ya está» | La cobertura dice qué se ejecutó, no qué se comprobó. |
| «Simulo las piezas internas y así aíslo» | Entonces la prueba comprueba la forma del código, y se cae con la primera reestructuración. |

---

## Lista de verificación antes de cerrar

- [ ] Cada prueba sale de una condición de la especificación, y se puede señalar cuál.
- [ ] Ninguna aserción salió de correr el código.
- [ ] Cada prueba declara qué cambio la haría fallar.
- [ ] El nivel de cada prueba está declarado con su razón.
- [ ] Ninguna prueba depende del reloj, de la red, del orden ni de otra prueba.
- [ ] Todo lo que falla está en `HALLAZGOS.md` con su clase, y su prueba marcada.
- [ ] `verificar.sh` corre y devuelve 0 o 2.
- [ ] El código de producción quedó sin tocar: el diff no lo incluye.

## Compuerta del usuario

> «La suite está escrita y `verificar.sh` corre. Encontré N hallazgos, anotados en
> `HALLAZGOS.md`. Revisalos y decime cuáles atacamos en el turno de refactorización.»

Esperar la respuesta. No arreglar ninguno hasta que lo pidan, y en un encargo aparte.
