"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../lib/db");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    try {
        const pool = await (0, db_1.getPool)();
        const rs = await pool.request().query(`
      SELECT DepartmentId, Name
      FROM dbo.Departments
      ORDER BY Name
    `);
        return res.json(rs.recordset);
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
router.post('/', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name)
            return res.status(400).json({ error: 'Name is required' });
        const pool = await (0, db_1.getPool)();
        const exists = await pool.request().input('n', name).query(`SELECT DepartmentId FROM dbo.Departments WHERE Name = @n`);
        if (exists.recordset.length)
            return res.status(200).json({ department: exists.recordset[0], existed: true });
        const insert = await pool.request().input('n', name).query(`
      DECLARE @id UNIQUEIDENTIFIER = NEWID();
      INSERT INTO dbo.Departments(DepartmentId, Name) VALUES(@id, @n);
      SELECT DepartmentId, Name FROM dbo.Departments WHERE DepartmentId = @id;
    `);
        return res.status(201).json({ department: insert.recordset[0] });
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const departmentId = req.params.id;
        const name = String(req.body?.name || '').trim();
        if (!name)
            return res.status(400).json({ error: 'Name is required' });
        const pool = await (0, db_1.getPool)();
        await pool.request().input('DepartmentId', departmentId).input('Name', name).query(`
      UPDATE dbo.Departments SET Name = @Name WHERE DepartmentId = @DepartmentId;
    `);
        const rs = await pool.request().input('DepartmentId', departmentId).query(`
      SELECT DepartmentId, Name FROM dbo.Departments WHERE DepartmentId = @DepartmentId;
    `);
        if (!rs.recordset.length)
            return res.status(404).json({ error: 'Department not found' });
        return res.json({ department: rs.recordset[0] });
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
exports.default = router;
