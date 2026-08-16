import { getDb, persist, getDbPath } from "./index";

getDb();
persist();
console.log("Database ready at", getDbPath());
