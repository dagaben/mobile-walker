#!/bin/bash
set -euo pipefail
cat scripts/flying_part_0.txt scripts/flying_part_1.txt scripts/flying_part_2.txt > scripts/apply-flying-ducks.mjs
node scripts/apply-flying-ducks.mjs
