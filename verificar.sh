#!/usr/bin/env bash
# Puerta de calidad de Cancha Total F5.
#
#   0 = se puede cerrar el turno.
#   2 = algo falló.
#
# Un solo comando: quien lo corre no tiene que acordarse de nada.
# Los hallazgos abiertos de HALLAZGOS.md están marcados como fallo esperado en
# sus pruebas: se reportan, pero no derriban la puerta.

set -u

cd "$(dirname "$0")" || { echo "No se pudo entrar al directorio del proyecto." >&2; exit 2; }

if [ ! -d node_modules ]; then
  echo "Faltan las dependencias. Corré: npm ci" >&2
  exit 2
fi

node --test "pruebas/*.test.js" || { echo "La suite falló." >&2; exit 2; }

echo "Verificación completa."
