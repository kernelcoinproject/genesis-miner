# genesis-miner
Mines scrypt and sha256 genesis blocks in browser

https://kernelcoinproject.github.io/genesis-miner/

Use https://github.com/kernelcoinproject/GenesisG0/ for speed

## Mining engines

Choose **WebGPU** in the Mining Engine menu to scan SHA-256 or scrypt nonce batches on the GPU. The scrypt kernel is specialized for the miner's `N=1024, r=1, p=1` settings, then verifies any candidate against the JavaScript implementation before reporting it. Browsers require a secure context, so serve the page on `http://localhost` (or HTTPS). Unsupported browsers fall back to JavaScript and show a status message. The SHA-256 shader follows the compute-shader approach in [RustyBamboo/hash-shader](https://github.com/RustyBamboo/hash-shader); its MIT license is included in `licenses/`.

Choose **WebAssembly** to mine SHA-256 or scrypt blocks with WebAssembly. Both algorithms distribute nonce ranges across the selected 1, 2, 4, or 8 Web Workers (8 by default). The JavaScript engine remains available for comparison. On `file://` pages, SHA-256 uses the main thread and scrypt falls back to JavaScript because browsers block Workers there.

The checked-in `sha256_miner.js` bundles the WebAssembly binary and is built from `sha256_miner.c` with Emscripten. To rebuild it, install Emscripten and run:

```sh
emcc sha256_miner.c -O3 -s MODULARIZE=1 -s EXPORT_NAME=GenesisMinerModule -s ENVIRONMENT=web,node -s SINGLE_FILE=1 -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_FUNCTIONS='["_mine_batch","_malloc","_free"]' -s EXPORTED_RUNTIME_METHODS='["HEAPU8"]' -o sha256_miner.js
```

The scrypt worker is a small Rust wrapper around RustCrypto's `scrypt` crate and uses Bitcoin genesis parameters (`N=1024, r=1, p=1, dkLen=32`). It batches nonce checks in parallel workers and embeds the generated Wasm binary in `scrypt_wasm_worker.js`. To rebuild it, install Rust and add the WebAssembly target, then run:

```sh
rustup target add wasm32-unknown-unknown
./build_scrypt_wasm.sh
```

The RustCrypto `scrypt` crate is dual licensed under MIT or Apache-2.0; license texts are included in `scrypt-wasm/licenses/`.

# Performance

| Device  | SHA-256 Hashrate | Scrypt Hashrate |
|---------|-------------------|------------------|
| M2 Air | 349.97 kH/s        | 3.12 kH/s       |
