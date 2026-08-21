/**
 * solderlab-physics — JSON stdin/stdout IPC for the new_sch engine.
 *
 * Usage:
 *   solderlab-physics --json   < request.json
 *   echo '{...}' | solderlab-physics --json
 *
 * Request ops: solve_dc | synthesize | find_candidates | import_jlcpcb | ping
 */
#include "cJSON.h"
#include "catalogue.h"
#include "db.h"
#include "jlcparts_import.h"
#include "physics.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif

static char *read_all_stdin(void) {
  size_t cap = 4096, len = 0;
  char *buf = (char *)malloc(cap);
  if (!buf)
    return NULL;
  int c;
  while ((c = fgetc(stdin)) != EOF) {
    if (len + 1 >= cap) {
      cap *= 2;
      char *n = (char *)realloc(buf, cap);
      if (!n) {
        free(buf);
        return NULL;
      }
      buf = n;
    }
    buf[len++] = (char)c;
  }
  buf[len] = '\0';
  return buf;
}

static void emit_json(cJSON *root) {
  char *printed = cJSON_PrintUnformatted(root);
  if (printed) {
    fputs(printed, stdout);
    fputc('\n', stdout);
    free(printed);
  }
  cJSON_Delete(root);
}

static cJSON *base_response(int ok, const char *status) {
  cJSON *root = cJSON_CreateObject();
  cJSON_AddBoolToObject(root, "ok", ok);
  cJSON_AddStringToObject(root, "status", status);
  cJSON_AddItemToObject(root, "engineResults", cJSON_CreateObject());
  cJSON_AddItemToObject(root, "findings", cJSON_CreateArray());
  cJSON_AddItemToObject(root, "errors", cJSON_CreateArray());
  return root;
}

static void add_error(cJSON *root, const char *msg) {
  cJSON *errors = cJSON_GetObjectItem(root, "errors");
  if (errors)
    cJSON_AddItemToArray(errors, cJSON_CreateString(msg));
}

static void add_finding(cJSON *root, const char *type, const char *severity,
                        cJSON *fields, cJSON *citations) {
  cJSON *findings = cJSON_GetObjectItem(root, "findings");
  cJSON *f = cJSON_CreateObject();
  cJSON_AddStringToObject(f, "type", type);
  cJSON_AddStringToObject(f, "severity", severity);
  cJSON_AddItemToObject(f, "textTemplateFields", fields ? fields : cJSON_CreateObject());
  cJSON_AddItemToObject(f, "citations", citations ? citations : cJSON_CreateArray());
  if (findings)
    cJSON_AddItemToArray(findings, f);
}

static int part_type_from_str(const char *s, PartTypes *out) {
  if (!s)
    return 0;
  if (strcmp(s, "resistor") == 0) {
    *out = PART_RESISTOR;
    return 1;
  }
  if (strcmp(s, "capacitor") == 0) {
    *out = PART_CAPACITOR;
    return 1;
  }
  if (strcmp(s, "inductor") == 0) {
    *out = PART_INDUCTOR;
    return 1;
  }
  if (strcmp(s, "diode") == 0) {
    *out = PART_DIODE;
    return 1;
  }
  if (strcmp(s, "transistor") == 0) {
    *out = PART_TRANSISTOR;
    return 1;
  }
  return 0;
}

static ToleranceClass tol_from_str(const char *s) {
  if (!s)
    return TOLERANCE_E24;
  if (strcmp(s, "E96") == 0)
    return TOLERANCE_E96;
  if (strcmp(s, "E48") == 0)
    return TOLERANCE_E48;
  if (strcmp(s, "E12") == 0)
    return TOLERANCE_E12;
  if (strcmp(s, "E192") == 0)
    return TOLERANCE_E192;
  return TOLERANCE_E24;
}

