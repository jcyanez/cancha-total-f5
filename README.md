# Cancha Total F5 — Sistema de reservas

Sistema de reservas para las dos canchas techadas de fútbol 5 de Cancha Total F5.
Permite ver la disponibilidad del día, registrar reservas y cancelarlas.

Node + Express + SQLite, con las vistas renderizadas en el servidor.

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
