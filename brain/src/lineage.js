(function () {
  'use strict';
  const Brain = (globalThis.Brain = globalThis.Brain || {});

  // Column-aware lineage for the Tamsworth slice: source fields, Bronze, Silver, the Gold models, the four KPI tiles.
  // Node ids are the engine's own names (tests check every label against Engine.getContract()). An edge is [from, to];
  // an edge out of Silver names the fields it carries in FIELD_EDGES, so a source field reaches only the models and KPIs
  // that really use it, and a KPI is fed only by the fields that reach it.
  const BRONZE = 'bronze_tamsworth_vitals';
  const SILVER = 'silver_vital_observation';
  const SENSITIVE = ['patient_id', 'patient_name', 'patient_zip5', 'birth_date', 'encounter_epoch'];
  const SOURCES = SENSITIVE.concat(['vital_sequence', 'vital_code', 'vital_value', 'unit', 'cipher_suite']);
  const GOLD = ['fct_vital_observation', 'dim_patient', 'dim_vital_code', 'fct_census_daily'];
  const KPIS = ['Bed Occupancy', 'Abnormal Vital Rate', 'Avg Length of Stay', '30-Day Readmission Rate'];

  const node = (id, layer, sensitive) => Object.freeze(sensitive ? { id: id, label: id, layer: layer, sensitive: true } : { id: id, label: id, layer: layer });
  const nodes = Object.freeze([]
    .concat(SOURCES.map((f) => node(f, 0, SENSITIVE.indexOf(f) >= 0)))
    .concat([node(BRONZE, 1), node(SILVER, 2)])
    .concat(GOLD.map((g) => node(g, 3)))
    .concat(KPIS.map((k) => node(k, 4))));

  // The fields each Silver-to-Gold edge carries.
  const FIELD_EDGES = {
    'silver_vital_observation>fct_vital_observation': ['patient_id', 'encounter_epoch', 'vital_sequence', 'vital_code', 'vital_value', 'unit'],
    'silver_vital_observation>dim_patient': ['patient_id', 'patient_name', 'patient_zip5', 'birth_date', 'encounter_epoch'],
    'silver_vital_observation>dim_vital_code': ['vital_code', 'unit'],
    'silver_vital_observation>fct_census_daily': ['patient_id', 'encounter_epoch']
  };

  const edgeList = []
    .concat(SOURCES.map((f) => [f, BRONZE]))
    .concat([[BRONZE, SILVER]])
    .concat(GOLD.map((g) => [SILVER, g]))
    .concat([
      ['fct_vital_observation', 'Abnormal Vital Rate'],
      ['dim_vital_code', 'Abnormal Vital Rate'],
      ['dim_patient', '30-Day Readmission Rate'],
      ['fct_census_daily', 'Bed Occupancy'],
      ['fct_census_daily', 'Avg Length of Stay'],
      ['fct_census_daily', '30-Day Readmission Rate']
    ]);
  const edges = Object.freeze(edgeList.map((e) => Object.freeze(e)));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const has = (id) => typeof id === 'string' && byId.has(id);

  // The fields an edge carries: its own list, a source field's single field, or null (every field).
  function carried(e) {
    const own = FIELD_EDGES[e[0] + '>' + e[1]];
    if (own) return own;
    return byId.get(e[0]).layer === 0 ? [e[0]] : null;
  }
  const out = new Map(), into = new Map();
  nodes.forEach((n) => { out.set(n.id, []); into.set(n.id, []); });
  edges.forEach((e) => { out.get(e[0]).push(e); into.get(e[1]).push(e); });

  const finish = (set) => Array.from(set).sort();

  // Everything below a node. From a source field only edges that carry that field are followed; from any other node
  // everything below it counts.
  function downstream(id) {
    if (!has(id)) return [];
    const field = byId.get(id).layer === 0 ? id : null;
    const seen = new Set();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      out.get(cur).forEach((e) => {
        const f = carried(e);
        if (field !== null && f !== null && f.indexOf(field) < 0) return;
        if (!seen.has(e[1])) { seen.add(e[1]); stack.push(e[1]); }
      });
    }
    return finish(seen);
  }

  // Everything above a node, following only the fields that actually reach it.
  function upstream(id) {
    if (!has(id)) return [];
    const seen = new Set();
    const visit = (cur, allowed) => {
      into.get(cur).forEach((e) => {
        const f = carried(e);
        let next = allowed;
        if (f !== null) {
          next = allowed === null ? new Set(f) : new Set(f.filter((x) => allowed.has(x)));
          if (next.size === 0) return;
        }
        seen.add(e[0]);
        visit(e[0], next);
      });
    };
    visit(id, null);
    return finish(seen);
  }

  const feeds = (id) => (has(id) ? finish(new Set(out.get(id).map((e) => e[1]))) : []);
  const fedBy = (id) => (has(id) ? finish(new Set(into.get(id).map((e) => e[0]))) : []);
  const kpisFor = (id) => downstream(id).filter((x) => byId.get(x).layer === 4);

  Brain.lineage = { nodes: nodes, edges: edges, feeds: feeds, fedBy: fedBy, downstream: downstream, upstream: upstream, kpisFor: kpisFor };
})();
