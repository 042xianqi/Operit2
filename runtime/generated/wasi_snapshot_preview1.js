let wasmMemory;
const BAD_DESCRIPTOR = 8;
const ILLEGAL_SEEK = 70;
export function setWasiMemory(memory) {
    if (!(memory instanceof WebAssembly.Memory))
        throw new TypeError('WASI requires WebAssembly memory');
    wasmMemory = memory;
}
function memory() {
    if (wasmMemory === undefined)
        throw new Error('WASI memory has not been initialized');
    return wasmMemory;
}
function standardDescriptor(descriptor) { return Number.isInteger(descriptor) && descriptor >= 0 && descriptor <= 2; }
export function clock_time_get(clock, _precision, result) {
    const milliseconds = clock === 1 ? performance.timeOrigin + performance.now() : Date.now();
    new DataView(memory().buffer).setBigUint64(result, BigInt(Math.trunc(milliseconds)) * 1000000n, true);
    return 0;
}
export function fd_close(descriptor) { return standardDescriptor(descriptor) ? 0 : BAD_DESCRIPTOR; }
export function fd_fdstat_get(descriptor, result) {
    if (!standardDescriptor(descriptor))
        return BAD_DESCRIPTOR;
    new Uint8Array(memory().buffer, result, 24).fill(0);
    new DataView(memory().buffer).setUint8(result, 2);
    return 0;
}
export function fd_seek(descriptor, _offset, _whence, _result) {
    return standardDescriptor(descriptor) ? ILLEGAL_SEEK : BAD_DESCRIPTOR;
}
export function fd_write(descriptor, vectors, count, result) {
    if (descriptor !== 1 && descriptor !== 2)
        return BAD_DESCRIPTOR;
    const view = new DataView(memory().buffer);
    const decoder = new TextDecoder();
    let size = 0;
    for (let index = 0; index < count; index += 1) {
        const pointer = view.getUint32(vectors + index * 8, true);
        const length = view.getUint32(vectors + index * 8 + 4, true);
        const output = decoder.decode(new Uint8Array(memory().buffer, pointer, length), { stream: index + 1 < count });
        if (descriptor === 2)
            console.error(output);
        else
            console.log(output);
        size += length;
    }
    view.setUint32(result, size, true);
    return 0;
}
