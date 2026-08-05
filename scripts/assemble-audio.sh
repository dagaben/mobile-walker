#!/usr/bin/env bash
set -euo pipefail
cat scripts/audio_src_0.txt scripts/audio_src_1.txt scripts/audio_src_2.txt > src/game/audio.ts
echo assembled audio.ts
