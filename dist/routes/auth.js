"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../lib/db");
const router = (0, express_1.Router)();
function isValidRole(role) {
    return role === 'user' || role === 'manager' || role === 'admin';
}
router.post('/login', async (req, res) => {
    try {
        const name = String(req.body?.name ?? '').trim();
        const role = String(req.body?.role ?? '').trim();
        let departmentName = (req.body?.department ?? req.body?.departmentName ?? '').toString().trim();
        if (!name || !isValidRole(role))
            return res.status(400).json({ error: 'Invalid name or role' });
        if (role === 'admin')
            departmentName = '';
        const pool = await (0, db_1.getPool)();
        // Resolve or create department if needed
        let departmentId = null;
        if (role !== 'admin') {
            if (departmentName) {
                const depSel = await pool.request().input('DepName', departmentName).query(`SELECT DepartmentId FROM dbo.Departments WHERE Name = @DepName`);
                if (depSel.recordset.length > 0) {
                    departmentId = depSel.recordset[0].DepartmentId;
                }
                else {
                    const depIns = await pool.request().input('DepName', departmentName).query(`
            DECLARE @newId UNIQUEIDENTIFIER = NEWID();
            INSERT INTO dbo.Departments (DepartmentId, Name) VALUES (@newId, @DepName);
            SELECT @newId AS DepartmentId;
          `);
                    departmentId = depIns.recordset[0].DepartmentId;
                }
            }
            else {
                const depEng = await pool.request().query(`SELECT TOP 1 DepartmentId FROM dbo.Departments WHERE Name=N'Engineering'`);
                if (depEng.recordset.length > 0) {
                    departmentId = depEng.recordset[0].DepartmentId;
                }
                else {
                    const depAny = await pool.request().query(`SELECT TOP 1 DepartmentId FROM dbo.Departments ORDER BY Name ASC`);
                    if (depAny.recordset.length > 0) {
                        departmentId = depAny.recordset[0].DepartmentId;
                    }
                    else {
                        const depCreate = await pool.request().input('DepName', 'Engineering').query(`
              DECLARE @newId UNIQUEIDENTIFIER = NEWID();
              INSERT INTO dbo.Departments (DepartmentId, Name) VALUES (@newId, @DepName);
              SELECT @newId AS DepartmentId;
            `);
                        departmentId = depCreate.recordset[0].DepartmentId;
                    }
                }
            }
        }
        // existing
        const existing = await pool.request()
            .input('Name', name)
            .input('Role', role)
            .input('DepartmentId', departmentId)
            .query(`
        SELECT TOP 1 u.UserId, u.Name, u.Role, u.DepartmentId, d.Name AS Department
        FROM dbo.Users u
        LEFT JOIN dbo.Departments d ON d.DepartmentId = u.DepartmentId
        WHERE u.Name = @Name AND u.Role = @Role
          AND ((@DepartmentId IS NULL AND u.DepartmentId IS NULL) OR (u.DepartmentId = @DepartmentId))
      `);
        if (existing.recordset.length > 0)
            return res.status(200).json({ user: existing.recordset[0] });
        // create
        const inserted = await pool.request()
            .input('Name', name)
            .input('Role', role)
            .input('DepartmentId', departmentId)
            .query(`
        DECLARE @newId UNIQUEIDENTIFIER = NEWID();
        INSERT INTO dbo.Users (UserId, Name, Role, DepartmentId)
        VALUES (@newId, @Name, @Role, @DepartmentId);
        SELECT u.UserId, u.Name, u.Role, u.DepartmentId, d.Name AS Department
        FROM dbo.Users u LEFT JOIN dbo.Departments d ON d.DepartmentId = u.DepartmentId
        WHERE u.UserId = @newId;
      `);
        return res.status(201).json({ user: inserted.recordset[0] });
    }
    catch (err) {
        return res.status(500).json({ error: 'Login failed', detail: String(err?.message ?? err) });
    }
});
exports.default = router;
