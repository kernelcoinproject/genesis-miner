#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cargo build --manifest-path "$repo_root/scrypt-wasm/Cargo.toml" --release --target wasm32-unknown-unknown

python3 - "$repo_root" <<'PY'
from pathlib import Path
import base64
import sys

root = Path(sys.argv[1])
wasm = root / "scrypt-wasm/target/wasm32-unknown-unknown/release/genesis_miner_scrypt_wasm.wasm"
template = root / "scrypt-wasm/worker.template.js"
output = root / "scrypt_wasm_worker.js"
encoded = base64.b64encode(wasm.read_bytes()).decode("ascii")
output.write_text(template.read_text().replace("__WASM_BASE64__", encoded))
print(f"Wrote {output.name} ({output.stat().st_size:,} bytes)")
PY
