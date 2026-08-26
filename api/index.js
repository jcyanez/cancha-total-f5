// Punto de entrada de Vercel.
//
// Una función serverless no escucha en un puerto: recibe (req, res) y contesta.
// Una aplicación de Express ES una función (req, res), así que alcanza con
// exportarla. server.js ya sabía no llamar a listen() cuando no es el módulo
// principal —lo dejó así el hallazgo E-1—, y esa decisión es la que hace que
// este archivo tenga tres líneas y no trescientas.
//
// El esquema y la conexión no se tocan acá: los resuelve bd.js en el primer
// pedido que le toque un arranque en frío.

const { app } = require('../server.js');

module.exports = app;
