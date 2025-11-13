"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../lib/db");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    try {
        const pool = await (0, db_1.getPool)();
        const rs = await pool.request().query(`
      SELECT u.UserId, u.Name, u.Email, u.Role, u.DepartmentId, d.Name AS Department,
             u.EmployeeId, u.Unit, u.IsUnitHead
      FROM dbo.Users u
      LEFT JOIN dbo.Departments d ON d.DepartmentId = u.DepartmentId
      ORDER BY u.Name
    `);
        return res.json(rs.recordset);
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
router.post('/', async (req, res) => {
    try {
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const email = body.email ? String(body.email).trim() : null;
        const role = String(body.role || '').trim().toLowerCase();
        const departmentName = String(body.department || '').trim();
        let employeeId = body.employeeId ? String(body.employeeId).trim() : null;
        const unit = body.unit ? String(body.unit).trim() : null;
        const isUnitHead = Boolean(body.isUnitHead === true || body.isUnitHead === 'true' || body.isUnitHead === 1);
        if (!name)
            return res.status(400).json({ error: 'Name is required' });
        if (!['user', 'manager', 'admin', 'unit_head'].includes(role))
            return res.status(400).json({ error: 'Invalid role' });
        if (employeeId) {
            const six = /^[0-9]{6}$/;
            const full = /^[0-9]{6}@kauveryhospital\.com$/i;
            if (six.test(employeeId)) {
                employeeId = `${employeeId}@kauveryhospital.com`;
            }
            else if (full.test(employeeId)) {
                const digits = employeeId.substring(0, 6);
                employeeId = `${digits}@kauveryhospital.com`;
            }
            else {
                return res.status(400).json({ error: 'Employee ID must be 6 digits or 6digits@kauveryhospital.com' });
            }
        }
        const pool = await (0, db_1.getPool)();
        let departmentId = null;
        if (role !== 'admin' && role !== 'unit_head') {
            const depName = departmentName || 'Engineering';
            const depSel = await pool.request().input('dn', depName).query(`SELECT DepartmentId FROM dbo.Departments WHERE Name = @dn`);
            if (depSel.recordset.length) {
                departmentId = depSel.recordset[0].DepartmentId;
            }
            else {
                const ins = await pool.request().input('dn', depName).query(`
          DECLARE @id UNIQUEIDENTIFIER = NEWID();
          INSERT INTO dbo.Departments(DepartmentId, Name) VALUES(@id, @dn);
          SELECT @id AS DepartmentId;
        `);
                departmentId = ins.recordset[0].DepartmentId;
            }
        }
        if (employeeId) {
            const dup = await pool.request().input('Emp', employeeId).query(`SELECT TOP 1 UserId FROM dbo.Users WHERE EmployeeId = @Emp`);
            if (dup.recordset.length)
                return res.status(409).json({ error: 'Employee ID already exists' });
        }
        const rq = pool.request();
        rq.input('Name', name);
        rq.input('Email', email);
        rq.input('Role', ['admin', 'manager', 'unit_head'].includes(role) ? role : 'user');
        rq.input('DepartmentId', departmentId);
        rq.input('EmployeeId', employeeId);
        rq.input('Unit', unit);
        rq.input('IsUnitHead', isUnitHead ? 1 : 0);
        const created = await rq.query(`
      DECLARE @id UNIQUEIDENTIFIER = NEWID();
      INSERT INTO dbo.Users(UserId, Name, Email, Role, DepartmentId, EmployeeId, Unit, IsUnitHead)
      VALUES(@id, @Name, @Email, @Role, @DepartmentId, @EmployeeId, @Unit, @IsUnitHead);
      SELECT u.UserId, u.Name, u.Email, u.Role, u.DepartmentId, d.Name AS Department,
             u.EmployeeId, u.Unit, u.IsUnitHead
      FROM dbo.Users u LEFT JOIN dbo.Departments d ON d.DepartmentId = u.DepartmentId
      WHERE u.UserId = @id;
    `);
        return res.status(201).json({ user: created.recordset[0] });
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const body = req.body || {};
        const name = body.name !== undefined ? String(body.name).trim() : undefined;
        const email = body.email !== undefined ? String(body.email).trim() : undefined;
        const role = body.role !== undefined ? String(body.role).trim().toLowerCase() : undefined;
        const departmentName = body.department !== undefined ? String(body.department).trim() : undefined;
        const unit = body.unit !== undefined ? String(body.unit).trim() : undefined;
        const isUnitHead = body.isUnitHead !== undefined ? Boolean(body.isUnitHead === true || body.isUnitHead === 'true' || body.isUnitHead === 1) : undefined;
        let employeeId = body.employeeId !== undefined ? String(body.employeeId).trim() : undefined;
        const pool = await (0, db_1.getPool)();
        const existing = await pool.request().input('UserId', userId).query(`
      SELECT UserId, Name, Email, Role, DepartmentId, Unit, IsUnitHead, EmployeeId FROM dbo.Users WHERE UserId = @UserId
    `);
        if (!existing.recordset.length)
            return res.status(404).json({ error: 'User not found' });
        let nextRole = existing.recordset[0].Role;
        if (role) {
            if (!['user', 'manager', 'admin', 'unit_head'].includes(role))
                return res.status(400).json({ error: 'Invalid role' });
            nextRole = role;
        }
        let nextDepartmentId = existing.recordset[0].DepartmentId ?? null;
        if (nextRole === 'admin' || nextRole === 'unit_head') {
            nextDepartmentId = null;
        }
        else if (departmentName !== undefined) {
            if (departmentName === '')
                return res.status(400).json({ error: 'Department is required for user/manager' });
            const depSel = await pool.request().input('dn', departmentName).query(`SELECT DepartmentId FROM dbo.Departments WHERE Name = @dn`);
            if (depSel.recordset.length) {
                nextDepartmentId = depSel.recordset[0].DepartmentId;
            }
            else {
                const ins = await pool.request().input('dn', departmentName).query(`
          DECLARE @id UNIQUEIDENTIFIER = NEWID();
          INSERT INTO dbo.Departments(DepartmentId, Name) VALUES(@id, @dn);
          SELECT @id AS DepartmentId;
        `);
                nextDepartmentId = ins.recordset[0].DepartmentId;
            }
        }
        if (employeeId !== undefined) {
            if (employeeId === null || employeeId === '') {
                employeeId = existing.recordset[0].EmployeeId;
            }
            else {
                const six = /^[0-9]{6}$/;
                const full = /^[0-9]{6}@kauveryhospital\.com$/i;
                if (six.test(employeeId)) {
                    employeeId = `${employeeId}@kauveryhospital.com`;
                }
                else if (full.test(employeeId)) {
                    const digits = employeeId.substring(0, 6);
                    employeeId = `${digits}@kauveryhospital.com`;
                }
                else {
                    return res.status(400).json({ error: 'Employee ID must be 6 digits or 6digits@kauveryhospital.com' });
                }
                const dup = await pool.request().input('Emp', employeeId).input('UserId', userId).query(`SELECT TOP 1 UserId FROM dbo.Users WHERE EmployeeId = @Emp AND UserId <> @UserId`);
                if (dup.recordset.length)
                    return res.status(409).json({ error: 'Employee ID already exists' });
            }
        }
        else {
            employeeId = existing.recordset[0].EmployeeId;
        }
        const rq = pool.request();
        rq.input('UserId', userId);
        rq.input('Name', name ?? existing.recordset[0].Name);
        rq.input('Email', email ?? existing.recordset[0].Email);
        rq.input('Role', nextRole);
        rq.input('DepartmentId', nextDepartmentId);
        rq.input('Unit', unit !== undefined ? unit : existing.recordset[0].Unit);
        rq.input('IsUnitHead', isUnitHead !== undefined ? (isUnitHead ? 1 : 0) : existing.recordset[0].IsUnitHead);
        rq.input('EmployeeId', employeeId);
        await rq.query(`
      UPDATE dbo.Users
      SET Name = @Name,
          Email = @Email,
          Role = @Role,
          DepartmentId = @DepartmentId,
          Unit = @Unit,
          IsUnitHead = @IsUnitHead,
          EmployeeId = @EmployeeId
      WHERE UserId = @UserId;
    `);
        const updated = await pool.request().input('UserId', userId).query(`
      SELECT u.UserId, u.Name, u.Email, u.Role, u.DepartmentId, d.Name AS Department,
             u.EmployeeId, u.Unit, u.IsUnitHead
      FROM dbo.Users u LEFT JOIN dbo.Departments d ON d.DepartmentId = u.DepartmentId
      WHERE u.UserId = @UserId;
    `);
        return res.json({ user: updated.recordset[0] });
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
exports.default = router;
