// Generated from scrypt-wasm/src/lib.rs. Rebuild with ./build_scrypt_wasm.sh.
const WASM_BASE64 = "__WASM_BASE64__";

let wasmPromise;
function getWasm() {
    if (!wasmPromise) {
        const binary = Uint8Array.from(atob(WASM_BASE64), character => character.charCodeAt(0));
        wasmPromise = WebAssembly.instantiate(binary, {}).then(({ instance }) => instance.exports);
    }
    return wasmPromise;
}

async function mineBatch(data) {
    const wasm = await getWasm();
    const memory = new Uint8Array(wasm.memory.buffer);
    const header = new Uint8Array(data.header);
    const target = new Uint8Array(data.target);
    const headerPtr = wasm.miner_header_ptr();
    const targetPtr = wasm.miner_target_ptr();
    const resultPtr = wasm.miner_result_ptr();

    memory.set(header, headerPtr);
    memory.set(target, targetPtr);
    const checked = wasm.miner_scrypt_batch(
        headerPtr,
        targetPtr,
        data.startNonce >>> 0,
        data.count >>> 0,
        data.stride >>> 0,
        resultPtr
    );

    if (checked > 0) {
        const result = new DataView(wasm.memory.buffer, resultPtr, 36);
        const currentMemory = new Uint8Array(wasm.memory.buffer);
        return {
            checked,
            nonce: result.getUint32(0, true),
            hash: Array.from(currentMemory.subarray(resultPtr + 4, resultPtr + 36))
        };
    }
    return { checked: data.count >>> 0 };
}

self.onmessage = async ({ data }) => {
    try {
        self.postMessage({ requestId: data.requestId, ...(await mineBatch(data)) });
    } catch (error) {
        self.postMessage({ requestId: data.requestId, error: error.message || String(error) });
    }
};