static int handle_solve_dc(cJSON *req, cJSON *root) {
  cJSON *stamps = cJSON_GetObjectItem(req, "stamps");
  cJSON *probes = cJSON_GetObjectItem(req, "probes");
  int num_nodes = 0;
  cJSON *nn = cJSON_GetObjectItem(req, "nodes");
  if (cJSON_IsNumber(nn))
    num_nodes = nn->valueint;
  else if (cJSON_IsArray(nn))
    num_nodes = cJSON_GetArraySize(nn);

  if (!cJSON_IsArray(stamps) || num_nodes < 1) {
    add_error(root, "solve_dc requires nodes>=1 and stamps[]");
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("unverifiable"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateFalse());
    return 1;
  }

  int vsrc_count = 0;
  cJSON *st;
  cJSON_ArrayForEach(st, stamps) {
    const char *kind =
        cJSON_GetObjectItem(st, "kind")
            ? cJSON_GetObjectItem(st, "kind")->valuestring
            : "";
    if (strcmp(kind, "V") == 0 || strcmp(kind, "voltage") == 0 ||
        strcmp(kind, "L") == 0 || strcmp(kind, "inductor") == 0)
      vsrc_count++;
  }

  MNASolver *s = MNA_Create(num_nodes, vsrc_count > 0 ? vsrc_count : 0);
  if (!s) {
    add_error(root, "MNA_Create failed");
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("unverifiable"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateFalse());
    return 1;
  }

  int branch = 0;
  cJSON_ArrayForEach(st, stamps) {
    const char *kind =
        cJSON_GetObjectItem(st, "kind")
            ? cJSON_GetObjectItem(st, "kind")->valuestring
            : "";
    int a = cJSON_GetObjectItem(st, "a") ? cJSON_GetObjectItem(st, "a")->valueint : 0;
    int b = cJSON_GetObjectItem(st, "b") ? cJSON_GetObjectItem(st, "b")->valueint : 0;
    double val =
        cJSON_GetObjectItem(st, "value") ? cJSON_GetObjectItem(st, "value")->valuedouble
                                         : 0.0;
    if (strcmp(kind, "R") == 0 || strcmp(kind, "resistor") == 0) {
      MNA_StampResistor(s, a, b, val);
    } else if (strcmp(kind, "V") == 0 || strcmp(kind, "voltage") == 0) {
      MNA_StampVoltageSource(s, a, b, branch++, val);
    } else if (strcmp(kind, "I") == 0 || strcmp(kind, "current") == 0) {
      MNA_StampCurrentSource(s, a, b, val);
    } else if (strcmp(kind, "C") == 0 || strcmp(kind, "capacitor") == 0) {
      MNA_StampCapacitor(s, a, b);
    } else if (strcmp(kind, "L") == 0 || strcmp(kind, "inductor") == 0) {
      MNA_StampInductor(s, a, b, branch++);
    } else {
      add_error(root, "unknown stamp kind");
    }
  }

  int solved = MNA_Solve(s);
  cJSON *er = cJSON_GetObjectItem(root, "engineResults");
  cJSON_AddBoolToObject(er, "singular", !solved);
  cJSON *nodeVoltages = cJSON_CreateArray();
  cJSON_AddItemToObject(er, "nodeVoltages", nodeVoltages);

  if (!solved) {
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("refuted"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateTrue());
    add_error(root, "singular matrix (floating node or malformed circuit)");
    cJSON *fields = cJSON_CreateObject();
    cJSON_AddStringToObject(fields, "reason", "singular_matrix");
    add_finding(root, "part_rating_risk", "high", fields, NULL);
    MNA_Destroy(s);
    return 0;
  }

  for (int i = 0; i < num_nodes; i++) {
    cJSON *row = cJSON_CreateObject();
    cJSON_AddNumberToObject(row, "node", i + 1);
    cJSON_AddNumberToObject(row, "voltage", s->x[i]);
    cJSON_AddItemToArray(nodeVoltages, row);
  }

  if (cJSON_IsArray(probes)) {
    cJSON *probeResults = cJSON_CreateArray();
    cJSON *p;
    cJSON_ArrayForEach(p, probes) {
      int node =
          cJSON_GetObjectItem(p, "node") ? cJSON_GetObjectItem(p, "node")->valueint
                                         : 0;
      const char *name =
          cJSON_GetObjectItem(p, "name")
              ? cJSON_GetObjectItem(p, "name")->valuestring
              : "probe";
      double expected =
          cJSON_GetObjectItem(p, "expected")
              ? cJSON_GetObjectItem(p, "expected")->valuedouble
              : NAN;
      double v = (node >= 1 && node <= num_nodes) ? s->x[node - 1] : NAN;
      cJSON *pr = cJSON_CreateObject();
      cJSON_AddStringToObject(pr, "name", name);
      cJSON_AddNumberToObject(pr, "node", node);
      cJSON_AddNumberToObject(pr, "voltage", v);
      if (expected == expected) {
        cJSON_AddNumberToObject(pr, "expected", expected);
        cJSON_AddNumberToObject(pr, "error", v - expected);
      }
      cJSON_AddItemToArray(probeResults, pr);

      cJSON *fields = cJSON_CreateObject();
      cJSON_AddStringToObject(fields, "probe", name);
      cJSON_AddNumberToObject(fields, "node", node);
      cJSON_AddNumberToObject(fields, "voltage", v);
      if (expected == expected)
        cJSON_AddNumberToObject(fields, "expected", expected);
      cJSON *cits = cJSON_CreateArray();
      cJSON *cit = cJSON_CreateObject();
      cJSON_AddStringToObject(cit, "kind", "net");
      cJSON_AddStringToObject(cit, "ref", name);
      cJSON_AddItemToArray(cits, cit);
      add_finding(root, "voltage_result", "info", fields, cits);
    }
    cJSON_AddItemToObject(er, "probes", probeResults);
  }

  cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("verified"));
  cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateTrue());
  MNA_Destroy(s);
  return 0;
}

