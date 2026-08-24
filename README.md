# Cancha Total F5 — Sistema de reservas

Sistema de reservas para las dos canchas techadas de fútbol 5 de Cancha Total F5.
Permite ver la disponibilidad del día, registrar reservas y cancelarlas.

Node + Express + SQLite, con las vistas renderizadas en el servidor.

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

Un solo comando: corre la suite entera y devuelve un código de salida.

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

Sin variables de entorno el sistema arranca como siempre. Existen para poder levantarlo en otro
puerto, contra otra base o con el reloj fijo, sin tocar el código:

| Variable | Por omisión | Para qué |
|---|---|---|
| `CANCHA_PUERTO` | `3000` | Puerto. Con `0` pide uno libre al sistema operativo. |
| `CANCHA_BD` | `reservas.db` | Ruta del archivo de la base de datos. |
| `CANCHA_AHORA` | el reloj real | Fija el instante que el sistema considera «ahora». |

## Los documentos

El sistema se recibió sin un solo documento. Estos se escribieron reconstruyéndolo:

- **[ESPECIFICACION.md](ESPECIFICACION.md)** — qué debe hacer el sistema. Cada afirmación con su
  fuente declarada: la administradora, el comportamiento del sistema recibido, o una decisión
  explícita del cliente. **Es la fuente de verdad**: las pruebas responden a este documento, nunca
  al código.
- **[HALLAZGOS.md](HALLAZGOS.md)** — todo lo que la suite descubrió al contrastar el sistema contra
  la especificación, con la prueba que delata cada cosa y la evidencia de cierre.
- **[STATUS.md](STATUS.md)** — el estado del trabajo.

## Cómo está armado

```
server.js      el sistema: rutas, reglas del negocio y vistas
esquema.js     el esquema de la tabla, compartido con el script de datos
datos.js       siembra reservas de ejemplo
verificar.sh   la puerta de calidad
pruebas/       la suite
  soporte/     lo que las pruebas usan para hablar con el sistema
```

No hay build, ni bundler, ni carpeta de archivos estáticos: el HTML se arma en el servidor y la
hoja de estilo viaja dentro de él, en la constante `ESTILOS` de `server.js`. Está organizada en
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
