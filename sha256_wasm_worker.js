importScripts(new URL('sha256_miner.js', self.location.href).href);

let minerPromise;
async function getMiner() {
    if (!minerPromise) {
        minerPromise = GenesisMinerModule().then(miner => {
            miner.headerPtr = miner._malloc(80);
            miner.targetPtr = miner._malloc(32);
            miner.resultPtr = miner._malloc(36);
            return miner;
        });
    }
    return minerPromise;
}

self.onmessage = async ({ data }) => {
    try {
        const miner = await getMiner();
        miner.HEAPU8.set(data.header, miner.headerPtr);
        miner.HEAPU8.set(data.target, miner.targetPtr);
        const checked = miner._mine_batch(
            miner.headerPtr,
            miner.targetPtr,
            data.startNonce >>> 0,
            data.count >>> 0,
            data.stride >>> 0,
            miner.resultPtr
        );

        if (checked > 0) {
            const view = new DataView(miner.HEAPU8.buffer, miner.resultPtr, 36);
            const hash = Array.from(miner.HEAPU8.subarray(miner.resultPtr + 4, miner.resultPtr + 36));
            self.postMessage({
                requestId: data.requestId,
                checked,
                nonce: view.getUint32(0, true),
                hash
            });
        } else {
            self.postMessage({ requestId: data.requestId, checked: data.count >>> 0 });
        }
    } catch (error) {
        self.postMessage({ requestId: data.requestId, error: error.message || String(error) });
    }
};
