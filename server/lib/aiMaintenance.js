const { transaction, audit, requireRow } = require('./records');
const { fingerprint, validVector, EMBEDDING_VERSION } = require('./aiClient');
const eligible = record => record.maintenance_status === 'Closed' && record.source_type === 'real' && record.verified_by && record.verified_at && Boolean(record.resolution_summary?.trim());
async function triageTicket(db, ai, record, actor) {
  let result;
  try { result = await ai.triage(record.issue_description, record.id); } catch { result = null; }
  try {
    await transaction(db, async connection => {
      await requireRow(connection, 'maintenance', record.id, true);
      if (result) {
        await connection.query("UPDATE maintenance SET predicted_category=?, ai_confidence=?, ai_priority_suggestion=?, manual_triage_flag=?, safety_escalation_flag=?, ai_model_version=?, ai_taxonomy_version=?, ai_triaged_at=UTC_TIMESTAMP(), ai_status='completed', updated_at=UTC_TIMESTAMP() WHERE id=?",
          [result.category, result.score, result.priority_suggestion, result.manual_triage_required, result.safety_escalation_required, result.model_version, result.taxonomy_version, record.id]);
      } else {
        await connection.query("UPDATE maintenance SET manual_triage_flag=TRUE, ai_status='failed', updated_at=UTC_TIMESTAMP() WHERE id=?", [record.id]);
      }
      await audit(connection, actor, result ? 'ai_triage' : 'ai_unavailable', 'maintenance', record.id);
    });
  } catch { return { manual_triage_required: true, persisted: false, result: null }; }
  return { manual_triage_required: !result || result.manual_triage_required, persisted: true, result };
}
async function indexResolution(db, ai, record, actor) {
  if (!eligible(record)) return { status: 'ineligible' };
  const textHash = fingerprint(record.issue_description, record.resolution_summary);
  const [existing] = await db.query('SELECT model_version,text_fingerprint FROM maintenance_embeddings WHERE ticket_id=?', [record.id]);
  if (existing[0]?.model_version === EMBEDDING_VERSION && existing[0].text_fingerprint === textHash) {
    return transaction(db, async connection => {
      const current = await requireRow(connection, 'maintenance', record.id, true);
      if (!eligible(current) || fingerprint(current.issue_description, current.resolution_summary) !== textHash) return { status: 'ineligible' };
      if (current.resolution_index_status !== 'indexed') {
        await connection.query("UPDATE maintenance SET resolution_index_status='indexed' WHERE id=?", [record.id]);
        await audit(connection, actor, 'resolution_index_reused', 'maintenance', record.id);
      }
      return { status: 'indexed', reused: true };
    });
  }
  let result;
  try { result = await ai.index(record); } catch {
    await transaction(db, async connection => {
      const current = await requireRow(connection, 'maintenance', record.id, true);
      if (eligible(current)) {
        await connection.query("UPDATE maintenance SET resolution_index_status='failed' WHERE id=?", [record.id]);
        await audit(connection, actor, 'resolution_index_unavailable', 'maintenance', record.id);
      }
    });
    return { status: 'failed' };
  }
  return transaction(db, async connection => {
    const current = await requireRow(connection, 'maintenance', record.id, true);
    if (!eligible(current) || fingerprint(current.issue_description, current.resolution_summary) !== textHash) return { status: 'ineligible' };
    await connection.query('INSERT INTO maintenance_embeddings (ticket_id,model_version,dimensions,vector_json,text_fingerprint) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE model_version=VALUES(model_version),dimensions=VALUES(dimensions),vector_json=VALUES(vector_json),text_fingerprint=VALUES(text_fingerprint),updated_at=UTC_TIMESTAMP()',
      [record.id, result.model_version, result.dimensions, JSON.stringify(result.vector), result.text_fingerprint]);
    await connection.query("UPDATE maintenance SET resolution_index_status='indexed' WHERE id=?", [record.id]);
    await audit(connection, actor, 'resolution_indexed', 'maintenance', record.id);
    return { status: 'indexed', reused: false };
  });
}
async function recommendations(db, ai, record) {
  const [rows] = await db.query("SELECT m.id,m.asset_id,m.issue_description,m.resolution_summary,e.model_version,e.vector_json,e.text_fingerprint FROM maintenance m JOIN maintenance_embeddings e ON e.ticket_id=m.id WHERE m.maintenance_status='Closed' AND m.source_type='real' AND m.verified_by IS NOT NULL AND m.verified_at IS NOT NULL AND LENGTH(TRIM(m.resolution_summary))>0 AND e.model_version=? ORDER BY m.verified_at DESC,m.id DESC LIMIT 200", [EMBEDDING_VERSION]);
  const candidates = [];
  for (const row of rows) {
    try {
      const vector = JSON.parse(row.vector_json);
      if (!validVector(vector) || fingerprint(row.issue_description, row.resolution_summary) !== row.text_fingerprint) continue;
      candidates.push({ ticket_id: row.id, issue_description: row.issue_description, resolution_summary: row.resolution_summary, vector, model_version: row.model_version, status: 'Closed', verified: true, source_type: 'real' });
    } catch { /* Corrupt or stale embeddings are excluded, never used as repairs. */ }
  }
  if (!candidates.length) return { matches: [], fallback: 'manual', message: 'No verified historical repair is indexed. Technician diagnosis is required.', eligible_count: 0 };
  try { const result = await ai.recommend(record.issue_description, candidates); return { ...result, matches: result.matches.map(match => ({ ...match, asset_id: rows.find(row => row.id === match.ticket_id)?.asset_id })), eligible_count: candidates.length }; }
  catch { return { matches: [], fallback: 'manual', message: 'AI retrieval is unavailable. Technician diagnosis is required.', eligible_count: candidates.length }; }
}
module.exports = { eligible, triageTicket, indexResolution, recommendations };

