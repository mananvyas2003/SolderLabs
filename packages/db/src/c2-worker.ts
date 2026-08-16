/**
 * C2: two processes, same SQLite file, 50 concurrent project inserts.
 */
import http from "node:http";
import { getDb, persist, nowIso, resetDbCache } from "./index";
import { nanoid } from "nanoid";

const port = Number(process.env.C2_PORT ?? "3000");
resetDbCache();
getDb();

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url?.startsWith("/project")) {
    const db = getDb();
    const id = nanoid();
    db.projects.push({
      id,
      orgId: "c2-org",
      name: `p-${id}`,
      slug: `p-${id}`,
      description: null,
      visibility: "private",
      defaultBranch: "main",
      requireGreenChecks: true,
      requireApproval: false,
      requiredApprovals: 1,
      createdAt: nowIso(),
    });
    db.branches.push({
      id: nanoid(),
      projectId: id,
      name: "main",
      headRevisionId: null,
    });
    persist();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id }));
    return;
  }
  if (req.url === "/count") {
    resetDbCache();
    const db = getDb();
    const projects = db.projects.filter((p) => p.orgId === "c2-org").length;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ projects }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`c2-worker listening ${port}\n`);
});
