import { NextResponse } from "next/server";

/** Altium import was a CSV BOM reader with empty nets — removed until a real path exists. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Altium import is not supported. Upload a KiCad project (.zip / .kicad_sch).",
    },
    { status: 410 },
  );
}
