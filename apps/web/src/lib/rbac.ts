import type { Role } from "@flux/db";

const RANK: Record<string, number> = {
  owner: 100,
  admin: 80,
  engineer: 60,
  reviewer: 50,
  procurement: 40,
  viewer: 20,
};

export type Action =
  | "org.manage"
  | "org.invite"
  | "project.create"
  | "revision.upload"
  | "review.open"
  | "review.comment"
  | "review.approve"
  | "review.merge"
  | "release.publish"
  | "release.download"
  | "library.manage"
  | "webhook.manage"
  | "view";

const ACTION_MIN: Record<Action, Role[]> = {
  "org.manage": ["owner"],
  "org.invite": ["owner", "admin"],
  "project.create": ["owner", "admin", "engineer"],
  "revision.upload": ["owner", "admin", "engineer"],
  "review.open": ["owner", "admin", "engineer", "reviewer"],
  "review.comment": ["owner", "admin", "engineer", "reviewer"],
  "review.approve": ["owner", "admin", "reviewer"],
  "review.merge": ["owner", "admin", "engineer"],
  "release.publish": ["owner", "admin", "engineer"],
  "release.download": [
    "owner",
    "admin",
    "engineer",
    "reviewer",
    "viewer",
    "procurement",
  ],
  "library.manage": ["owner", "admin", "engineer"],
  "webhook.manage": ["owner", "admin"],
  view: ["owner", "admin", "engineer", "reviewer", "viewer", "procurement"],
};

export function can(role: string, action: Action): boolean {
  return ACTION_MIN[action].includes(role as Role);
}

export function roleRank(role: string) {
  return RANK[role] ?? 0;
}
