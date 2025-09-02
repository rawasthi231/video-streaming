#!/usr/bin/env bash
set -euo pipefail


OUT_DIR="$(cd "$(dirname "$0")"/.. && pwd)/hls"
mkdir -p "$OUT_DIR"


# 10-second color bars with tone
ffmpeg -y \
-f lavfi -i testsrc=size=640x360:rate=30 \
-f lavfi -i sine=frequency=1000:sample_rate=48000:duration=10 \
-shortest -c:v libx264 -preset veryfast -t 10 -pix_fmt yuv420p \
-c:a aac -b:a 128k \
-f hls -hls_time 2 -hls_playlist_type event \
-hls_segment_filename "$OUT_DIR/segment_%03d.ts" \
"$OUT_DIR/master.m3u8"


echo "HLS written to $OUT_DIR"