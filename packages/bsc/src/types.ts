/**
 * Board Support Contract — versioned machine-readable interface between a
 * schematic revision and the firmware that runs on it.
 *
 * Fields the detector cannot determine are `null` with a `confidenceNotes`
 * entry. Never invent voltages, addresses, or pin functions.
 */

export const BSC_SCHEMA_VERSION = "1.0" as const;

export interface ConfidenceNote {
  field: string;
  reason: string;
}

export interface BscGeneratedFrom {
  revisionId: string | null;
  sha256: string;
}

export interface BscMcu {
  refdes: string;
  mpn: string | null;
  package: string | null;
  /** Weighted heuristic score in [0, 1], computed at parse time. */
  confidence: number;
  confidenceNotes: ConfidenceNote[];
}

export interface BscPinConnection {
  refdes: string;
  pin: string;
}

export interface BscPin {
  mcuRefdes: string;
  pinNumber: string;
  pinName: string | null;
  net: string | null;
  function: string | null;
  connectedTo: BscPinConnection[];
  direction: string | null;
  pullState: string | null;
  confidenceNotes: ConfidenceNote[];
}

export interface BscRevStrap {
  gpio: string | null;
  expectedLevel: "high" | "low" | null;
  decodesToRevision: string | null;
  confidenceNotes: ConfidenceNote[];
}

export interface BscBusDevice {
  bus: "i2c" | "spi";
  /** I2C: 7-bit address hex string e.g. "0x3C". SPI: chip-select net/ref. */
  address: string | null;
  chipSelect: string | null;
  refdes: string;
  mpn: string | null;
  description: string | null;
  confidenceNotes: ConfidenceNote[];
}

export interface BscPowerRail {
  name: string;
  nominalVolts: number | null;
  tolerancePct: number | null;
  sourceRefdes: string | null;
  enableNet: string | null;
  senseNet: string | null;
  sequenceIndex: number | null;
  confidenceNotes: ConfidenceNote[];
}

export interface BscConnectorPin {
  number: string;
  net: string | null;
  signal: string | null;
  confidenceNotes: ConfidenceNote[];
}

export interface BscConnector {
  refdes: string;
  description: string | null;
  pins: BscConnectorPin[];
  confidenceNotes: ConfidenceNote[];
}

export interface BscTestPoint {
  refdes: string;
  net: string | null;
  description: string | null;
  confidenceNotes: ConfidenceNote[];
}

export interface BoardSupportContract {
  schemaVersion: typeof BSC_SCHEMA_VERSION;
  boardName: string;
  revision: string | null;
  generatedFrom: BscGeneratedFrom;
  mcus: BscMcu[];
  pins: BscPin[];
  revStraps: BscRevStrap[];
  busDevices: BscBusDevice[];
  powerRails: BscPowerRail[];
  connectors: BscConnector[];
  testPoints: BscTestPoint[];
  /** Detector coverage / refusal notes at contract level */
  confidenceNotes: ConfidenceNote[];
}
