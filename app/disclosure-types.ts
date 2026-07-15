export type DisclosureClassification =
  | "Explicit bioengineered-food disclosure"
  | "Explicit contains bioengineered ingredient disclosure"
  | "Voluntary bioengineered disclosure"
  | "Product-information page without detected BE disclosure"
  | "General manufacturer or marketing page"
  | "Inaccessible or unsupported destination"
  | "Unknown";

export type DisclosureEvidence = {
  text: string;
  location: "Page title" | "Heading" | "Paragraph" | "Structured data" | "Image alt text" | "Accessible label" | "Plain text";
  source: "Manufacturer-provided page";
  confidence: "High" | "Moderate" | "Low";
};

export type DisclosureObservationState = "Observed" | "Not observed" | "Could not verify" | "Not supplied";

export type DisclosureObservations = {
  directProductInformation: DisclosureObservationState;
  beDisclosureInFirstContent: DisclosureObservationState;
  marketingDominated: DisclosureObservationState;
  packageScanInstruction: DisclosureObservationState;
  packagePhoneDisclosure: DisclosureObservationState;
  imageBasedDisclosure: DisclosureObservationState;
};

export type DisclosureAnalysisSuccess = {
  status: "analyzed";
  classification: DisclosureClassification;
  originalUrl: string;
  finalUrl: string;
  originalDomain: string;
  finalDomain: string;
  redirects: string[];
  retrievedAt: string;
  pageTitle: string;
  contentType: string;
  evidence: DisclosureEvidence[];
  observations: DisclosureObservations;
  explanation: string;
  limitations: string[];
  analysisText: string;
};

export type DisclosureAnalysisFailure = {
  status: "blocked" | "error";
  classification: "Inaccessible or unsupported destination";
  code: string;
  message: string;
  originalUrl: string;
  originalDomain: string;
  retrievedAt: string;
};

export type DisclosureAnalysisResult = DisclosureAnalysisSuccess | DisclosureAnalysisFailure;
