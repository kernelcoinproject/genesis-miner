// WebGPU double-SHA256 nonce scanner, adapted from the compute-shader approach
// in https://github.com/RustyBamboo/hash-shader (MIT, RustyBamboo).
// The shader specializes SHA-256 for this miner's 80-byte block header.
const SHA256_WEBGPU_SHADER = /* wgsl */ `
const K: array<u32, 64> = array<u32, 64>(
  0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
  0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
  0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
  0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
  0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
  0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
  0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
  0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u
);
const IV: array<u32, 8> = array<u32, 8>(
  0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,
  0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u
);
fn rotr(x: u32, n: u32) -> u32 { return (x >> n) | (x << (32u - n)); }
fn bswap(x: u32) -> u32 { return ((x & 0x000000ffu) << 24u) | ((x & 0x0000ff00u) << 8u) | ((x & 0x00ff0000u) >> 8u) | ((x & 0xff000000u) >> 24u); }
fn compress(state_in: array<u32, 8>, block: array<u32, 16>) -> array<u32, 8> {
  var w: array<u32, 64>;
  for (var i = 0u; i < 16u; i++) { w[i] = block[i]; }
  for (var i = 16u; i < 64u; i++) {
    let x = w[i - 15u]; let y = w[i - 2u];
    let s0 = rotr(x,7u) ^ rotr(x,18u) ^ (x >> 3u);
    let s1 = rotr(y,17u) ^ rotr(y,19u) ^ (y >> 10u);
    w[i] = w[i - 16u] + s0 + w[i - 7u] + s1;
  }
  var a=state_in[0]; var b=state_in[1]; var c=state_in[2]; var d=state_in[3];
  var e=state_in[4]; var f=state_in[5]; var g=state_in[6]; var h=state_in[7];
  for (var i = 0u; i < 64u; i++) {
    let s1=rotr(e,6u)^rotr(e,11u)^rotr(e,25u); let ch=(e&f)^((~e)&g);
    let t1=h+s1+ch+K[i]+w[i]; let s0=rotr(a,2u)^rotr(a,13u)^rotr(a,22u);
    let maj=(a&b)^(a&c)^(b&c); let t2=s0+maj;
    h=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
  }
  return array<u32,8>(state_in[0]+a,state_in[1]+b,state_in[2]+c,state_in[3]+d,state_in[4]+e,state_in[5]+f,state_in[6]+g,state_in[7]+h);
}
@group(0) @binding(0) var<storage, read> header: array<u32>;
@group(0) @binding(1) var<storage, read> target_words: array<u32>;
@group(0) @binding(2) var<storage, read_write> result: array<atomic<u32>>;
@compute @workgroup_size(64)
fn mine(@builtin(global_invocation_id) gid: vec3<u32>) {
  let nonce = params.start_nonce + gid.x;
  if (gid.x >= params.count || atomicLoad(&result[0]) != 0u) { return; }
  var block0: array<u32,16>;
  for (var i=0u;i<16u;i++) { block0[i]=bswap(header[i]); }
  var hash=compress(IV,block0);
  var block1: array<u32,16>;
  block1[0]=bswap(header[16]); block1[1]=bswap(header[17]); block1[2]=bswap(header[18]);
  block1[3]=bswap(nonce); block1[4]=0x80000000u;
  for (var i=5u;i<15u;i++) { block1[i]=0u; }
  block1[15]=640u;
  hash=compress(hash,block1);
  var block2: array<u32,16>;
  for (var i=0u;i<8u;i++) { block2[i]=hash[i]; }
  block2[8]=0x80000000u;
  for (var i=9u;i<15u;i++) { block2[i]=0u; }
  block2[15]=256u;
  let digest=compress(IV,block2);
  var less=false; var decided=false;
  for (var j=0u;j<8u;j++) {
    let index=7u-j; let word=bswap(digest[index]);
    if (!decided && word < target_words[j]) { less=true; decided=true; }
    if (!decided && word > target_words[j]) { decided=true; }
  }
  if (less) {
    let claim=atomicCompareExchangeWeak(&result[0],0u,1u);
    if (claim.exchanged) {
      atomicStore(&result[1],nonce);
      for (var i=0u;i<8u;i++) { atomicStore(&result[i+2u],digest[7u-i]); }
    }
  }
}
`;

// WGSL uniform values are in their own binding to avoid storage buffer limits.
const SHA256_WEBGPU_PARAMS = `struct Params { start_nonce: u32, count: u32, };\n@group(0) @binding(3) var<uniform> params: Params;`;

async function createSha256WebGpuMiner() {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable in this browser. Open the page on localhost and use a WebGPU-capable browser.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter was found.');
    const device = await adapter.requestDevice();
    const shader = device.createShaderModule({ code: SHA256_WEBGPU_PARAMS + SHA256_WEBGPU_SHADER });
    const compilationInfo = await shader.getCompilationInfo();
    const shaderErrors = compilationInfo.messages.filter(message => message.type === 'error');
    if (shaderErrors.length) {
        device.destroy();
        throw new Error(shaderErrors.map(message => `${message.lineNum}:${message.linePos} ${message.message}`).join('\n'));
    }
    const pipeline = await device.createComputePipelineAsync({
        layout: 'auto', compute: { module: shader, entryPoint: 'mine' }
    });
    const headerBuffer = device.createBuffer({ size: 19 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const targetBuffer = device.createBuffer({ size: 8 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const resultBuffer = device.createBuffer({ size: 10 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const readBuffer = device.createBuffer({ size: 10 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const paramsBuffer = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [headerBuffer, targetBuffer, resultBuffer, paramsBuffer].map((buffer, binding) => ({ binding, resource: { buffer } }))
    });
    const headerWords = new Uint32Array(19);
    const headerView = new DataView(headerWords.buffer);
    const targetWords = new Uint32Array(8);
    const zeroResult = new Uint32Array(10);
    const mappedResult = new Uint32Array(10);
    let disposed = false;

    return {
        async mineBatch(baseHeader, target, startNonce, count) {
            if (disposed) throw new Error('WebGPU miner is closed.');
            for (let i = 0; i < 19; i++) headerView.setUint32(i * 4, baseHeader[i * 4] | (baseHeader[i * 4 + 1] << 8) | (baseHeader[i * 4 + 2] << 16) | (baseHeader[i * 4 + 3] << 24), true);
            for (let i = 0; i < 8; i++) targetWords[i] = ((target[i*4] << 24) | (target[i*4+1] << 16) | (target[i*4+2] << 8) | target[i*4+3]) >>> 0;
            device.queue.writeBuffer(headerBuffer, 0, headerWords);
            device.queue.writeBuffer(targetBuffer, 0, targetWords);
            device.queue.writeBuffer(resultBuffer, 0, zeroResult);
            device.queue.writeBuffer(paramsBuffer, 0, new Uint32Array([startNonce >>> 0, count >>> 0]));
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(Math.ceil(count / 64));
            pass.end();
            encoder.copyBufferToBuffer(resultBuffer, 0, readBuffer, 0, 40);
            device.queue.submit([encoder.finish()]);
            await readBuffer.mapAsync(GPUMapMode.READ);
            mappedResult.set(new Uint32Array(readBuffer.getMappedRange()));
            readBuffer.unmap();
            return mappedResult[0] ? {
                nonce: mappedResult[1],
                hash: new Uint8Array(mappedResult.buffer.slice(8, 40)),
                checked: count
            } : { nonce: null, hash: null, checked: count };
        },
        close() {
            disposed = true;
            device.destroy();
        }
    };
}