static void seed_synth_db(DB *db) {
  GenerateE24Resistors(db);
  GenerateE96Resistors(db);
  GenerateE6Capacitors(db);

  /* Dummy inductor + actives for buck (same as main.c helpers) */
  int64_t id;
  DBPart l1;
  memset(&l1, 0, sizeof(l1));
  l1.type = PART_INDUCTOR;
  l1.value = 10e-6;
  l1.i_rating = 1.5;
  strncpy(l1.package, "0603", sizeof(l1.package) - 1);
  strncpy(l1.mpn, "IND-0603-10UH", sizeof(l1.mpn) - 1);
  DB_InsertPartFull(db, &l1, &id);

  DBPart sw, diode;
  memset(&sw, 0, sizeof(sw));
  sw.type = PART_TRANSISTOR;
  sw.v_rating = 30.0;
  sw.i_rating = 5.0;
  strncpy(sw.package, "SOT-23", sizeof(sw.package) - 1);
  strncpy(sw.mpn, "MOSFET-N-CH-30V", sizeof(sw.mpn) - 1);
  DB_InsertPartFull(db, &sw, &id);

  memset(&diode, 0, sizeof(diode));
  diode.type = PART_DIODE;
  diode.v_rating = 40.0;
  diode.i_rating = 3.0;
  strncpy(diode.package, "SMA", sizeof(diode.package) - 1);
  strncpy(diode.mpn, "SCHOTTKY-40V-3A", sizeof(diode.mpn) - 1);
  DB_InsertPartFull(db, &diode, &id);

  /* topologies */
  {
    int64_t top_id, r1_id, r2_id, n_vin, n_vout, n_gnd;
    DB_InsertTopology(db, "resistor_divider", "Divider", "Power", &top_id);
    DB_AddTopologyComponent(db, top_id, "r1", PART_RESISTOR, 1, &r1_id);
    DB_AddTopologyComponent(db, top_id, "r2", PART_RESISTOR, 1, &r2_id);
    DB_AddTopologyNode(db, top_id, "VIN", &n_vin);
    DB_AddTopologyNode(db, top_id, "VOUT", &n_vout);
    DB_AddTopologyNode(db, top_id, "GND", &n_gnd);
    DB_AddTopologyConnection(db, r1_id, "1", n_vin, NULL);
    DB_AddTopologyConnection(db, r1_id, "2", n_vout, NULL);
    DB_AddTopologyConnection(db, r2_id, "1", n_vout, NULL);
    DB_AddTopologyConnection(db, r2_id, "2", n_gnd, NULL);
  }
  {
    int64_t top_id, r1_id, c1_id, n_vin, n_vout, n_gnd;
    DB_InsertTopology(db, "rc_filter", "RC", "Filter", &top_id);
    DB_AddTopologyComponent(db, top_id, "r1", PART_RESISTOR, 1, &r1_id);
    DB_AddTopologyComponent(db, top_id, "c1", PART_CAPACITOR, 1, &c1_id);
    DB_AddTopologyNode(db, top_id, "VIN", &n_vin);
    DB_AddTopologyNode(db, top_id, "VOUT", &n_vout);
    DB_AddTopologyNode(db, top_id, "GND", &n_gnd);
    DB_AddTopologyConnection(db, r1_id, "1", n_vin, NULL);
    DB_AddTopologyConnection(db, r1_id, "2", n_vout, NULL);
    DB_AddTopologyConnection(db, c1_id, "1", n_vout, NULL);
    DB_AddTopologyConnection(db, c1_id, "2", n_gnd, NULL);
  }
  {
    int64_t top_id, l1_id, c1_id, n_vin, n_vout, n_gnd;
    DB_InsertTopology(db, "lc_filter", "LC", "Filter", &top_id);
    DB_AddTopologyComponent(db, top_id, "l1", PART_INDUCTOR, 1, &l1_id);
    DB_AddTopologyComponent(db, top_id, "c1", PART_CAPACITOR, 1, &c1_id);
    DB_AddTopologyNode(db, top_id, "VIN", &n_vin);
    DB_AddTopologyNode(db, top_id, "VOUT", &n_vout);
    DB_AddTopologyNode(db, top_id, "GND", &n_gnd);
    DB_AddTopologyConnection(db, l1_id, "1", n_vin, NULL);
    DB_AddTopologyConnection(db, l1_id, "2", n_vout, NULL);
    DB_AddTopologyConnection(db, c1_id, "1", n_vout, NULL);
    DB_AddTopologyConnection(db, c1_id, "2", n_gnd, NULL);
  }
  {
    int64_t top_id, c1_id, l1_id, c2_id, n_vin, n_vout, n_gnd;
    DB_InsertTopology(db, "pi_filter", "Pi", "Filter", &top_id);
    DB_AddTopologyComponent(db, top_id, "c1", PART_CAPACITOR, 1, &c1_id);
    DB_AddTopologyComponent(db, top_id, "l1", PART_INDUCTOR, 1, &l1_id);
    DB_AddTopologyComponent(db, top_id, "c2", PART_CAPACITOR, 1, &c2_id);
    DB_AddTopologyNode(db, top_id, "VIN", &n_vin);
    DB_AddTopologyNode(db, top_id, "VOUT", &n_vout);
    DB_AddTopologyNode(db, top_id, "GND", &n_gnd);
    DB_AddTopologyConnection(db, c1_id, "1", n_vin, NULL);
    DB_AddTopologyConnection(db, c1_id, "2", n_gnd, NULL);
    DB_AddTopologyConnection(db, l1_id, "1", n_vin, NULL);
    DB_AddTopologyConnection(db, l1_id, "2", n_vout, NULL);
    DB_AddTopologyConnection(db, c2_id, "1", n_vout, NULL);
    DB_AddTopologyConnection(db, c2_id, "2", n_gnd, NULL);
  }
  SeedBuckTopology(db);
}

