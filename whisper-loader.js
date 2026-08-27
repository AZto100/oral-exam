"use strict";

// S-OE1W Objective 3: whisper.cpp WASM runtime + local model loader.
// Generated Emscripten runtime: wasm/stream.js
// Quantized model: models/ggml-base.en-q5_1.bin
// The stream.wasm build uses pthreads, so cross-origin isolation is required.

window.WhisperAssetLoader = (() => {
  const RUNTIME_URL = "wasm/stream.js";
  const MODEL_URL = "models/ggml-base.en-q5_1.bin";
  const MODEL_FS_NAME = "whisper.bin";
  let moduleReadyPromise = null;
  let modelReadyPromise = null;
  let runtimeLoaded = false;
  let modelLoaded = false;

  function supportsWasm() {
    return typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
  }

  function supportsRequiredBrowserFeatures() {
    return supportsWasm() && typeof fetch === "function" && typeof Uint8Array === "function";
  }

  function assertThreadSupport() {
    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
      throw new Error(
        "Local Whisper needs cross-origin isolation for WASM threads. Make sure coi-serviceworker.js is deployed, then reload this page."
      );
    }
  }

  function installModuleHooks(onStatus) {
    if (window.Module && runtimeLoaded) return Promise.resolve(window.Module);
    if (moduleReadyPromise) return moduleReadyPromise;

    moduleReadyPromise = new Promise((resolve, reject) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        runtimeLoaded = true;
        resolve(window.Module);
      };

      window.Module = {
        print: (text) => console.log(`[whisper] ${text}`),
        printErr: (text) => console.error(`[whisper] ${text}`),
        setStatus: (text) => onStatus?.(text || "Preparing Whisper runtime..."),
        monitorRunDependencies: () => {},
        preRun: [() => onStatus?.("Initialising local Whisper runtime...")],
        postRun: [() => {
          onStatus?.("Local Whisper runtime initialised.");
          finish();
        }]
      };

      const script = document.createElement("script");
      script.src = RUNTIME_URL;
      script.async = true;
      script.onerror = () => reject(new Error(
        `Whisper runtime file was not found at ${RUNTIME_URL}. Run vendor-whisper-assets.ps1 before deployment.`
      ));
      document.head.appendChild(script);

      setTimeout(() => {
        if (!resolved && window.Module && typeof window.Module.FS_createDataFile === "function") finish();
      }, 15000);
    });

    return moduleReadyPromise;
  }

  async function fetchWithProgress(url, onProgress) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
    const total = Number(response.headers.get("content-length") || 0);
    if (!response.body || !response.body.getReader) {
      const buffer = new Uint8Array(await response.arrayBuffer());
      onProgress?.(buffer.length, total || buffer.length);
      return buffer;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.(received, total);
    }
    const out = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  function putModelInWasmFs(bytes) {
    const Module = window.Module;
    if (!Module || typeof Module.FS_createDataFile !== "function") {
      throw new Error("Whisper runtime filesystem is unavailable.");
    }
    try { Module.FS_unlink(MODEL_FS_NAME); } catch (_) {}
    Module.FS_createDataFile("/", MODEL_FS_NAME, bytes, true, true);
    modelLoaded = true;
  }

  async function loadModel(onStatus, onProgress) {
    if (modelLoaded) return;
    if (modelReadyPromise) return modelReadyPromise;
    modelReadyPromise = (async () => {
      onStatus?.("Loading local Whisper model...");
      const bytes = await fetchWithProgress(MODEL_URL, onProgress);
      putModelInWasmFs(bytes);
      onStatus?.(`Local Whisper model ready (${(bytes.length / 1024 / 1024).toFixed(1)} MB).`);
    })();
    return modelReadyPromise;
  }

  async function prepare({ onStatus, onProgress } = {}) {
    if (!supportsRequiredBrowserFeatures()) {
      throw new Error("This browser does not provide the WebAssembly features required by the local Whisper engine.");
    }
    assertThreadSupport();
    await installModuleHooks(onStatus);
    await loadModel(onStatus, onProgress);
    return {
      runtimeReady: runtimeLoaded,
      modelReady: modelLoaded,
      runtimeUrl: RUNTIME_URL,
      modelUrl: MODEL_URL,
      modelFsName: MODEL_FS_NAME
    };
  }

  return {
    prepare,
    get runtimeLoaded() { return runtimeLoaded; },
    get modelLoaded() { return modelLoaded; },
    RUNTIME_URL,
    MODEL_URL,
    MODEL_FS_NAME
  };
})();
