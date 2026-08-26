#!/usr/bin/env bash
# Puerta de calidad de Cancha Total F5.
#
#   0 = se puede cerrar el turno.
#   2 = algo fallo.
#
# Un solo comando: quien lo corre no tiene que acordarse de nada. Corre las
# mismas etapas que el CI de GitHub Actions y en el mismo orden, para que un
# turno que cierra en verde no descubra en el pipeline algo que se podia haber
# visto aca.
#
# Los hallazgos abiertos de HALLAZGOS.md estan marcados como fallo esperado en
# sus pruebas: se reportan, pero no derriban la puerta.
#
# Para correr una prueba suelta, el marco de abajo esta a la vista:
#   node --test --test-name-pattern "cliente frecuente" "pruebas/*.test.js"

set -u

cd "$(dirname "$0")" || { echo "No se pudo entrar al directorio del proyecto." >&2; exit 2; }

if [ ! -d node_modules ]; then
  echo "Faltan las dependencias. Corre: npm ci" >&2
  exit 2
fi

fallo=0
etapa() {
  local nombre="$1"; shift
  echo ""
  echo "--- $nombre ---"
  if "$@"; then
    return 0
  fi
  echo "FALLO: $nombre" >&2
  fallo=1
}

etapa "Lint"                npm run --silent lint
etapa "Pruebas"             npm run --silent test
etapa "Artefacto (build)"   npm run --silent build
etapa "Humo"                npm run --silent humo

echo ""
if [ "$fallo" -ne 0 ]; then
  echo "La verificacion fallo." >&2
  exit 2
fi

echo "Verificacion completa."
