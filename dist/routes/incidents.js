"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../lib/db");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        const createdBy = req.query.createdBy;
        const riskId = req.query.riskId;
        const riskNo = req.query.riskNo;
        const department = req.query.department;
        const pool = await (0, db_1.getPool)();
        const rq = pool.request();
        let where = 'WHERE 1=1';
        if (createdBy) {
            rq.input('CreatedBy', createdBy);
            where += ' AND (i.CreatedByUserId = @CreatedBy OR r.CreatedByUserId = @CreatedBy)';
        }
        if (riskId) {
            rq.input('RiskId', riskId);
            where += ' AND i.RiskId = @RiskId';
        }
        if (riskNo) {
            rq.input('RiskNo', riskNo);
            where += ' AND r.RiskNo = @RiskNo';
        }
        if (department) {
            rq.input('DepName', department);
            where += ' AND d.Name = @DepName';
        }
        const rs = await rq.query(`
      SELECT i.IncidentId, i.RiskId, r.RiskNo,
             i.DepartmentId, d.Name AS Department,
             i.Summary, i.OccurredAtUtc, i.Description, i.MitigationSteps,
             i.CurrentStatusText, i.ClosedDateUtc,
             i.CreatedByUserId, i.CreatedAtUtc, i.UpdatedAtUtc
      FROM dbo.incidents_t i
      JOIN dbo.Risks r ON r.RiskId = i.RiskId
      JOIN dbo.Departments d ON d.DepartmentId = i.DepartmentId
      ${where}
      ORDER BY i.OccurredAtUtc DESC
    `);
        return res.json(rs.recordset);
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
router.post('/', async (req, res) => {
    try {
        const b = req.body || {};
        const pool = await (0, db_1.getPool)();
        const rq = pool.request();
        rq.input('RiskId', b.riskId);
        rq.input('DepartmentId', b.departmentId);
        rq.input('Summary', b.summary || null);
        rq.input('OccurredAtUtc', b.occurredAtUtc);
        rq.input('Description', b.description);
        rq.input('MitigationSteps', b.mitigationSteps || null);
        rq.input('CurrentStatusText', b.currentStatusText || null);
        rq.input('ClosedDateUtc', b.closedDateUtc || null);
        rq.input('CreatedByUserId', b.createdByUserId || null);
        await rq.query(`
      INSERT INTO dbo.incidents_t (
        IncidentId, RiskId, DepartmentId, Summary, OccurredAtUtc, Description,
        MitigationSteps, CurrentStatusText, ClosedDateUtc,
        CreatedByUserId
      )
      VALUES (
        NEWID(), @RiskId, @DepartmentId, @Summary, @OccurredAtUtc, @Description,
        @MitigationSteps, @CurrentStatusText, @ClosedDateUtc,
        @CreatedByUserId
      )
    `);
        return res.status(201).json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const incidentId = req.params.id;
        const { summary, description, mitigationSteps, currentStatusText, closedDate, occurredAt } = req.body || {};
        const pool = await (0, db_1.getPool)();
        const rq = pool.request();
        rq.input('IncidentId', incidentId);
        if (summary !== undefined)
            rq.input('Summary', summary);
        if (description !== undefined)
            rq.input('Description', description);
        if (mitigationSteps !== undefined)
            rq.input('MitigationSteps', mitigationSteps);
        if (currentStatusText !== undefined)
            rq.input('CurrentStatusText', currentStatusText);
        if (closedDate !== undefined)
            rq.input('ClosedDateUtc', closedDate ? new Date(closedDate) : null);
        if (occurredAt !== undefined)
            rq.input('OccurredAtUtc', occurredAt ? new Date(occurredAt) : null);
        const sets = [];
        if (summary !== undefined)
            sets.push('Summary = @Summary');
        if (description !== undefined)
            sets.push('Description = @Description');
        if (mitigationSteps !== undefined)
            sets.push('MitigationSteps = @MitigationSteps');
        if (currentStatusText !== undefined)
            sets.push('CurrentStatusText = @CurrentStatusText');
        if (closedDate !== undefined)
            sets.push('ClosedDateUtc = @ClosedDateUtc');
        if (occurredAt !== undefined)
            sets.push('OccurredAtUtc = @OccurredAtUtc');
        sets.push('UpdatedAtUtc = SYSUTCDATETIME()');
        if (!sets.length)
            return res.json({ ok: true });
        const sql = `
      UPDATE dbo.incidents_t
      SET ${sets.join(', ')}
      WHERE IncidentId = @IncidentId
    `;
        await rq.query(sql);
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
router.get('/:id/history', async (req, res) => {
    try {
        const id = req.params.id;
        const pool = await (0, db_1.getPool)();
        const rs = await pool.request().input('IncidentId', id).query(`
      SELECT IncidentHistoryId, IncidentId, ChangedAtUtc, ChangedByUserId, FieldName, OldValue, NewValue
      FROM dbo.IncidentHistory
      WHERE IncidentId = @IncidentId
      ORDER BY ChangedAtUtc DESC
    `);
        return res.json(rs.recordset);
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
exports.default = router;
