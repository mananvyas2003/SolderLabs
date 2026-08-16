import type { SnapshotComponent } from "@solderlab/design-core";

/** Known MCU library nicknames / categories (prefix match on lib_id). One scoring signal. */
export const MCU_LIB_PREFIXES = [
  "MCU_",
  "MCU_ST",
  "MCU_Microchip",
  "MCU_Espressif",
  "MCU_Nordic",
  "MCU_Cypress",
  "MCU_NXP",
  "MCU_Texas",
  "MCU_Analog",
  "MCU_Silicon",
  "Module_ESP",
  "RF_Module",
] as const;

/** Known MCU MPN / value prefixes. One scoring signal, never a gate. */
export const MCU_MPN_PREFIXES = [
  "STM32",
  "ATMEGA",
  "ATTINY",
  "ATSAM",
  "SAMD",
  "NRF52",
  "NRF91",
  "ESP32",
  "ESP8266",
  "RP2040",
  "RP2350",
  "SC0914",
  "PIC16",
  "PIC18",
  "PIC24",
  "PIC32",
  "PIC12",
  "GD32",
  "CH32",
  "CY7C",
  "LM3S",
  "TMS320",
  "EFR32",
  "EFM32",
  "MCF52",
  "XCZU",
] as const;

function libId(c: SnapshotComponent): string {
  return c.libId ?? "";
}

function partTokens(c: SnapshotComponent): string {
  return [c.mpn, c.value, libId(c)].filter(Boolean).join(" ");
}

/** Family/lib match — bonus signal, not a hard gate. */
export function matchesMcuIdentity(c: SnapshotComponent): boolean {
  const lib = libId(c);
  if (MCU_LIB_PREFIXES.some((p) => lib.startsWith(p) || lib.includes(`:${p}`))) {
    return true;
  }
  if (/[/:]MCU[_A-Za-z]*/i.test(lib) || /^MCU_/i.test(lib)) return true;
  const tokens = partTokens(c).toUpperCase();
  return MCU_MPN_PREFIXES.some((p) => tokens.includes(p.toUpperCase()));
}
