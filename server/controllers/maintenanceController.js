const v = require('../lib/validation');
const { HttpError } = require('../lib/errors');
const { transaction, audit, requireRow } = require('../lib/records');
const { triageTicket, indexResolution, recommendations } = require('../lib/aiMaintenance');
const { AIClient } = require('../lib/aiClient');
const { transition } = require('../lib/lifecycle');
const isManager = user => ['Super Admin', 'Admin'].includes(user.role_name);
module.exports = (db, ai = new AIClient()) => ({
  addMaintenance: async (req, res) => {
    const body = req.body || {};
    const assetId = v.id(body.asset_id, 'asset_id');
    const issue = v.text(body.issue_description, 'issue_description', 5000, true);
    const status = v.text(body.maintenance_status, 'maintenance_status', 100) || 'Open';
    if (status !== 'Open') throw new HttpError(400, 'New maintenance records must start Open');
    if (body.technician_id || body.technician_name?.trim()) throw new HttpError(400, 'Assign an active technician after creating the ticket');
    const remarks = v.text(body.remarks, 'remarks', 5000);
    const priority = body.priority || 'Medium';
    const incident = body.incident_type || 'Failure';
    const source = isManager(req.user) ? body.source_type || 'real' : 'real';
    if (!['Low', 'Medium', 'High', 'Critical'].includes(priority)) throw new HttpError(400, 'Invalid priority');
    if (!['Failure', 'Preventive'].includes(incident)) throw new HttpError(400, 'Invalid incident_type');
    if (!['real', 'synthetic'].includes(source)) throw new HttpError(400, 'Invalid source_type');
    const id = await transaction(db, async connection => {
      const asset = await requireRow(connection, 'assets', assetId, true);
      if (asset.retired_at || asset.asset_status === 'Retired') throw new HttpError(409, 'Retired assets cannot receive new maintenance tickets');
      const [result] = await connection.query('INSERT INTO maintenance (asset_id, issue_description, maintenance_status, reporter_id, priority, incident_type, source_type, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [assetId, issue, 'Open', req.user.id, priority, incident, source, remarks]);
      await audit(connection, req.user.id, 'create', 'maintenance', result.insertId);
      return result.insertId;
    });
    const triage = await triageTicket(db, ai, { id, issue_description: issue }, req.user.id);
    res.status(201).json({ id, message: triage.manual_triage_required ? 'Maintenance recorded; manual triage required' : 'Maintenance recorded with an AI suggestion for review', ...triage });
  },
  getAllMaintenance: async (req, res) => {
    const [rows] = await db.query('SELECT m.*, u.full_name AS assigned_technician FROM maintenance m LEFT JOIN users u ON u.id=m.technician_id ORDER BY m.id DESC');
    res.json(rows);
  },
  getMaintenanceByAsset: async (req, res) => {
    const assetId = v.id(req.params.assetId, 'assetId');
    await requireRow(db, 'assets', assetId);
    const [rows] = await db.query('SELECT m.*, u.full_name AS assigned_technician FROM maintenance m LEFT JOIN users u ON u.id=m.technician_id WHERE m.asset_id=? ORDER BY m.id DESC', [assetId]);
    res.json(rows);
  },
  assignTechnician: async (req, res) => {
    const id = v.id(req.params.id);
    const technicianId = v.id(req.body?.technician_id, 'technician_id');
    await transaction(db, async connection => {
      const record = await requireRow(connection, 'maintenance', id, true);
      if (!['Open', 'Assigned'].includes(record.maintenance_status)) throw new HttpError(409, 'Assign only Open or Assigned tickets');
      const [users] = await connection.query('SELECT u.id, u.full_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.is_active=TRUE AND r.role_name=?', [technicianId, 'Technician']);
      if (!users[0]) throw new HttpError(400, 'Choose an active Technician account');
      await connection.query("UPDATE maintenance SET technician_id=?, technician_name=?, maintenance_status='Assigned', assigned_at=UTC_TIMESTAMP(), updated_at=UTC_TIMESTAMP() WHERE id=?", [technicianId, users[0].full_name, id]);
      await audit(connection, req.user.id, 'assign', 'maintenance', id);
    });
    res.json({ message: 'Technician assigned' });
  },
  updateStatus: async (req, res) => {
    const id = v.id(req.params.id);
    const target = v.text(req.body?.maintenance_status, 'maintenance_status', 100, true);
    const summary = v.text(req.body?.resolution_summary, 'resolution_summary', 10000);
    await transaction(db, async connection => {
      const record = await requireRow(connection, 'maintenance', id, true);
      if (!isManager(req.user) && (record.technician_id !== req.user.id || !['In Progress', 'Resolved'].includes(target))) throw new HttpError(403, 'Only the assigned technician can progress this ticket');
      const resolution = summary || record.resolution_summary;
      transition(record.maintenance_status, target, resolution);
      if (['In Progress', 'Resolved'].includes(target) && !record.technician_id) throw new HttpError(409, 'Assign a technician first');
      const resolved = ['Resolved', 'Closed'].includes(target);
      const closed = target === 'Closed';
      await connection.query('UPDATE maintenance SET maintenance_status=?, resolution_summary=?, resolved_at=IF(?,COALESCE(resolved_at,UTC_TIMESTAMP()),NULL), closed_at=IF(?,UTC_TIMESTAMP(),NULL), verified_by=?, verified_at=IF(?,UTC_TIMESTAMP(),NULL), resolution_index_status=?, technician_id=IF(?,NULL,technician_id), technician_name=IF(?,NULL,technician_name), updated_at=UTC_TIMESTAMP() WHERE id=?',
        [target, resolution, resolved, closed, closed ? req.user.id : null, closed, closed ? 'pending' : 'ineligible', target === 'Open', target === 'Open', id]);
      await audit(connection, req.user.id, 'status:' + target, 'maintenance', id);
    });
    let indexing = null;
    if (target === 'Closed') {
      try { indexing = await indexResolution(db, ai, await requireRow(db, 'maintenance', id), req.user.id); }
      catch { indexing = { status: 'failed' }; }
    }
    res.json({ message: indexing?.status === 'failed' ? 'Status updated; resolution indexing unavailable. Retry later.' : 'Maintenance status updated', indexing });
  },
  getRecommendations: async (req, res) => {
    const record = await requireRow(db, 'maintenance', v.id(req.params.id));
    res.json(await recommendations(db, ai, record));
  },
  retryTriage: async (req, res) => {
    const record = await requireRow(db, 'maintenance', v.id(req.params.id));
    if (!isManager(req.user) && record.reporter_id !== req.user.id && record.technician_id !== req.user.id) throw new HttpError(403, 'Only the reporter, assigned technician or manager may retry triage');
    const result = await triageTicket(db, ai, record, req.user.id);
    res.json({ ...result, message: result.manual_triage_required ? 'Manual triage required' : 'AI suggestion updated; review before acting' });
  },
  retryIndex: async (req, res) => {
    const record = await requireRow(db, 'maintenance', v.id(req.params.id));
    const result = await indexResolution(db, ai, record, req.user.id);
    res.json({ ...result, message: result.status === 'indexed' ? 'Verified resolution indexed' : 'Only real, verified Closed repairs can be indexed; retry if the AI service is unavailable' });
  },
  deleteMaintenance: async () => { throw new HttpError(409, 'Maintenance history is retained and cannot be deleted'); },
});
