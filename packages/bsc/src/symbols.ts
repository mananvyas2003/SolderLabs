import type { BSCChange } from "./diff";
import type { BscPin } from "./types";
import { toIdent } from "./emit/common";

/**
 * Firmware symbols that may reference a BSC surface involved in a change.
 * Used by `solderlab bsc check --scan` to print exact call sites.
 */
export function symbolsForChange(change: BSCChange): string[] {
  const symbols = new Set<string>();

  const addPinSymbols = (pin: BscPin | null | undefined) => {
    if (!pin) return;
    if (pin.pinName && pin.pinName !== "~") {
      const id = toIdent(pin.pinName, "PIN");
      symbols.add(`SOLDERLAB_PIN_${id}`);
      symbols.add(id);
      symbols.add(`PIN_${id}`);
    }
    if (pin.net) {
      const id = toIdent(pin.net, "NET");
      symbols.add(`SOLDERLAB_PIN_${id}`);
      symbols.add(id);
    }
    symbols.add(`SOLDERLAB_PIN_${toIdent(`P${pin.pinNumber}`, "PIN")}`);
    // Common firmware aliases
    symbols.add(`PAD_${pin.pinNumber}`);
  };

  switch (change.kind) {
    case "pin_reassigned":
    case "pin_removed":
      addPinSymbols(change.before as BscPin);
      addPinSymbols(change.after as BscPin | null);
      break;
    case "pin_added":
      addPinSymbols(change.after as BscPin);
      break;
    case "rail_voltage_changed":
    case "rail_removed":
    case "rail_added": {
      const rail = (change.after ?? change.before) as { name?: string } | null;
      if (rail?.name) {
        const id = toIdent(rail.name, "RAIL");
        symbols.add(`SOLDERLAB_RAIL_${id}_MV`);
        symbols.add(`${id}_MV`);
        symbols.add(id);
      }
      break;
    }
    case "i2c_address_changed": {
      const dev = (change.after ?? change.before) as { refdes?: string } | null;
      if (dev?.refdes) {
        const id = toIdent(dev.refdes, "DEV");
        symbols.add(`SOLDERLAB_I2C_${id}_ADDR`);
        symbols.add(`${id}_ADDR`);
      }
      break;
    }
    case "connector_pinout_changed": {
      const conn = (change.after ?? change.before) as { refdes?: string } | null;
      if (conn?.refdes) {
        symbols.add(toIdent(conn.refdes, "J"));
        symbols.add(`CONNECTOR_${toIdent(conn.refdes, "J")}`);
      }
      break;
    }
    case "rev_strap_changed": {
      const strap = (change.after ?? change.before) as { gpio?: string | null } | null;
      if (strap?.gpio) {
        const id = toIdent(strap.gpio, "STRAP");
        symbols.add(`SOLDERLAB_REV_STRAP_${id}`);
        symbols.add(id);
      }
      break;
    }
    default:
      break;
  }

  return [...symbols].filter(Boolean).sort();
}
