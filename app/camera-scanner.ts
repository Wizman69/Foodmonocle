export type CameraScanKind = "barcode" | "qr";

export { normalizeGtin } from "./barcode.ts";

export type CameraScanSession = {
  stop(): void;
};

export type CameraScanOptions = {
  kind: CameraScanKind;
  video: HTMLVideoElement;
  onCapture(value: string): void;
  onStatus?(message: string): void;
};

type NativeBarcode = { rawValue: string; format?: string };
type NativeBarcodeDetector = { detect(source: CanvasImageSource): Promise<NativeBarcode[]> };
type NativeBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?(): Promise<string[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: NativeBarcodeDetectorConstructor;
  }
}

const CORE_BARCODE_FORMATS = ["upc_a", "upc_e", "ean_8", "ean_13"];
const BARCODE_FORMATS = [...CORE_BARCODE_FORMATS, "itf", "code_128"];

export function isCameraInputSupported(navigatorValue: Pick<Navigator, "mediaDevices"> | undefined = globalThis.navigator) {
  return Boolean(navigatorValue?.mediaDevices?.getUserMedia);
}

export function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was denied. Allow camera access in browser settings, or type the barcode or use an uploaded QR image.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No usable camera was found. Type the barcode or use an uploaded QR image instead.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is busy or unavailable. Close other camera apps and try once more, or use a fallback input.";
  }
  return "Camera scanning could not start in this browser. Type the barcode or use an uploaded QR image instead.";
}

export function stopCameraMedia(video: Pick<HTMLVideoElement, "srcObject" | "pause">) {
  const stream = video.srcObject;
  if (stream && typeof (stream as MediaStream).getTracks === "function") {
    (stream as MediaStream).getTracks().forEach((track) => track.stop());
  }
  video.pause();
  video.srcObject = null;
}

export async function getNativeScannerFormats(
  kind: CameraScanKind,
  Detector: Pick<NativeBarcodeDetectorConstructor, "getSupportedFormats">,
): Promise<string[] | null> {
  const requested = kind === "qr" ? ["qr_code"] : BARCODE_FORMATS;
  if (!Detector.getSupportedFormats) return requested;
  try {
    const supported = new Set(await Detector.getSupportedFormats());
    const required = kind === "qr" ? ["qr_code"] : CORE_BARCODE_FORMATS;
    return required.every((format) => supported.has(format))
      ? requested.filter((format) => supported.has(format))
      : null;
  } catch {
    return null;
  }
}

function isNativeCapabilityError(error: unknown) {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  return error instanceof TypeError || name === "NotSupportedError";
}

async function startNativeScanner(
  options: CameraScanOptions,
  Detector: NativeBarcodeDetectorConstructor,
  formats: string[],
): Promise<CameraScanSession> {
  const detector = new Detector({ formats });
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    options.video.srcObject = stream;
    options.video.setAttribute("playsinline", "true");
    await options.video.play();
  } catch (error) {
    if (stream && options.video.srcObject === stream) stopCameraMedia(options.video);
    else stream?.getTracks().forEach((track) => track.stop());
    throw error;
  }

  let stopped = false;
  let frame = 0;
  let detecting = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    stopCameraMedia(options.video);
  };
  const scan = async () => {
    if (stopped) return;
    if (!detecting && options.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      detecting = true;
      try {
        const [result] = await detector.detect(options.video);
        if (result?.rawValue && !stopped) options.onCapture(result.rawValue.trim());
      } catch {
        // A frame can become unavailable while the camera is stopping; the next frame can still be read.
      } finally {
        detecting = false;
      }
    }
    if (!stopped) frame = requestAnimationFrame(scan);
  };
  options.onStatus?.("Camera active. Hold the code steady inside the frame.");
  frame = requestAnimationFrame(scan);
  return { stop };
}

async function startZxingScanner(options: CameraScanOptions): Promise<CameraScanSession> {
  const { BrowserMultiFormatReader, BrowserQRCodeReader } = await import("@zxing/browser");
  const reader = options.kind === "qr" ? new BrowserQRCodeReader() : new BrowserMultiFormatReader();
  let stopped = false;
  let controls;
  try {
    controls = await reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: "environment" } } },
      options.video,
      (result) => {
        if (result && !stopped) options.onCapture(result.getText().trim());
      },
    );
  } catch (error) {
    stopCameraMedia(options.video);
    throw error;
  }
  options.onStatus?.("Camera active. Hold the code steady inside the frame.");
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      controls.stop();
      stopCameraMedia(options.video);
    },
  };
}

export async function startCameraScanner(options: CameraScanOptions): Promise<CameraScanSession> {
  if (!isCameraInputSupported()) throw new DOMException("Camera API unavailable", "NotSupportedError");
  const Detector = window.BarcodeDetector;
  if (Detector) {
    const formats = await getNativeScannerFormats(options.kind, Detector);
    if (formats) {
      try {
        return await startNativeScanner(options, Detector, formats);
      } catch (error) {
        if (!isNativeCapabilityError(error)) throw error;
      }
    }
  }
  return startZxingScanner(options);
}
