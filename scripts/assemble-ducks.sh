#!/bin/bash
set -euo pipefail
cat scripts/ducks_a.txt scripts/ducks_b.txt > src/game/ducks.ts
echo "assembled ducks.ts $(wc -c < src/game/ducks.ts) bytes"