static int handle_synthesize(cJSON *req, cJSON *root) {
  const char *topology =
      cJSON_GetObjectItem(req, "topology")
          ? cJSON_GetObjectItem(req, "topology")->valuestring
          : NULL;
  double vin =
      cJSON_GetObjectItem(req, "vin") ? cJSON_GetObjectItem(req, "vin")->valuedouble
                                      : 0.0;
  double vout =
      cJSON_GetObjectItem(req, "vout") ? cJSON_GetObjectItem(req, "vout")->valuedouble
                                       : 0.0;
  double iout =
      cJSON_GetObjectItem(req, "iout") ? cJSON_GetObjectItem(req, "iout")->valuedouble
                                       : 0.0;
  if (!topology || vin <= 0.0 || vout <= 0.0) {
    add_error(root, "synthesize requires topology, vin>0, vout>0");
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("unverifiable"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateFalse());
    return 1;
  }

  remove("solderlab_physics_synth.db");
  DB *db = DB_open("solderlab_physics_synth.db");
  if (!db) {
    add_error(root, "failed to open synthesis DB");
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("unverifiable"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateFalse());
    return 1;
  }
  seed_synth_db(db);

  BoundComponent bindings[16];
  memset(bindings, 0, sizeof(bindings));
  int n = SynthesizeTopology(db, topology, vin, vout, iout, bindings, 16);
  cJSON *er = cJSON_GetObjectItem(root, "engineResults");
  cJSON_AddStringToObject(er, "topology", topology);
  cJSON_AddNumberToObject(er, "vin", vin);
  cJSON_AddNumberToObject(er, "vout", vout);
  cJSON *arr = cJSON_CreateArray();
  cJSON_AddItemToObject(er, "bindings", arr);

  int ok_bind = 0;
  for (int i = 0; i < n; i++) {
    cJSON *b = cJSON_CreateObject();
    cJSON_AddStringToObject(b, "role", bindings[i].role_name);
    cJSON_AddBoolToObject(b, "bound", bindings[i].bound_successfully);
    cJSON_AddStringToObject(b, "mpn", bindings[i].bound_part.mpn);
    cJSON_AddNumberToObject(b, "value", bindings[i].bound_part.value);
    cJSON_AddStringToObject(b, "package", bindings[i].bound_part.package);
    cJSON_AddItemToArray(arr, b);
    if (bindings[i].bound_successfully)
      ok_bind++;

    cJSON *fields = cJSON_CreateObject();
    cJSON_AddStringToObject(fields, "role", bindings[i].role_name);
    cJSON_AddStringToObject(fields, "mpn", bindings[i].bound_part.mpn);
    cJSON_AddNumberToObject(fields, "value", bindings[i].bound_part.value);
    cJSON_AddBoolToObject(fields, "bound", bindings[i].bound_successfully);
    cJSON *cits = cJSON_CreateArray();
    cJSON *cit = cJSON_CreateObject();
    cJSON_AddStringToObject(cit, "kind", "component");
    cJSON_AddStringToObject(cit, "ref", bindings[i].role_name);
    cJSON_AddItemToArray(cits, cit);
    add_finding(root, "design_equation", "info", fields, cits);
  }

  /* Synthesis bindings are never "verified" CAD — caller maps to Proposed. */
  if (n == 0) {
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("unverifiable"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateFalse());
    add_error(root, "synthesis returned no bindings");
  } else if (ok_bind == 0) {
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("refuted"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateTrue());
    add_error(root, "no roles satisfied rating/value constraints");
  } else {
    /* Engine solved + bound; TS layer classifies as Proposed. */
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("verified"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateTrue());
    cJSON_AddBoolToObject(er, "proposedOnly", 1);
  }

  DB_close(db);
  return 0;
}

