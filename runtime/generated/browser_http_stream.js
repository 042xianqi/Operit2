export function createBrowserHttpStreamHost() {
    const streams = new Map();
    function open(id, request, responseCallback, chunkCallback, closedCallback, requireSuccess) {
        if (streams.has(id))
            throw new Error(`HTTP byte stream is already open: ${id}`);
        const controller = new AbortController();
        streams.set(id, controller);
        void (async () => {
            let reader;
            let timer;
            let error = null;
            function timeout(seconds, phase) {
                clearTimeout(timer);
                timer = undefined;
                if (seconds && seconds > 0) {
                    timer = setTimeout(() => controller.abort(new Error(`HTTP ${phase} timed out`)), seconds * 1000);
                }
            }
            try {
                const headers = new Headers();
                for (const pair of request.headers || []) {
                    headers.set(Array.isArray(pair) ? pair[0] : pair.key, Array.isArray(pair) ? pair[1] : pair.value);
                }
                let body;
                if (request.fileParts?.length || request.formFields?.length) {
                    const form = new FormData();
                    for (const pair of request.formFields || []) {
                        form.append(Array.isArray(pair) ? pair[0] : pair.key, Array.isArray(pair) ? pair[1] : pair.value);
                    }
                    for (const part of request.fileParts || []) {
                        form.append(part.fieldName, new Blob([new Uint8Array(part.content).buffer], {
                            type: part.contentType,
                        }), part.fileName);
                    }
                    body = form;
                }
                else if (request.body?.length) {
                    body = new Uint8Array(request.body).buffer;
                }
                timeout(request.connectTimeoutSeconds, "response headers");
                const response = await fetch(request.url, {
                    method: request.method, headers, body, signal: controller.signal,
                    redirect: request.followRedirects ? "follow" : "manual",
                });
                clearTimeout(timer);
                timer = undefined;
                if (response.type === "opaque" || response.type === "opaqueredirect") {
                    throw new Error("HTTP response metadata is unavailable; check CORS and redirect policy");
                }
                if (requireSuccess && !response.ok)
                    throw new Error(`HTTP ${response.status}`);
                responseCallback({
                    finalUrl: response.url || request.url, statusCode: response.status,
                    statusMessage: response.statusText, headers: Array.from(response.headers.entries()),
                });
                if (controller.signal.aborted)
                    throw controller.signal.reason;
                if (response.body) {
                    reader = response.body.getReader();
                    while (true) {
                        timeout(request.readTimeoutSeconds, "response body");
                        const result = await reader.read();
                        if (controller.signal.aborted)
                            throw controller.signal.reason;
                        if (result.done)
                            break;
                        chunkCallback(Uint8Array.from(result.value));
                    }
                }
            }
            catch (cause) {
                error = String(controller.signal.aborted ? controller.signal.reason : cause);
            }
            finally {
                if (error !== null && !controller.signal.aborted)
                    controller.abort(new Error(error));
                clearTimeout(timer);
                reader?.releaseLock();
                streams.delete(id);
                closedCallback(error);
            }
        })();
    }
    return {
        openHttpByteStream(id, request, opened, chunk, closed) {
            open(id, request, () => opened(), chunk, closed, true);
        },
        openHttpResponseStream(id, request, response, chunk, closed) {
            open(id, request, response, chunk, closed, false);
        },
        closeHttpByteStream(id) {
            streams.get(id)?.abort(new Error("HTTP stream cancelled"));
        },
    };
}
