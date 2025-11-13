import { Router } from 'express';
import { getPool } from '../lib/db';

const router = Router();

function isGuid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const re = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const nil = /^00000000-0000-0000-0000-000000000000$/;
  return re.test(value) || nil.test(value);
}

router.get('/', async (_req, res) => {
  try {
    const pool = await getPool();
    const rs = await pool.request().query(`
      SELECT r.RiskId, r.RiskNo, r.DepartmentId, d.Name AS Department, r.Name, r.Description,
             r.CategoryId,
             r.Identification, r.ExistingControlInPlace, r.PlanOfAction,
             r.Impact, r.Likelihood, r.Status, r.OwnerId, o.Name AS Owner,
             r.CreatedByUserId, u.Name AS CreatedByName,
             r.CreatedAtUtc, r.UpdatedAtUtc
      FROM dbo.Risks r
      JOIN dbo.Departments d ON d.DepartmentId = r.DepartmentId
      LEFT JOIN dbo.Owners o ON o.OwnerId = r.OwnerId
      LEFT JOIN dbo.Users u ON u.UserId = r.CreatedByUserId
      ORDER BY d.Name, r.RiskNo
    `);
    return res.json(rs.recordset);
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const pool = await getPool();
    // Resolve dept
    let departmentId = body.departmentId || null;
    if (!departmentId && body.createdByUserId) {
      if (isGuid(body.createdByUserId)) {
        const dep = await pool.request().input('uid', body.createdByUserId).query(`SELECT DepartmentId FROM dbo.Users WHERE UserId = @uid`);
        if (dep.recordset.length) departmentId = dep.recordset[0].DepartmentId;
      }
    }
    if (!departmentId && body.createdByName) {
      const depByName = await pool.request().input('uname', body.createdByName).query(`
        SELECT TOP 1 DepartmentId FROM dbo.Users WHERE Name = @uname
      `);
      if (depByName.recordset.length) departmentId = depByName.recordset[0].DepartmentId;
    }
    if (!departmentId) {
      const depAny = await pool.request().query(`SELECT TOP 1 DepartmentId FROM dbo.Departments ORDER BY Name`);
      departmentId = depAny.recordset[0]?.DepartmentId || null;
    }
    // Auto risk no
    let riskNo = body.riskNo || null;
    if (!riskNo && departmentId) {
      const rsNo = await pool.request().input('dep', departmentId).query(`
        SELECT MAX(CAST(SUBSTRING(RiskNo, 2, 10) AS INT)) AS MaxNo
        FROM dbo.Risks WHERE DepartmentId = @dep AND ISNUMERIC(SUBSTRING(RiskNo,2,10))=1
      `);
      const nextNo = (rsNo.recordset[0]?.MaxNo || 0) + 1;
      riskNo = `R${String(nextNo).padStart(3,'0')}`;
    }
    // Owner
    let ownerIdToUse: string | null = isGuid(body.ownerId) ? body.ownerId : null;
    if (!ownerIdToUse) {
      const ownerAny = await pool.request().query(`SELECT TOP 1 OwnerId FROM dbo.Owners ORDER BY Name`);
      ownerIdToUse = ownerAny.recordset[0]?.OwnerId || null;
    }
    if (!ownerIdToUse) {
      const createdOwner = await pool.request().input('OwnerName', 'Default Owner').query(`
        DECLARE @oid UNIQUEIDENTIFIER = NEWID();
        INSERT INTO dbo.Owners (OwnerId, Name) VALUES (@oid, @OwnerName);
        SELECT @oid AS OwnerId;
      `);
      ownerIdToUse = createdOwner.recordset[0]?.OwnerId || null;
    }
    const rq = pool.request();
    rq.input('DepartmentId', departmentId);
    rq.input('RiskNo', riskNo || body.riskNo);
    rq.input('Name', body.name);
    rq.input('Description', body.description);
    rq.input('Impact', body.impact);
    rq.input('Likelihood', body.likelihood);
    rq.input('Status', body.status);
    rq.input('OwnerId', ownerIdToUse);
    rq.input('CreatedByUserId', isGuid(body.createdByUserId) ? body.createdByUserId : null);
    rq.input('CategoryId', body.categoryId || null);
    rq.input('Identification', body.identification || null);
    rq.input('ExistingControlInPlace', body.existingControlInPlace || null);
    rq.input('PlanOfAction', body.planOfAction || null);
    const ins = await rq.query(`
      DECLARE @id UNIQUEIDENTIFIER = NEWID();
      INSERT INTO dbo.Risks (RiskId, DepartmentId, RiskNo, Name, Description, CategoryId, Identification, ExistingControlInPlace, PlanOfAction, Impact, Likelihood, Status, OwnerId, CreatedByUserId, CreatedAtUtc, UpdatedAtUtc)
      VALUES (@id, @DepartmentId, @RiskNo, @Name, @Description, @CategoryId, @Identification, @ExistingControlInPlace, @PlanOfAction, @Impact, @Likelihood, @Status, @OwnerId, @CreatedByUserId, SYSUTCDATETIME(), SYSUTCDATETIME());
      SELECT r.RiskId, r.RiskNo, r.DepartmentId, d.Name AS Department, r.Name, r.Description,
             r.CategoryId, r.Identification, r.ExistingControlInPlace, r.PlanOfAction,
             r.Impact, r.Likelihood, r.Status, r.OwnerId,
             r.CreatedByUserId, u.Name AS CreatedByName,
             r.CreatedAtUtc, r.UpdatedAtUtc
      FROM dbo.Risks r
      JOIN dbo.Departments d ON d.DepartmentId = r.DepartmentId
      LEFT JOIN dbo.Users u ON u.UserId = r.CreatedByUserId
      WHERE r.RiskId = @id;
    `);
    const newRisk = ins.recordset[0];
    // best-effort email same as Next route (omitted Graph fallback for brevity)
    try {
      const mgrs = await pool.request().input('dep', newRisk.DepartmentId).query(`
        SELECT TOP 5 Email FROM dbo.Users WHERE Role = 'manager' AND DepartmentId = @dep AND Email IS NOT NULL
      `);
      if (mgrs.recordset.length) {
        const to = mgrs.recordset.map((m:any)=>m.Email).join(',');
        const { default: nodemailer } = await import('nodemailer');
        const from = process.env.SMTP_FROM || (process.env.SMTP_USER || 'productanalyst.pushpa@kauveryhospital.com');
        const subject = `Approval needed: ${newRisk.RiskNo} - ${newRisk.Name}`;
        const text = `Dear Manager,\n\nA new risk has been raised and requires your approval.\n\nRisk ID: ${newRisk.RiskNo}\nTitle: ${newRisk.Name}\nRaised By: ${newRisk.CreatedByName || 'Unknown'}\nImpact: ${newRisk.Impact}\nLikelihood: ${newRisk.Likelihood}\nIdentification: ${newRisk.Identification || ''}\nStatus: ${newRisk.Status}\n\nPlease log in to review and take action.\n\nThanks.`;
        const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'true';
        const smtpUser = (process.env.SMTP_USER || '').trim();
        const smtpPass = (process.env.SMTP_PASS || '').trim();
        if (smtpUser && smtpPass) {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: smtpUser, pass: smtpPass },
            tls: { rejectUnauthorized }
          });
          try { await transporter.sendMail({ from, to, subject, text }); } catch {}
        }
      }
    } catch {}
    return res.status(201).json({ ok: true, risk: newRisk });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const riskId = req.params.id;
    const {
      name, description, impact, likelihood, status,
      identification, existingControlInPlace, planOfAction, categoryId, changedByUserId
    } = req.body || {};
    const pool = await getPool();
    const existingSel = await pool.request().input('RiskId', riskId).query(`
      SELECT Name, Description, Impact, Likelihood, Status, Identification, ExistingControlInPlace, PlanOfAction, CategoryId
      FROM dbo.Risks WHERE RiskId = @RiskId
    `);
    const existing = existingSel.recordset[0] || {};
    const rq = pool.request();
    rq.input('RiskId', riskId);
    if (name !== undefined) rq.input('Name', name);
    if (description !== undefined) rq.input('Description', description);
    if (impact !== undefined) rq.input('Impact', impact);
    if (likelihood !== undefined) rq.input('Likelihood', likelihood);
    if (status !== undefined) rq.input('Status', status);
    if (identification !== undefined) rq.input('Identification', identification);
    if (existingControlInPlace !== undefined) rq.input('ExistingControlInPlace', existingControlInPlace);
    if (planOfAction !== undefined) rq.input('PlanOfAction', planOfAction);
    if (categoryId !== undefined) rq.input('CategoryId', categoryId);
    const sets: string[] = [];
    if (name !== undefined) sets.push('Name = @Name');
    if (description !== undefined) sets.push('Description = @Description');
    if (impact !== undefined) sets.push('Impact = @Impact');
    if (likelihood !== undefined) sets.push('Likelihood = @Likelihood');
    if (status !== undefined) sets.push('Status = @Status');
    if (identification !== undefined) sets.push('Identification = @Identification');
    if (existingControlInPlace !== undefined) sets.push('ExistingControlInPlace = @ExistingControlInPlace');
    if (planOfAction !== undefined) sets.push('PlanOfAction = @PlanOfAction');
    if (categoryId !== undefined) sets.push('CategoryId = @CategoryId');
    sets.push('UpdatedAtUtc = SYSUTCDATETIME()');
    if (!sets.length) return res.json({ ok: true });
    const sql = `
      UPDATE dbo.Risks
      SET ${sets.join(', ')}
      WHERE RiskId = @RiskId
    `;
    await rq.query(sql);
    const changes: Array<{ field: string; oldVal: any; newVal: any }> = [];
    if (name !== undefined && name !== existing.Name) changes.push({ field: 'Name', oldVal: existing.Name, newVal: name });
    if (description !== undefined && description !== existing.Description) changes.push({ field: 'Description', oldVal: existing.Description, newVal: description });
    if (impact !== undefined && impact !== existing.Impact) changes.push({ field: 'Impact', oldVal: existing.Impact, newVal: impact });
    if (likelihood !== undefined && likelihood !== existing.Likelihood) changes.push({ field: 'Likelihood', oldVal: existing.Likelihood, newVal: likelihood });
    if (status !== undefined && status !== existing.Status) changes.push({ field: 'Status', oldVal: existing.Status, newVal: status });
    if (identification !== undefined && identification !== existing.Identification) changes.push({ field: 'Identification', oldVal: existing.Identification, newVal: identification });
    if (existingControlInPlace !== undefined && existingControlInPlace !== existing.ExistingControlInPlace) changes.push({ field: 'ExistingControlInPlace', oldVal: existing.ExistingControlInPlace, newVal: existingControlInPlace });
    if (planOfAction !== undefined && planOfAction !== existing.PlanOfAction) changes.push({ field: 'PlanOfAction', oldVal: existing.PlanOfAction, newVal: planOfAction });
    if (categoryId !== undefined && categoryId !== existing.CategoryId) changes.push({ field: 'CategoryId', oldVal: existing.CategoryId, newVal: categoryId });
    if (changes.length) {
      const histRq = pool.request();
      histRq.input('RiskId', riskId);
      if (changedByUserId) histRq.input('ChangedByUserId', changedByUserId);
      const valuesSql: string[] = [];
      changes.forEach((c, idx) => {
        histRq.input(`Field${idx}`, String(c.field));
        histRq.input(`Old${idx}`, c.oldVal === undefined || c.oldVal === null ? null : String(c.oldVal));
        histRq.input(`New${idx}`, c.newVal === undefined || c.newVal === null ? null : String(c.newVal));
        valuesSql.push(`(@RiskId, SYSUTCDATETIME(), ${changedByUserId ? '@ChangedByUserId' : 'NULL'}, @Field${idx}, @Old${idx}, @New${idx})`);
      });
      const insSql = `
        INSERT INTO dbo.RiskHistory (RiskId, ChangedAtUtc, ChangedByUserId, FieldName, OldValue, NewValue)
        VALUES ${valuesSql.join(',')};
      `;
      await histRq.query(insSql);
    }
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const riskId = req.params.id;
    const pool = await getPool();
    const rq = pool.request();
    rq.input('RiskId', riskId);
    await rq.query(`DELETE FROM dbo.incidents_t WHERE RiskId = @RiskId`);
    await rq.query(`DELETE FROM dbo.Risks WHERE RiskId = @RiskId`);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const riskId = req.params.id;
    const pool = await getPool();
    const rs = await pool.request().input('RiskId', riskId).query(`
      SELECT h.RiskHistoryId, h.RiskId, h.ChangedAtUtc,
             h.ChangedByUserId, u.Name AS ChangedByName,
             h.FieldName, h.OldValue, h.NewValue
      FROM dbo.riskhistory h
      LEFT JOIN dbo.Users u ON u.UserId = h.ChangedByUserId
      WHERE h.RiskId = @RiskId
      ORDER BY h.ChangedAtUtc DESC, h.RiskHistoryId DESC
    `);
    return res.json(rs.recordset);
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;