static int handle_find_candidates(cJSON *req, cJSON *root) {
  const char *type_s =
      cJSON_GetObjectItem(req, "type") ? cJSON_GetObjectItem(req, "type")->valuestring
                                       : NULL;
  double value =
      cJSON_GetObjectItem(req, "value") ? cJSON_GetObjectItem(req, "value")->valuedouble
                                        : 0.0;
  const char *package =
      cJSON_GetObjectItem(req, "package")
          ? cJSON_GetObjectItem(req, "package")->valuestring
          : "0603";
  const char *tol_s =
      cJSON_GetObjectItem(req, "tolerance")
          ? cJSON_GetObjectItem(req, "tolerance")->valuestring
          : "E24";
  double minV =
      cJSON_GetObjectItem(req, "minV") ? cJSON_GetObjectItem(req, "minV")->valuedouble
                                       : 0.0;
  double minI =
      cJSON_GetObjectItem(req, "minI") ? cJSON_GetObjectItem(req, "minI")->valuedouble
                                       : 0.0;
  double minP =
      cJSON_GetObjectItem(req, "minP") ? cJSON_GetObjectItem(req, "minP")->valuedouble
                                       : 0.0;
  int limit =
      cJSON_GetObjectItem(req, "limit") ? cJSON_GetObjectItem(req, "limit")->valueint
                                        : 5;
  if (limit < 1)
    limit = 1;
  if (limit > 20)
    limit = 20;

  PartTypes pt;
  if (!part_type_from_str(type_s, &pt)) {
    add_error(root, "find_candidates requires type resistor|capacitor|...");
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("unverifiable"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateFalse());
    return 1;
  }

  remove("solderlab_physics_cand.db");
  DB *db = DB_open("solderlab_physics_cand.db");
  if (!db) {
    add_error(root, "failed to open candidates DB");
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("unverifiable"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateFalse());
    return 1;
  }
  if (pt == PART_RESISTOR) {
    GenerateE24Resistors(db);
    GenerateE96Resistors(db);
  } else if (pt == PART_CAPACITOR) {
    GenerateE6Capacitors(db);
  }

  DBPart *parts = (DBPart *)calloc((size_t)limit, sizeof(DBPart));
  int found = DB_FindCandidates(db, pt, value, package, tol_from_str(tol_s), minV,
                                minI, minP, parts, limit);
  cJSON *er = cJSON_GetObjectItem(root, "engineResults");
  cJSON *arr = cJSON_CreateArray();
  cJSON_AddItemToObject(er, "candidates", arr);
  for (int i = 0; i < found; i++) {
    cJSON *row = cJSON_CreateObject();
    cJSON_AddStringToObject(row, "mpn", parts[i].mpn);
    cJSON_AddNumberToObject(row, "value", parts[i].value);
    cJSON_AddStringToObject(row, "package", parts[i].package);
    cJSON_AddNumberToObject(row, "v_rating", parts[i].v_rating);
    cJSON_AddNumberToObject(row, "i_rating", parts[i].i_rating);
    cJSON_AddItemToArray(arr, row);
  }
  free(parts);
  DB_close(db);

  cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateTrue());
  cJSON_ReplaceItemInObject(
      root, "status",
      cJSON_CreateString(found > 0 ? "verified" : "unverifiable"));
  if (found == 0)
    add_error(root, "no candidates matched constraints");
  return 0;
}

