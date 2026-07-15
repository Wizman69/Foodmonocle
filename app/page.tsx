"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
  Barcode,
  BookText,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  Gauge,
  History,
  Info,
  Leaf,
  LoaderCircle,
  Menu,
  Microscope,
  PackageSearch,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  ADDITIVE_DICTIONARY,
  CULTIVATED_SAMPLE_LABEL,
  DEMO_BARCODE,
  SAMPLE_LABEL,
  SECOND_SAMPLE_LABEL,
  SOURCE_REFERENCES,
  analyzeText,
  normalizeSavedReport,
  type FindingState,
  type ScanMode,
  type ScanReport,
} from "./food-intelligence";
import type { OpenFoodFactsLookupResult, OpenFoodFactsNutrition } from "./open-food-facts";

type RecallResult = {
  id: string;
  product: string;
  reason: string;
  company: string;
  classification: string;
  status: string;
  date: string;
  distribution: string;
};

type BarcodeProductLookup = Extract<OpenFoodFactsLookupResult, { status: "found" | "incomplete" }>;

function Logo() {
  return (
    <div className="brand-lockup" aria-label="FoodMonocle home">
      <span className="brand-mark" aria-hidden="true">
        <Search size={19} strokeWidth={2.6} />
      </span>
      <span className="brand-copy">
        <strong>FoodMonocle</strong>
        <small>Read between the labels.</small>
      </span>
    </div>
  );
}

function StatusIcon({ state }: { state: FindingState }) {
  if (state === "found") return <CheckCircle2 size={19} />;
  if (state === "not-found") return <Search size={19} />;
  return <CircleHelp size={19} />;
}

function statusLabel(state: FindingState) {
  if (state === "found") return "Found in supplied evidence";
  if (state === "not-found") return "Not found in supplied evidence";
  return "Not enough evidence";
}

function confidenceLabel(confidence: ScanReport["confidence"]) {
  if (confidence === "High") return "High evidence confidence";
  if (confidence === "Moderate") return "Moderate evidence confidence";
  return "Low evidence confidence";
}

function confidenceCopy(confidence: ScanReport["confidence"]) {
  if (confidence === "High") {
    return "Confidence reflects evidence coverage: enough supplied label text was available for this rule check.";
  }
  if (confidence === "Moderate") {
    return "Confidence reflects evidence coverage: useful text was available, but the scan may be partial or OCR-derived.";
  }
  return "Confidence reflects evidence coverage: the supplied text is short, indirect, or incomplete.";
}

function sourceIcon(source: ScanMode) {
  if (source === "photo") return <Camera size={14} />;
  if (source === "barcode") return <Barcode size={14} />;
  if (source === "qr") return <QrCode size={14} />;
  return <FileText size={14} />;
}

