import type { DataRegion } from "@flux/db";

export const DATA_REGIONS: Array<{
  id: DataRegion;
  label: string;
  description: string;
}> = [
  {
    id: "local",
    label: "Local / Dev",
    description: "Default local disk (development)",
  },
  {
    id: "us-east",
    label: "US East",
    description: "United States (Virginia)",
  },
  {
    id: "eu-west",
    label: "EU West",
    description: "European Union (Ireland)",
  },
  {
    id: "ap-south",
    label: "AP South",
    description: "Asia Pacific (Mumbai)",
  },
];