static int handle_import_jlcpcb(cJSON *req, cJSON *root) {
  const char *csv =
      cJSON_GetObjectItem(req, "csvPath")
          ? cJSON_GetObjectItem(req, "csvPath")->valuestring
          : NULL;
  const char *dbPath =
      cJSON_GetObjectItem(req, "dbPath")
          ? cJSON_GetObjectItem(req, "dbPath")->valuestring
          : "data/jlcpcb/parts.db";
  if (!csv) {
    add_error(root, "import_jlcpcb requires csvPath");
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("unverifiable"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateFalse());
    return 1;
  }
  remove(dbPath);
  DB *db = DB_open(dbPath);
  if (!db) {
    add_error(root, "failed to open DB for import");
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("unverifiable"));
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateFalse());
    return 1;
  }
  int rows = ImportJLCPCBCsv(db, csv);
  cJSON *er = cJSON_GetObjectItem(root, "engineResults");
  cJSON_AddNumberToObject(er, "rows", rows);
  cJSON_AddStringToObject(er, "dbPath", dbPath);
  DB_close(db);
  cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateTrue());
  cJSON_ReplaceItemInObject(
      root, "status", cJSON_CreateString(rows > 0 ? "verified" : "unverifiable"));
  return 0;
}

static int dispatch(cJSON *req) {
  cJSON *root = base_response(0, "unverifiable");
  const char *op =
      cJSON_GetObjectItem(req, "op") ? cJSON_GetObjectItem(req, "op")->valuestring
                                     : NULL;
  if (!op) {
    add_error(root, "missing op");
    emit_json(root);
    return 1;
  }
  if (strcmp(op, "ping") == 0) {
    cJSON_ReplaceItemInObject(root, "ok", cJSON_CreateTrue());
    cJSON_ReplaceItemInObject(root, "status", cJSON_CreateString("verified"));
    cJSON *er = cJSON_GetObjectItem(root, "engineResults");
    cJSON_AddStringToObject(er, "engine", "solderlab-physics");
    cJSON_AddStringToObject(er, "backend", "new_sch");
    emit_json(root);
    return 0;
  }
  if (strcmp(op, "solve_dc") == 0) {
    handle_solve_dc(req, root);
    emit_json(root);
    return 0;
  }
  if (strcmp(op, "synthesize") == 0) {
    handle_synthesize(req, root);
    emit_json(root);
    return 0;
  }
  if (strcmp(op, "find_candidates") == 0) {
    handle_find_candidates(req, root);
    emit_json(root);
    return 0;
  }
  if (strcmp(op, "import_jlcpcb") == 0) {
    handle_import_jlcpcb(req, root);
    emit_json(root);
    return 0;
  }
  add_error(root, "unknown op");
  emit_json(root);
  return 1;
}

int main(int argc, char **argv) {
  int json_mode = 0;
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--json") == 0)
      json_mode = 1;
  }
  if (!json_mode) {
    fprintf(stderr,
            "solderlab-physics\nUsage: solderlab-physics --json < request.json\n");
    return 2;
  }

  char *input = read_all_stdin();
  if (!input || !input[0]) {
    cJSON *root = base_response(0, "unverifiable");
    add_error(root, "empty stdin");
    emit_json(root);
    free(input);
    return 1;
  }
  cJSON *req = cJSON_Parse(input);
  free(input);
  if (!req) {
    cJSON *root = base_response(0, "unverifiable");
    add_error(root, "invalid JSON");
    emit_json(root);
    return 1;
  }
  int rc = dispatch(req);
  cJSON_Delete(req);
  return rc;
}