function safeHttpUrl(value?: string) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function formatRecallDate(value: string) {
  if (!/^\d{8}$/.test(value)) return value || "Date unavailable";
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00`);
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function hasBarcodeProduct(result: OpenFoodFactsLookupResult | null): result is BarcodeProductLookup {
  return Boolean(result && "product" in result);
}

function nutritionRows(nutrition: OpenFoodFactsNutrition) {
  return [
    ["Energy", nutrition.energyKcal100g, "kcal/100g"],
    ["Fat", nutrition.fat100g, "g/100g"],
    ["Carbs", nutrition.carbohydrates100g, "g/100g"],
    ["Sugars", nutrition.sugars100g, "g/100g"],
    ["Protein", nutrition.proteins100g, "g/100g"],
    ["Salt", nutrition.salt100g, "g/100g"],
  ].filter((row): row is [string, number, string] => typeof row[1] === "number");
}

function ProcessingMeter({ report, compact = false }: { report: ScanReport; compact?: boolean }) {
  return (
    <div className={`processing-meter ${compact ? "compact" : ""}`}>
      <div className="processing-meter-head">
        <div>
          <small>Formulation signal meter</small>
          <strong>{report.processingLabel}</strong>
        </div>
        <span>{report.processingLevel}/4</span>
      </div>
      <div className="meter-segments" aria-label={`${report.processingLevel} of 4 formulation signal level`}>
        {[1, 2, 3, 4].map((level) => (
          <span key={level} className={report.processingLevel >= level ? "filled" : ""} />
        ))}
      </div>
      {!compact && (
        <p>
          Based only on supported ingredient markers. This describes formulation complexity; it is not dietary advice or a risk score.
        </p>
      )}
    </div>
  );
}

function BarcodeLookupCard({
  lookup,
  onPhotoFallback,
  onTextFallback,
}: {
  lookup: OpenFoodFactsLookupResult;
  onPhotoFallback: () => void;
  onTextFallback: () => void;
}) {
  const retrieved = formatDateTime(lookup.source.retrievedAt);

  if (!hasBarcodeProduct(lookup)) {
    return (
      <div className={`barcode-record ${lookup.status}`}>
        <div className="barcode-record-head">
          <span><Database size={15} /> {lookup.source.name}</span>
          <strong>{lookup.status === "not-found" ? "No product record found" : "Barcode source unavailable"}</strong>
        </div>
        <p>{lookup.message}</p>
        <p>{lookup.fallbackPrompt}</p>
        <div className="barcode-source-row">
          <a href={lookup.source.url} target="_blank" rel="noreferrer">Source URL <ExternalLink size={13} /></a>
          <span>Retrieved {retrieved}</span>
        </div>
        <div className="fallback-actions">
          <button type="button" onClick={onPhotoFallback}><Camera size={15} /> Use photo OCR</button>
          <button type="button" onClick={onTextFallback}><FileText size={15} /> Enter label text</button>
        </div>
      </div>
    );
  }

  const rows = nutritionRows(lookup.product.nutrition);

  return (
    <div className={`barcode-record ${lookup.status}`}>
      <div className="barcode-record-head">
        <span><Database size={15} /> {lookup.source.name}</span>
        <strong>{lookup.product.name}</strong>
      </div>
      <div className="barcode-record-grid">
        <span><small>Brand</small>{lookup.product.brand || "Not supplied"}</span>
        <span><small>Barcode</small>{lookup.product.barcode}</span>
      </div>
      <div className="barcode-field">
        <small>Ingredients</small>
        <p>{lookup.product.ingredientsText || "Ingredients were not supplied in this Open Food Facts record."}</p>
      </div>
      <div className="barcode-field">
        <small>Labels and available disclosure information</small>
        <p>{[...lookup.product.labels, lookup.product.disclosureText].filter(Boolean).join("; ") || "No label or disclosure fields were supplied in this record."}</p>
      </div>
      <div className="nutrition-grid">
        {rows.length ? rows.map(([label, value, unit]) => (
          <span key={label}><small>{label}</small>{value} {unit}</span>
        )) : <span><small>Nutrition</small>Not supplied</span>}
      </div>
      {lookup.warnings.length > 0 && (
        <div className="barcode-warnings">
          {lookup.warnings.map((warning) => <span key={warning}><Info size={13} /> {warning}</span>)}
        </div>
      )}
      <p className="source-caveat"><Database size={14} /> {lookup.source.description}</p>
      <div className="barcode-source-row">
        <a href={lookup.source.url} target="_blank" rel="noreferrer">Source URL <ExternalLink size={13} /></a>
        <span>Retrieved {retrieved}</span>
      </div>
      {lookup.status === "incomplete" && (
        <div className="fallback-actions">
          <button type="button" onClick={onPhotoFallback}><Camera size={15} /> Use photo OCR</button>
          <button type="button" onClick={onTextFallback}><FileText size={15} /> Enter label text</button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<ScanMode>("photo");
  const [ingredients, setIngredients] = useState("");
  const [productName, setProductName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [barcodeLookup, setBarcodeLookup] = useState<OpenFoodFactsLookupResult | null>(null);
  const [qrValue, setQrValue] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageBytes, setImageBytes] = useState<ArrayBuffer | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [history, setHistory] = useState<ScanReport[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState("");
  const [scanProgress, setScanProgress] = useState(0);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [dictionaryQuery, setDictionaryQuery] = useState("");
  const [recallsOpen, setRecallsOpen] = useState(false);
  const [recallQuery, setRecallQuery] = useState("");
  const [recallResults, setRecallResults] = useState<RecallResult[]>([]);
  const [recallStatus, setRecallStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [recallError, setRecallError] = useState("");
  const [recallCheckedAt, setRecallCheckedAt] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState("");
  const [compareRightId, setCompareRightId] = useState("");

  useEffect(() => {
    const restoreHistory = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("foodmonocle-history");
        const parsed = saved ? (JSON.parse(saved) as ScanReport[]) : [];
        setHistory(parsed.map(normalizeSavedReport));
      } catch {
        setHistory([]);
      }
    }, 0);
    return () => window.clearTimeout(restoreHistory);
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setHistoryOpen(false);
      setLearnOpen(false);
      setDictionaryOpen(false);
      setRecallsOpen(false);
      setCompareOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const canScan = useMemo(() => {
    if (mode === "barcode") return barcode.trim().length >= 8;
    if (mode === "photo") return Boolean(imageBytes) || ingredients.trim().length >= 20;
    if (mode === "qr") return Boolean(imageUrl) || qrValue.trim().length >= 4;
    return ingredients.trim().length >= 20;
  }, [barcode, imageBytes, imageUrl, ingredients, mode, qrValue]);

  const dictionaryItems = useMemo(() => {
    const query = dictionaryQuery.toLowerCase().trim();
    if (!query) return ADDITIVE_DICTIONARY;
    return ADDITIVE_DICTIONARY.filter((item) =>
      [item.name, item.purpose, item.family, ...item.aliases].some((value) => value.toLowerCase().includes(query)),
    );
  }, [dictionaryQuery]);

  const compareReports = useMemo(() => {
    const all = report ? [report, ...history] : history;
    return all.filter((item, index) => all.findIndex((candidate) => candidate.id === item.id) === index);
  }, [history, report]);

  const leftReport = compareReports.find((item) => item.id === compareLeftId) || null;
  const rightReport = compareReports.find((item) => item.id === compareRightId) || null;

  const onImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setScanStage("");
    try {
      const nextImageBytes = await file.arrayBuffer();
      const nextImageUrl = URL.createObjectURL(new Blob([nextImageBytes], { type: file.type || "image/jpeg" }));
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageName(file.name);
      setImageBytes(nextImageBytes);
      setImageUrl(nextImageUrl);
    } catch {
      setImageBytes(null);
      setError("This image could not be read. Try choosing it again or use the text scanner.");
    }
  };

  const storeHistory = (nextHistory: ScanReport[]) => {
    setHistory(nextHistory);
    try {
      window.localStorage.setItem("foodmonocle-history", JSON.stringify(nextHistory));
    } catch {
      // Reports remain available in the current session when storage is blocked.
    }
  };

  const persistReport = (nextReport: ScanReport) => {
    const nextHistory = [nextReport, ...history.filter((item) => item.id !== nextReport.id)].slice(0, 12);
    storeHistory(nextHistory);
  };

  const readPhotoText = async (imageBuffer: ArrayBuffer) => {
    setScanStage("Preparing on-device text reader");
    setScanProgress(4);
    const { createWorker, OEM } = await import("tesseract.js");
    const worker = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core/tesseract-core-lstm.wasm.js",
      langPath: "/tesseract/lang",
      gzip: true,
      logger: (message) => {
        if (message.status === "recognizing text") {
          setScanStage("Reading words from the label");
          setScanProgress(Math.max(12, Math.round(message.progress * 100)));
        } else if (message.status) {
          setScanStage("Loading the on-device text reader");
          setScanProgress((current) => Math.max(current, 8));
        }
      },
    });

    try {
      const result = await worker.recognize(new Uint8Array(imageBuffer), { rotateAuto: true });
      return result.data.text.replace(/\n{3,}/g, "\n\n").trim();
    } finally {
      await worker.terminate();
    }
  };

  const decodeQrImage = async (url: string) => {
    setScanStage("Decoding QR disclosure");
    setScanProgress(35);
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const reader = new BrowserQRCodeReader();
    const result = await reader.decodeFromImageUrl(url);
    setScanProgress(90);
    return result.getText().trim();
  };

  const finishReport = (nextReport: ScanReport) => {
    setReport(nextReport);
    persistReport(nextReport);
    setScanProgress(100);
    window.setTimeout(() => {
      document.getElementById("scan-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const runScan = async () => {
    setError("");
    setIsScanning(true);
    setScanProgress(2);
    setScanStage("Preparing scan");

    try {
      let scanText = ingredients.trim();
      let sourceLabel = "Supplied package text";
      let decodedQr = "";
      let qrUrl = "";
      let reportProductName = productName.trim() || undefined;

      if (mode === "barcode") {
        const cleanBarcode = barcode.replace(/\D/g, "");
        if (cleanBarcode.length < 8) throw new Error("Enter a valid UPC or EAN barcode.");
        setScanStage("Checking Open Food Facts");
        setScanProgress(45);
        const response = await fetch(`/api/barcode?barcode=${encodeURIComponent(cleanBarcode)}`);
        const lookup = (await response.json()) as OpenFoodFactsLookupResult | { error?: string };
        if ("error" in lookup && lookup.error) throw new Error(lookup.error);
        const nextLookup = lookup as OpenFoodFactsLookupResult;
        setBarcodeLookup(nextLookup);
        if (!hasBarcodeProduct(nextLookup)) {
          setError(`${nextLookup.message} ${nextLookup.fallbackPrompt}`);
          return;
        }
        setScanStage("Reviewing Open Food Facts record");
        setScanProgress(72);
        scanText = nextLookup.analysisText;
        setIngredients(scanText);
        setProductName(nextLookup.product.name);
        reportProductName = nextLookup.product.name;
        sourceLabel = `${nextLookup.source.name} community record retrieved ${formatDateTime(nextLookup.source.retrievedAt)}`;
      }

      if (mode === "photo" && scanText.length < 20) {
        if (!imageBytes) throw new Error("Add a clear photo of the ingredient and disclosure panel.");
        scanText = await readPhotoText(imageBytes);
        if (scanText.length < 20) {
          throw new Error("The photo did not produce enough readable text. Retake it closer and in even light, or type the label text below.");
        }
        setIngredients(scanText);
        sourceLabel = `On-device OCR from ${imageName || "label photo"}`;
      } else if (mode === "photo") {
        sourceLabel = imageName ? `Reviewed text from ${imageName}` : "Supplied package text";
      }

      if (mode === "qr") {
        decodedQr = qrValue.trim();
        if (imageUrl) {
          try {
            decodedQr = await decodeQrImage(imageUrl);
            setQrValue(decodedQr);
          } catch {
            if (!decodedQr) {
              throw new Error("No readable QR code was found. Retake the photo straight-on, or paste the destination shown by your phone camera.");
            }
          }
        }
        if (!decodedQr) throw new Error("Add a QR photo or paste its destination or disclosure text.");
        qrUrl = safeHttpUrl(decodedQr);
        scanText = decodedQr;
        sourceLabel = imageName ? `QR decoded from ${imageName}` : "Supplied digital disclosure";
      }

      if (scanText.length < 20 && mode !== "qr") {
        throw new Error("Add enough ingredient and disclosure text for a reliable scan.");
      }

      setScanStage("Building evidence report");
      setScanProgress(94);
      const nextReport = analyzeText(scanText, mode, {
        productName: reportProductName,
        barcode: mode === "barcode" ? barcode : undefined,
        qrUrl: qrUrl || undefined,
        sourceLabel,
        limitedEvidence: mode === "barcode",
      });
      finishReport(nextReport);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The scan could not be completed.";
      setError(message);
    } finally {
      setIsScanning(false);
      window.setTimeout(() => setScanStage(""), 500);
    }
  };

  const loadSample = (kind: "standard" | "cultivated" = "standard") => {
    setMode("ingredients");
    setIngredients(kind === "cultivated" ? CULTIVATED_SAMPLE_LABEL : SAMPLE_LABEL);
    setProductName(kind === "cultivated" ? "Cultivated chicken bites" : "Colorful corn snack");
    setBarcode("");
    setQrValue("");
    setError("");
    setReport(null);
  };

  const loadDemoBarcode = () => {
    setMode("barcode");
    setBarcode(DEMO_BARCODE);
    setProductName("");
    setIngredients("");
    setBarcodeLookup(null);
    setError("");
    setReport(null);
  };

  const usePhotoFallback = () => {
    setMode("photo");
    setError("");
    setScanStage("");
  };

  const useTextFallback = () => {
    setMode("ingredients");
    setError("");
    setScanStage("");
  };

  const startOver = () => {
    setReport(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openSavedReport = (savedReport: ScanReport) => {
    setReport(savedReport);
    setHistoryOpen(false);
    window.setTimeout(() => {
      document.getElementById("scan-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const openDictionary = (query = "") => {
    setDictionaryQuery(query);
    setDictionaryOpen(true);
  };

  const openRecallWatch = (query = "") => {
    const usefulName = query && !query.toLowerCase().includes("scanned food label") ? query : "";
    setRecallQuery(usefulName);
    setRecallResults([]);
    setRecallStatus("idle");
    setRecallError("");
    setRecallsOpen(true);
  };

  const searchRecalls = async () => {
    const query = recallQuery.trim();
    if (query.length < 2) {
      setRecallStatus("error");
      setRecallError("Enter a product, brand, or company name.");
      return;
    }
    setRecallStatus("loading");
    setRecallError("");
    try {
      const response = await fetch(`/api/recalls?q=${encodeURIComponent(query)}`);
      const data = (await response.json()) as { results?: RecallResult[]; checkedAt?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Recall search is temporarily unavailable.");
      setRecallResults(data.results || []);
      setRecallCheckedAt(data.checkedAt || new Date().toISOString());
      setRecallStatus("done");
    } catch (caught) {
      setRecallStatus("error");
      setRecallError(caught instanceof Error ? caught.message : "Recall search is temporarily unavailable.");
    }
  };

  const openCompare = () => {
    setCompareLeftId((current) => current || compareReports[0]?.id || "");
    setCompareRightId((current) => current || compareReports[1]?.id || "");
    setCompareOpen(true);
  };

  const loadCompareExamples = () => {
    const left = analyzeText(SAMPLE_LABEL, "ingredients", { productName: "Colorful corn snack" });
    const right = analyzeText(SECOND_SAMPLE_LABEL, "ingredients", { productName: "Simple corn chips" });
    const nextHistory = [left, right, ...history].slice(0, 12);
    storeHistory(nextHistory);
    setCompareLeftId(left.id);
    setCompareRightId(right.id);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <Logo />
        <nav className="desktop-nav" aria-label="Primary navigation">
          <button className="nav-button" type="button" onClick={() => openDictionary()}>
            <BookText size={17} /> Additives
          </button>
          <button className="nav-button" type="button" onClick={() => openRecallWatch(report?.productName || "")}>
            <TriangleAlert size={17} /> Recalls
          </button>
          <button className="nav-button" type="button" onClick={openCompare}>
            <ArrowRightLeft size={17} /> Compare
          </button>
          <button className="nav-button" type="button" onClick={() => setHistoryOpen(true)}>
            <History size={17} /> History <span className="count-badge">{history.length}</span>
          </button>
          <button className="method-link" type="button" onClick={() => setLearnOpen(true)} aria-label="How FoodMonocle works">
            <CircleHelp size={18} />
          </button>
          <span className="beta-badge">Beta 0.2</span>
        </nav>
        <button className="mobile-menu" type="button" onClick={() => setLearnOpen(true)} aria-label="Open FoodMonocle method">
          <Menu size={22} />
        </button>
      </header>

      <section className="workspace">
        <div className="intro-column">
          <div className="eyebrow"><ScanLine size={15} /> Label intelligence, in plain English</div>
          <h1>See what the label <span>really says.</span></h1>
          <p className="intro-copy">
            Photograph a package or scan its QR disclosure. FoodMonocle finds bioengineered wording, cultivated meat terms,
            formulation markers, additives, allergens, and the evidence behind every result.
          </p>

          <div className="trust-row" aria-label="Product principles">
            <span><ShieldCheck size={16} /> On-device photo reading</span>
            <span><Microscope size={16} /> Exact evidence shown</span>
            <span><Leaf size={16} /> No fear scoring</span>
          </div>

          <div className="scope-panel">
            <div className="scope-heading">
              <strong>What one scan checks</strong>
              <button type="button" onClick={() => setLearnOpen(true)}>View method <ChevronRight size={15} /></button>
            </div>
            <div className="scope-grid">
              <span><FlaskConical size={18} /> Bioengineered disclosure</span>
              <span><Microscope size={18} /> Cultivated ingredients</span>
              <span><Gauge size={18} /> Processing signals</span>
              <span><QrCode size={18} /> QR disclosures</span>
              <span><BookText size={18} /> Additive explanations</span>
              <span><TriangleAlert size={18} /> FDA recall search</span>
            </div>
          </div>
        </div>

        <div className="scanner-panel" aria-label="Food label scanner">
          <div className="scanner-head">
            <div>
              <span className="step-label">New scan</span>
              <h2>Choose an input</h2>
            </div>
            <span className="privacy-pill"><ShieldCheck size={14} /> Photos stay on device</span>
          </div>

          <div className="mode-tabs four-tabs" role="tablist" aria-label="Scan input type">
            <button className={mode === "photo" ? "active" : ""} type="button" role="tab" aria-selected={mode === "photo"} onClick={() => { setMode("photo"); setError(""); }}>
              <Camera size={17} /> Photo
            </button>
            <button className={mode === "barcode" ? "active" : ""} type="button" role="tab" aria-selected={mode === "barcode"} onClick={() => { setMode("barcode"); setError(""); }}>
              <Barcode size={17} /> Barcode
            </button>
            <button className={mode === "qr" ? "active" : ""} type="button" role="tab" aria-selected={mode === "qr"} onClick={() => { setMode("qr"); setError(""); }}>
              <QrCode size={17} /> QR
            </button>
            <button className={mode === "ingredients" ? "active" : ""} type="button" role="tab" aria-selected={mode === "ingredients"} onClick={() => { setMode("ingredients"); setError(""); }}>
              <FileText size={17} /> Text
            </button>
          </div>

          {(mode === "photo" || mode === "qr") && (
            <div className="input-stack">
              <label className={`upload-zone ${imageUrl ? "has-image" : ""}`}>
                <input type="file" accept="image/*" onChange={onImage} />
                {imageUrl ? (
                  <>
                    <Image src={imageUrl} alt={mode === "qr" ? "Selected QR code" : "Selected food label"} fill unoptimized />
                    <span className="replace-photo"><Camera size={16} /> Replace photo</span>
                  </>
                ) : (
                  <>
                    <span className="upload-icon">{mode === "qr" ? <QrCode size={25} /> : <Camera size={25} />}</span>
                    <strong>{mode === "qr" ? "Photograph the package QR code" : "Photograph the ingredient panel"}</strong>
                    <span>{mode === "qr" ? "Keep the code square and in focus" : "Include ingredients, claims, and disclosure wording"}</span>
                    <em><Upload size={15} /> Open camera or photos</em>
                  </>
                )}
              </label>

              {mode === "photo" ? (
                <>
                  <label className="text-field compact-field">
                    <span>Product or brand name <small>optional, useful for recalls</small></span>
                    <input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Example: Green Valley corn chips" />
                  </label>
                  <label className="text-field">
                    <span>Review or correct detected text <small>optional before first scan</small></span>
                    <textarea value={ingredients} onChange={(event) => setIngredients(event.target.value)} placeholder="Photo text will appear here after scanning..." rows={3} />
                  </label>
                </>
              ) : (
                <label className="text-field">
                  <span>QR destination or disclosure text <small>optional when a photo is added</small></span>
                  <textarea value={qrValue} onChange={(event) => setQrValue(event.target.value)} placeholder="Paste the decoded URL or the disclosure text it opens..." rows={3} />
                </label>
              )}
            </div>
          )}

          {mode === "barcode" && (
            <div className="barcode-panel">
              <span className="barcode-graphic"><Barcode size={42} /></span>
              <label className="text-field">
                <span>UPC or EAN barcode</span>
                <div className="barcode-input-wrap">
                  <Barcode size={20} />
                  <input inputMode="numeric" value={barcode} onChange={(event) => { setBarcode(event.target.value.replace(/\D/g, "")); setBarcodeLookup(null); }} placeholder="Enter the number below the bars" />
                </div>
              </label>
              <button className="text-action" type="button" onClick={loadDemoBarcode}>Use demo barcode <span>{DEMO_BARCODE}</span></button>
              <p className="source-caveat"><Database size={14} /> Barcode lookup uses Open Food Facts, a third-party, community-maintained source. Missing fields are not absence evidence.</p>
              {barcodeLookup && (
                <BarcodeLookupCard lookup={barcodeLookup} onPhotoFallback={usePhotoFallback} onTextFallback={useTextFallback} />
              )}
            </div>
          )}

          {mode === "ingredients" && (
            <div className="input-stack">
              <label className="text-field compact-field">
                <span>Product or brand name <small>optional, useful for recalls</small></span>
                <input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Example: Green Valley corn chips" />
              </label>
              <label className="text-field large-text-field">
                <span>Ingredients and package disclosures</span>
                <textarea value={ingredients} onChange={(event) => setIngredients(event.target.value)} placeholder="Example: Ingredients: corn, canola oil... Contains bioengineered food ingredients." rows={7} />
              </label>
              <div className="sample-actions">
                <button className="text-action sample-action" type="button" onClick={() => loadSample("standard")}>
                  <Sparkles size={16} /> Standard sample
                </button>
                <button className="text-action sample-action" type="button" onClick={() => loadSample("cultivated")}>
                  <Microscope size={16} /> Cultivated-meat sample
                </button>
              </div>
            </div>
          )}

          {error && <div className="form-error" role="alert"><Info size={17} /> {error}</div>}

          {isScanning && (
            <div className="scan-progress" aria-live="polite">
              <div><span>{scanStage}</span><strong>{scanProgress}%</strong></div>
              <div className="scan-progress-track"><span style={{ width: `${scanProgress}%` }} /></div>
            </div>
          )}

          <div className="scan-actions">
            <button className="scan-button" type="button" disabled={!canScan || isScanning} onClick={runScan}>
              {isScanning ? <><LoaderCircle className="spin" size={19} /> Reading evidence...</> : <><ScanLine size={19} /> Analyze this food</>}
            </button>
            <p><Info size={14} /> Educational label analysis, not medical or dietary advice and not a recall clearance.</p>
          </div>
        </div>
      </section>

      {report ? (
        <section className="result-section" id="scan-result">
          <div className="result-titlebar">
            <button className="back-button" type="button" onClick={startOver}><ArrowLeft size={18} /> New scan</button>
            <div className="result-title">
              <span>FoodMonocle evidence report</span>
              <h2>{report.productName}</h2>
            </div>
            <div className="result-actions">
              <button type="button" onClick={openCompare}><ArrowRightLeft size={15} /> Compare</button>
              <span className="confidence-stamp"><Check size={16} /> {confidenceLabel(report.confidence)}</span>
            </div>
          </div>

          <div className="result-layout">
            <aside className="verdict-panel">
              <div className="score-ring" style={{ "--score": `${report.clarityScore * 3.6}deg` } as React.CSSProperties}>
                <div><strong>{report.clarityScore}</strong><span>Label clarity</span></div>
              </div>
              <h3>What the evidence says</h3>
              <p>{report.summary}</p>
              <div className="source-stamp">
                {sourceIcon(report.source)}
                <span><small>Read from</small>{report.sourceLabel}</span>
                <span><small>Scan date</small>{new Date(report.createdAt).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
              <div className="verdict-actions">
                <button type="button" onClick={() => openRecallWatch(report.productName)}><TriangleAlert size={15} /> Check recalls</button>
                <button type="button" onClick={() => openDictionary()}><BookText size={15} /> Additive guide</button>
              </div>
              <div className="score-note"><Info size={16} /> Label clarity measures supplied evidence. It is not a nutrition grade.</div>
              <div className="score-note"><Info size={16} /> {confidenceCopy(report.confidence)}</div>
            </aside>

            <div className="finding-column">
              <div className="finding-grid three-up">
                <article className={`finding-card ${report.bioengineered}`}>
                  <span className="finding-icon"><FlaskConical size={21} /></span>
                  <div><small>Bioengineered disclosure</small><strong>{statusLabel(report.bioengineered)}</strong></div>
                  <StatusIcon state={report.bioengineered} />
                </article>
                <article className={`finding-card ${report.cultivated}`}>
                  <span className="finding-icon"><Microscope size={21} /></span>
                  <div><small>Cultivated or cell-cultured meat</small><strong>{statusLabel(report.cultivated)}</strong></div>
                  <StatusIcon state={report.cultivated} />
                </article>
                <article className={`finding-card ${report.digitalDisclosure}`}>
                  <span className="finding-icon"><QrCode size={21} /></span>
                  <div><small>QR or digital disclosure</small><strong>{statusLabel(report.digitalDisclosure)}</strong></div>
                  <StatusIcon state={report.digitalDisclosure} />
                </article>
                <article className="finding-card neutral">
                  <span className="finding-icon"><Gauge size={21} /></span>
                  <div><small>Formulation signals</small><strong>{report.processingMarkers.length} marker{report.processingMarkers.length === 1 ? "" : "s"} detected</strong></div>
                  <span className="finding-count">{report.processingLevel}</span>
                </article>
                <article className="finding-card neutral">
                  <span className="finding-icon"><BookText size={21} /></span>
                  <div><small>Additives explained</small><strong>{report.additives.length ? report.additives.map((item) => item.name).join(", ") : "None in supported guide"}</strong></div>
                  <span className="finding-count">{report.additives.length}</span>
                </article>
                <article className="finding-card neutral">
                  <span className="finding-icon"><AlertCircle size={21} /></span>
                  <div><small>Major allergens named</small><strong>{report.allergens.length ? report.allergens.join(", ") : "None found in text"}</strong></div>
                  <span className="finding-count">{report.allergens.length}</span>
                </article>
              </div>

              {report.source === "barcode" && barcodeLookup && (
                <article className="detail-card barcode-source-card">
                  <div className="detail-heading">
                    <div><span className="section-number">OFF</span><h3>Open Food Facts record</h3></div>
                    <span>Third-party source</span>
                  </div>
                  <BarcodeLookupCard lookup={barcodeLookup} onPhotoFallback={usePhotoFallback} onTextFallback={useTextFallback} />
                </article>
              )}

              <article className="detail-card evidence-section">
                <div className="detail-heading">
                  <div><span className="section-number">01</span><h3>Evidence cards</h3></div>
                  <span>Finding, source, and confidence</span>
                </div>
                <div className="evidence-grid">
                  {report.evidence.map((item) => {
                    const directUrl = item.id === "digital" ? safeHttpUrl(report.qrUrl) : "";
                    return (
                      <div className={`evidence-card ${item.state}`} key={item.id}>
                        <div className="evidence-card-head">
                          <span>{item.category}</span>
                          <strong><StatusIcon state={item.state} /> {item.headline}</strong>
                        </div>
                        <blockquote>{item.evidence}</blockquote>
                        <div className="evidence-meta">
                          <span>{sourceIcon(report.source)} {item.source}</span>
                          <span>{confidenceLabel(item.confidence)}</span>
                          {item.sourceLastReviewed && <span>Last reviewed {item.sourceLastReviewed}</span>}
                        </div>
                        <div className="evidence-links">
                          {directUrl && <a href={directUrl} target="_blank" rel="noreferrer">Open QR destination <ExternalLink size={14} /></a>}
                          {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Official reference <ExternalLink size={14} /></a>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="evidence-limit"><Info size={15} /> “Not found” means not found in the supplied image or text. It never proves an ingredient or process is absent.</p>
              </article>

              <article className="detail-card">
                <div className="detail-heading">
                  <div><span className="section-number">02</span><h3>Additive dictionary matches</h3></div>
                  <button className="inline-link" type="button" onClick={() => openDictionary()}>Open full guide <ChevronRight size={14} /></button>
                </div>
                {report.additives.length ? (
                  <div className="additive-list">
                    {report.additives.map((item) => (
                      <button className="additive-row" type="button" key={item.name} onClick={() => openDictionary(item.name)}>
                        <span className="dot" />
                        <div><strong>{item.name}</strong><small>{item.purpose}</small></div>
                        <p>{item.note}</p>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-detail">No entries from the current FoodMonocle additive guide were found in the supplied text.</p>
                )}
              </article>

              <article className="detail-card">
                <div className="detail-heading">
                  <div><span className="section-number">03</span><h3>Ultra-processing signals</h3></div>
                  <span>Ingredient-list view only</span>
                </div>
                <ProcessingMeter report={report} />
                <div className="tag-list processing-tags">
                  {report.processingMarkers.length ? report.processingMarkers.map((marker) => <span key={marker}>{marker}</span>) : <span className="quiet-tag">No supported markers detected</span>}
                </div>
              </article>

              <article className="next-steps-card">
                <div>
                  <span className="section-number">04</span>
                  <h3>Make this report stronger</h3>
                </div>
                <ul>
                  <li><CheckCircle2 size={17} /> Check OCR text against the physical package, especially allergen wording.</li>
                  <li><CheckCircle2 size={17} /> Scan the full back panel; disclosures may sit away from ingredients.</li>
                  <li><CheckCircle2 size={17} /> Open any QR destination and scan the disclosure text it contains.</li>
                </ul>
              </article>
            </div>
          </div>
        </section>
      ) : (
        <section className="roadmap-strip" aria-label="FoodMonocle tools">
          <div className="roadmap-lead"><PackageSearch size={23} /><div><small>Now built in</small><strong>Deeper evidence at the shelf</strong></div></div>
          <button className="roadmap-item" type="button" onClick={() => openRecallWatch()}><span>01</span><div><strong>Recall watch</strong><small>Search FDA food enforcement records</small></div></button>
          <button className="roadmap-item" type="button" onClick={openCompare}><span>02</span><div><strong>Compare products</strong><small>See disclosure and formulation differences</small></div></button>
          <button className="roadmap-item" type="button" onClick={() => openDictionary()}><span>03</span><div><strong>Additive dictionary</strong><small>Search functions and plain-English notes</small></div></button>
        </section>
      )}

      <footer className="site-footer">
        <Logo />
        <p>Independent, cautious food-label education. FoodMonocle explains disclosed evidence without judging personal suitability.</p>
        <div><button type="button" onClick={() => setLearnOpen(true)}>Method & sources</button><span>Beta 0.2</span></div>
      </footer>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className="active" type="button" onClick={startOver}><ScanLine size={19} /><span>Scan</span></button>
        <button type="button" onClick={openCompare}><ArrowRightLeft size={19} /><span>Compare</span></button>
        <button type="button" onClick={() => openDictionary()}><BookText size={19} /><span>Additives</span></button>
        <button type="button" onClick={() => openRecallWatch(report?.productName || "")}><TriangleAlert size={19} /><span>Recalls</span></button>
        <button type="button" onClick={() => setHistoryOpen(true)}><History size={19} /><span>History</span></button>
      </nav>

      {historyOpen && (
        <div className="modal-scrim" role="presentation" onMouseDown={() => setHistoryOpen(false)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Scan history" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head"><div><small>Your library</small><h2>Scan history</h2></div><button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history"><X size={21} /></button></div>
            {history.length ? (
              <div className="history-list">
                {history.map((item) => (
                  <button type="button" key={item.id} onClick={() => openSavedReport(item)}>
                    <span className="history-icon">{sourceIcon(item.source)}</span>
                    <span><strong>{item.productName}</strong><small><Clock3 size={13} /> {new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span>
                    <span className="history-score">{item.clarityScore}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state"><History size={32} /><h3>No scans yet</h3><p>Your recent evidence reports will stay on this device.</p></div>
            )}
            <div className="drawer-privacy"><ShieldCheck size={17} /><p><strong>Local history</strong><br />Scan reports are stored in this browser, not uploaded to an account.</p></div>
          </aside>
        </div>
      )}

      {dictionaryOpen && (
        <div className="modal-scrim centered" role="presentation" onMouseDown={() => setDictionaryOpen(false)}>
          <section className="feature-modal dictionary-modal" role="dialog" aria-modal="true" aria-label="Additive dictionary" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head"><div><small>Plain-English reference</small><h2>Additive dictionary</h2></div><button type="button" onClick={() => setDictionaryOpen(false)} aria-label="Close dictionary"><X size={21} /></button></div>
            <label className="modal-search">
              <Search size={18} />
              <input aria-label="Search additive dictionary" value={dictionaryQuery} onChange={(event) => setDictionaryQuery(event.target.value)} placeholder="Search an additive, purpose, or family" autoFocus />
              <span>{dictionaryItems.length}</span>
            </label>
            <div className="dictionary-list">
              {dictionaryItems.map((item) => (
                <article key={item.name}>
                  <span className="dictionary-family">{item.family}</span>
                  <div><h3>{item.name}</h3><strong>{item.purpose}</strong><p>{item.note}</p></div>
                </article>
              ))}
              {!dictionaryItems.length && <div className="empty-state compact-empty"><Search size={28} /><h3>No guide match</h3><p>Try the label name or a purpose such as “preservative.”</p></div>}
            </div>
            <p className="legal-note"><Info size={16} /> This guide explains why an ingredient may be used. It does not label an additive “good” or “bad,” diagnose a reaction, or replace the physical package.</p>
          </section>
        </div>
      )}

      {recallsOpen && (
        <div className="modal-scrim centered" role="presentation" onMouseDown={() => setRecallsOpen(false)}>
          <section className="feature-modal recall-modal" role="dialog" aria-modal="true" aria-label="Recall watch" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head"><div><small>Official FDA enforcement data</small><h2>Recall watch</h2></div><button type="button" onClick={() => setRecallsOpen(false)} aria-label="Close recall watch"><X size={21} /></button></div>
            <p className="modal-intro">Search the exact product, brand, or recalling company. A no-match result does not clear a product of recalls or other issues.</p>
            <div className="recall-search-row">
              <label className="modal-search">
                <Search size={18} />
                <input aria-label="Search recall records" value={recallQuery} onChange={(event) => setRecallQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchRecalls(); }} placeholder="Example: frozen blueberries" autoFocus />
              </label>
              <button type="button" onClick={() => void searchRecalls()} disabled={recallStatus === "loading"}>
                {recallStatus === "loading" ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />} Search
              </button>
            </div>
            {recallStatus === "idle" && (
              <div className="recall-idle"><TriangleAlert size={29} /><strong>Search FDA food enforcement records</strong><span>Results can include older, completed, or terminated records. Always compare package identifiers and lot codes.</span></div>
            )}
            {recallStatus === "loading" && <div className="loading-state"><LoaderCircle className="spin" size={25} /> Checking the FDA feed...</div>}
            {recallStatus === "error" && <div className="form-error recall-error"><AlertCircle size={17} /> {recallError}</div>}
            {recallStatus === "done" && (
              <div className="recall-results">
                <div className="recall-summary">
                  <strong>{recallResults.length ? `${recallResults.length} matching record${recallResults.length === 1 ? "" : "s"}` : "No matching records returned"}</strong>
                  {recallCheckedAt && <span>Checked {new Date(recallCheckedAt).toLocaleString()}</span>}
                </div>
                {recallResults.map((item) => (
                  <article key={item.id}>
                    <div className="recall-card-head"><span>{item.classification}</span><time>{formatRecallDate(item.date)}</time></div>
                    <h3>{item.company}</h3>
                    <p className="recall-product">{item.product}</p>
                    <p><strong>Reason:</strong> {item.reason}</p>
                    <div><span>Status: {item.status}</span><span>{item.distribution}</span></div>
                  </article>
                ))}
                {!recallResults.length && <div className="no-recall-match"><Search size={27} /><p>No FDA enforcement record matched that exact phrase. Try the brand or company name, then verify with the official recall pages below.</p></div>}
              </div>
            )}
            <div className="official-link-row">
              <a href="https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts" target="_blank" rel="noreferrer">FDA recalls <ExternalLink size={14} /></a>
              <a href="https://www.fsis.usda.gov/recalls-alerts" target="_blank" rel="noreferrer">USDA meat and poultry recalls <ExternalLink size={14} /></a>
            </div>
            <p className="legal-note"><Database size={16} /> The openFDA food enforcement dataset is updated weekly and is not a real-time recall alert service. Verify any match with the official notice and the package in hand.</p>
          </section>
        </div>
      )}

      {compareOpen && (
        <div className="modal-scrim centered" role="presentation" onMouseDown={() => setCompareOpen(false)}>
          <section className="feature-modal compare-modal" role="dialog" aria-modal="true" aria-label="Compare products" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head"><div><small>Evidence side by side</small><h2>Compare products</h2></div><button type="button" onClick={() => setCompareOpen(false)} aria-label="Close product comparison"><X size={21} /></button></div>
            {compareReports.length < 2 ? (
              <div className="compare-empty">
                <ArrowRightLeft size={34} />
                <h3>Two reports make a comparison</h3>
                <p>Scan another product, or load two examples to see how the comparison works.</p>
                <button type="button" onClick={loadCompareExamples}><Sparkles size={17} /> Load comparison examples</button>
              </div>
            ) : (
              <>
                <div className="compare-selectors">
                  <label><span>Product A</span><select value={compareLeftId} onChange={(event) => setCompareLeftId(event.target.value)}>{compareReports.map((item) => <option key={item.id} value={item.id}>{item.productName}</option>)}</select></label>
                  <span className="compare-switch"><ArrowRightLeft size={19} /></span>
                  <label><span>Product B</span><select value={compareRightId} onChange={(event) => setCompareRightId(event.target.value)}>{compareReports.map((item) => <option key={item.id} value={item.id}>{item.productName}</option>)}</select></label>
                </div>
                {leftReport && rightReport && (
                  <div className="comparison-table">
                    <div className="comparison-head"><span>Evidence</span><strong>{leftReport.productName}</strong><strong>{rightReport.productName}</strong></div>
                    <div><span>Bioengineered wording</span><strong className={leftReport.bioengineered}>{statusLabel(leftReport.bioengineered)}</strong><strong className={rightReport.bioengineered}>{statusLabel(rightReport.bioengineered)}</strong></div>
                    <div><span>Cultivated-meat wording</span><strong className={leftReport.cultivated}>{statusLabel(leftReport.cultivated)}</strong><strong className={rightReport.cultivated}>{statusLabel(rightReport.cultivated)}</strong></div>
                    <div><span>Formulation level</span><strong>{leftReport.processingLevel}/4 · {leftReport.processingLabel}</strong><strong>{rightReport.processingLevel}/4 · {rightReport.processingLabel}</strong></div>
                    <div><span>Additives matched</span><strong>{leftReport.additives.length}</strong><strong>{rightReport.additives.length}</strong></div>
                    <div><span>Major allergens named</span><strong>{leftReport.allergens.join(", ") || "None found"}</strong><strong>{rightReport.allergens.join(", ") || "None found"}</strong></div>
                    <div><span>Evidence confidence</span><strong>{leftReport.confidence}</strong><strong>{rightReport.confidence}</strong></div>
                  </div>
                )}
                <p className="comparison-note"><Info size={15} /> This compares supplied label evidence, not overall nutrition, taste, price, environmental impact, or personal suitability.</p>
              </>
            )}
          </section>
        </div>
      )}

      {learnOpen && (
        <div className="modal-scrim centered" role="presentation" onMouseDown={() => setLearnOpen(false)}>
          <section className="method-modal" role="dialog" aria-modal="true" aria-label="FoodMonocle method" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head"><div><small>Evidence over alarm</small><h2>How FoodMonocle reads a label</h2></div><button type="button" onClick={() => setLearnOpen(false)} aria-label="Close method"><X size={21} /></button></div>
            <p className="method-intro">The app reports what is visible, separates findings from guesses, and never treats one ingredient as a verdict on the whole food.</p>
            <div className="method-steps">
              <article><span>1</span><div><strong>Read locally</strong><p>Photo OCR and QR decoding run in your browser. FoodMonocle does not upload the image to an account.</p></div></article>
              <article><span>2</span><div><strong>Find exact disclosures</strong><p>Look for on-package wording tied to bioengineered foods, cultivated animal cells, and digital disclosures.</p></div></article>
              <article><span>3</span><div><strong>Explain formulation clues</strong><p>Translate additive purposes and count supported ultra-processing markers without assigning a fear score.</p></div></article>
              <article><span>4</span><div><strong>Show evidence and limits</strong><p>Quote the matched text, identify the source, show confidence, and state what a scan cannot prove.</p></div></article>
            </div>
            <div className="source-box">
              <strong>Regulatory and data starting points</strong>
              <a href={SOURCE_REFERENCES.bioengineered.url} target="_blank" rel="noreferrer">{SOURCE_REFERENCES.bioengineered.label} <span>Last reviewed {SOURCE_REFERENCES.bioengineered.lastReviewed}</span> <ChevronRight size={15} /></a>
              <a href={SOURCE_REFERENCES.cultivated.url} target="_blank" rel="noreferrer">{SOURCE_REFERENCES.cultivated.label} <span>Last reviewed {SOURCE_REFERENCES.cultivated.lastReviewed}</span> <ChevronRight size={15} /></a>
              <a href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer">Open Food Facts product database <span>Third-party, community-maintained</span> <ChevronRight size={15} /></a>
              <a href={SOURCE_REFERENCES.recalls.url} target="_blank" rel="noreferrer">{SOURCE_REFERENCES.recalls.label} <span>Last reviewed {SOURCE_REFERENCES.recalls.lastReviewed}</span> <ChevronRight size={15} /></a>
            </div>
            <p className="legal-note"><AlertCircle size={16} /> Ingredient, allergen, and recall results must be checked against the physical package and official notices. FoodMonocle is educational; it is not medical, dietary, legal, or risk advice.</p>
          </section>
        </div>
      )}
    </main>
  );
}
