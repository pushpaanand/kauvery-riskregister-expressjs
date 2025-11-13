"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./lib/db");
dotenv_1.default.config({ path: '.env.local' });
dotenv_1.default.config({ path: '.env' });
dotenv_1.default.config({ path: '../.env.local' });
dotenv_1.default.config({ path: '../.env' });
dotenv_1.default.config({ path: '../../.env.local' });
dotenv_1.default.config({ path: '../../.env' });
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/api/health', (_req, res) => res.json({ ok: true }));
function isGuid(value) {
    if (typeof value !== 'string')
        return false;
    const re = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const nil = /^00000000-0000-0000-0000-000000000000$/;
    return re.test(value) || nil.test(value);
}
// AI: ping
app.get('/api/ai/ping', async (_req, res) => {
    try {
        const endpointRaw = process.env.AZURE_OPENAI_ENDPOINT || process.env.NEXT_PUBLIC_AZURE_OPENAI_ENDPOINT;
        const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.NEXT_PUBLIC_AZURE_OPENAI_API_KEY;
        const apiVersion = process.env.AZURE_OPENAI_API_VERSION || process.env.NEXT_PUBLIC_AZURE_OPENAI_API_VERSION || '2025-01-01-preview';
        const deployment = process.env.AZURE_OPENAI_COMPLETION_DEPLOYMENT
            || process.env.AZURE_OPENAI_CHAT_DEPLOYMENT
            || process.env.NEXT_PUBLIC_AZURE_OPENAI_COMPLETION_DEPLOYMENT
            || process.env.NEXT_PUBLIC_AZURE_OPENAI_CHAT_DEPLOYMENT;
        if (!endpointRaw || !apiKey)
            return res.status(500).json({ error: 'Missing endpoint or apiKey in env' });
        const normalizedEndpoint = String(endpointRaw).trim().replace(/^http:\/\//i, 'https://');
        const isFullUrl = /\/openai\/deployments\//i.test(normalizedEndpoint);
        const body = {
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: "Say 'hi'" },
            ],
            temperature: 0,
            max_tokens: 5,
            model: deployment,
        };
        if (isFullUrl) {
            const hasVersion = /[?&]api-version=/.test(normalizedEndpoint);
            const url = hasVersion ? normalizedEndpoint : `${normalizedEndpoint}${normalizedEndpoint.includes('?') ? '&' : '?'}api-version=${encodeURIComponent(apiVersion)}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
                const r = await fetch(url, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'api-key': apiKey },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
                const text = await r.text();
                if (!r.ok)
                    return res.status(502).json({ error: 'Azure error', status: r.status, body: text, used: { endpoint: normalizedEndpoint, apiVersion } });
                let json = {};
                try {
                    json = JSON.parse(text);
                }
                catch { }
                const reply = json?.choices?.[0]?.message?.content ?? text;
                return res.json({ ok: true, reply, used: { endpoint: normalizedEndpoint, apiVersion } });
            }
            catch (e) {
                return res.status(502).json({ error: 'REST call failed', message: String(e?.message || e), used: { endpoint: normalizedEndpoint, apiVersion } });
            }
            finally {
                clearTimeout(timeout);
            }
        }
        try {
            const { AzureOpenAI } = await Promise.resolve().then(() => __importStar(require('openai')));
            const resourceEndpoint = normalizedEndpoint.replace(/\/$/, '');
            // @ts-ignore
            const client = new AzureOpenAI({ endpoint: resourceEndpoint, apiKey, deployment, apiVersion });
            const resp = await client.chat.completions.create({
                messages: body.messages,
                temperature: body.temperature,
                max_tokens: body.max_tokens,
                model: deployment,
            });
            const text = resp?.choices?.[0]?.message?.content || '';
            return res.json({ ok: true, reply: text, used: { endpoint: resourceEndpoint, deployment, apiVersion } });
        }
        catch (sdkErr) {
            try {
                if (/\.openai\.azure\.com\/?$/i.test(normalizedEndpoint)) {
                    const { AzureOpenAI } = await Promise.resolve().then(() => __importStar(require('openai')));
                    const alt = normalizedEndpoint.replace(/\.openai\.azure\.com\/?$/i, '.cognitiveservices.azure.com/').replace(/\/$/, '');
                    // @ts-ignore
                    const client2 = new AzureOpenAI({ endpoint: alt, apiKey, deployment, apiVersion });
                    const resp2 = await client2.chat.completions.create({
                        messages: body.messages, temperature: body.temperature, max_tokens: body.max_tokens, model: deployment
                    });
                    const text2 = resp2?.choices?.[0]?.message?.content || '';
                    return res.json({ ok: true, reply: text2, used: { endpoint: alt, deployment, apiVersion } });
                }
            }
            catch { }
            return res.status(502).json({ error: 'SDK call failed', message: String(sdkErr?.message || sdkErr), used: { endpoint: normalizedEndpoint, deployment, apiVersion } });
        }
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
// AI: summary
app.post('/api/ai/summary', async (req, res) => {
    try {
        const { department, risks, role, userName, incidents } = req.body || {};
        if (!Array.isArray(risks) || risks.length === 0)
            return res.status(400).json({ error: 'No risks provided' });
        const endpointRaw = process.env.AZURE_OPENAI_ENDPOINT || process.env.NEXT_PUBLIC_AZURE_OPENAI_ENDPOINT;
        const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.NEXT_PUBLIC_AZURE_OPENAI_API_KEY;
        const apiVersion = process.env.AZURE_OPENAI_API_VERSION || process.env.NEXT_PUBLIC_AZURE_OPENAI_API_VERSION;
        const deployment = process.env.AZURE_OPENAI_COMPLETION_DEPLOYMENT
            || process.env.AZURE_OPENAI_CHAT_DEPLOYMENT
            || process.env.NEXT_PUBLIC_AZURE_OPENAI_COMPLETION_DEPLOYMENT
            || process.env.NEXT_PUBLIC_AZURE_OPENAI_CHAT_DEPLOYMENT;
        if (!endpointRaw || !apiKey || !apiVersion)
            return res.status(500).json({ error: 'Missing Azure OpenAI environment configuration' });
        const scopeLine = (() => {
            const dept = department || 'All';
            const r = (role || '').toLowerCase();
            if (r === 'user')
                return `Scope: Summarize ONLY the user's visible risks in department ${dept}. User: ${userName || 'N/A'}.`;
            if (r === 'manager')
                return `Scope: Summarize ONLY risks for department ${dept}.`;
            if (r === 'admin')
                return dept === 'All' ? 'Scope: Summarize organization-wide risks across all departments.' : `Scope: Summarize ONLY risks for department ${dept}.`;
            return `Scope: Summarize risks for department ${dept}.`;
        })();
        const userPrompt = [
            scopeLine,
            'IMPORTANT: Use ONLY the lists provided below.',
            'Formatting rules (strict):',
            '- Start with the header: Risk Summary',
            '- Then write bullets for risks using "- " (no numbers, no bold).',
            '- One sentence per bullet; each bullet on a separate line.',
            '- Each risk bullet must include: RiskNo/Name, Impact, Likelihood, and a short recommended action.',
            incidents && Array.isArray(incidents) && incidents.length ? '- After risk bullets, add an empty line and the header: Incident Summary' : '',
            incidents && Array.isArray(incidents) && incidents.length ? '- Under Incident Summary, group by risk: first a bullet "- <RiskNo or Name>:", followed by sub-bullets "- " for each incident (summary, YYYY-MM, status).' : '',
            '- Do not include extra symbols or numbering; use plain hyphens only.',
            '- Keep language simple and clear.',
            '- Prioritize Severe and Significant risks first.'
        ].filter(Boolean).join('\n');
        const risksText = risks.map((r) => `- riskNo=${r.riskNo || ''}; name=${r.name || ''}; impact=${r.impact || ''}; likelihood=${r.likelihood || ''}; status=${r.status || ''}; dept=${r.department || ''}`).join('\n');
        const incidentsText = (Array.isArray(incidents) ? incidents : [])
            .map((i) => `- riskNo=${i.RiskNo || i.riskNo || ''}; summary=${i.Summary || i.summary || ''}; occurred=${(i.OccurredAtUtc || i.occurredAt || '').toString().slice(0, 7)}; status=${i.CurrentStatusText || i.currentStatusText || ''}`)
            .join('\n');
        const body = {
            messages: [
                { role: 'system', content: 'You are a professional risk management assistant. Always return concise bullet points using plain hyphens (- ). One sentence per bullet. No numbering, no bold, no tables.' },
                { role: 'user', content: `${userPrompt}\n\nRisks:\n${risksText}${(incidents && Array.isArray(incidents) && incidents.length) ? `\n\nIncidents:\n${incidentsText}` : ''}` },
            ],
            temperature: 0.3,
            max_tokens: 800,
        };
        if (deployment)
            body.model = deployment;
        const normalizedEndpoint = String(endpointRaw || '').trim().replace(/^http:\/\//i, 'https://');
        const isFullUrl = /\/openai\/deployments\//i.test(normalizedEndpoint);
        if (!isFullUrl && !deployment)
            return res.status(500).json({ error: 'Missing deployment name: set AZURE_OPENAI_COMPLETION_DEPLOYMENT' });
        try {
            const { AzureOpenAI } = await Promise.resolve().then(() => __importStar(require('openai')));
            const resourceEndpoint = isFullUrl ? normalizedEndpoint.split('/openai/')[0] : normalizedEndpoint.replace(/\/$/, '');
            // @ts-ignore
            const client = new AzureOpenAI({ endpoint: resourceEndpoint, apiKey, deployment, apiVersion });
            const response = await client.chat.completions.create({
                messages: body.messages,
                max_tokens: body.max_tokens,
                temperature: body.temperature,
                model: deployment,
            });
            const content = response?.choices?.[0]?.message?.content || '';
            return res.json({ summary: content });
        }
        catch { }
        let url;
        if (isFullUrl) {
            const hasVersion = /[?&]api-version=/.test(normalizedEndpoint);
            url = hasVersion ? normalizedEndpoint : `${normalizedEndpoint}${normalizedEndpoint.includes('?') ? '&' : '?'}api-version=${encodeURIComponent(apiVersion)}`;
        }
        else {
            const base = normalizedEndpoint.replace(/\/$/, '');
            url = `${base}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'api-key': apiKey },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!resp.ok) {
                const text = await resp.text();
                return res.status(502).json({ error: `Azure OpenAI error: ${resp.status} ${text}` });
            }
            const data = await resp.json();
            const content = data?.choices?.[0]?.message?.content || '';
            return res.json({ summary: content });
        }
        catch (err) {
            return res.status(502).json({ error: 'Upstream Azure OpenAI fetch failed', message: String(err?.message || err) });
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
// Auth: login
app.post('/api/auth/login', async (req, res) => {
    try {
        const name = String(req.body?.name ?? '').trim();
        const role = String(req.body?.role ?? '').trim();
        let departmentName = (req.body?.department ?? req.body?.departmentName ?? '').toString().trim();
        if (!name || !['user', 'manager', 'admin'].includes(role))
            return res.status(400).json({ error: 'Invalid name or role' });
        if (role === 'admin')
            departmentName = '';
        const pool = await (0, db_1.getPool)();
        // Resolve department if needed
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
        // Find or create
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
// Departments
app.get('/api/departments', async (_req, res) => {
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
app.post('/api/departments', async (req, res) => {
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
app.put('/api/departments/:id', async (req, res) => {
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
// Incidents
app.get('/api/incidents', async (req, res) => {
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
app.post('/api/incidents', async (req, res) => {
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
app.put('/api/incidents/:id', async (req, res) => {
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
app.get('/api/incidents/:id/history', async (req, res) => {
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
// Notifications
app.post('/api/notifications/unit', async (req, res) => {
    try {
        const body = req.body || {};
        const userIds = Array.isArray(body.userIds) ? body.userIds : [];
        const emails = Array.isArray(body.emails) ? body.emails : [];
        const subject = String(body.subject || 'Unit Risk Notification');
        const content = String(body.content || '');
        const recipients = [];
        emails.forEach((e) => { const t = String(e || '').trim(); if (t)
            recipients.push(t); });
        if (userIds.length) {
            const pool = await (0, db_1.getPool)();
            const inList = userIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
            const rs = await pool.request().query(`SELECT Email FROM dbo.Users WHERE UserId IN (${inList}) AND Email IS NOT NULL`);
            for (const row of rs.recordset) {
                const t = String(row.Email || '').trim();
                if (t)
                    recipients.push(t);
            }
        }
        const uniqueRecipients = Array.from(new Set(recipients));
        if (!uniqueRecipients.length)
            return res.status(400).json({ error: 'No recipients' });
        const { default: nodemailer } = await Promise.resolve().then(() => __importStar(require('nodemailer')));
        const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'true';
        const smtpUser = (process.env.SMTP_USER || 'productanalyst.pushpa@kauveryhospital.com').trim();
        const smtpPass = (process.env.SMTP_PASS || 'fprg nbfn ftat hngt').trim();
        const from = process.env.SMTP_FROM || smtpUser;
        if (!smtpUser || !smtpPass || !from)
            return res.status(500).json({ error: 'SMTP not configured' });
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: smtpUser, pass: smtpPass },
            tls: { rejectUnauthorized },
            debug: process.env.SMTP_DEBUG === 'true'
        });
        await transporter.sendMail({ from, to: uniqueRecipients.join(','), subject, text: content });
        return res.json({ ok: true, sent: uniqueRecipients.length });
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
// Risks
app.get('/api/risks', async (_req, res) => {
    try {
        const pool = await (0, db_1.getPool)();
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
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
app.post('/api/risks', async (req, res) => {
    try {
        const body = req.body || {};
        const pool = await (0, db_1.getPool)();
        let departmentId = body.departmentId || null;
        if (!departmentId && body.createdByUserId) {
            if (isGuid(body.createdByUserId)) {
                const dep = await pool.request().input('uid', body.createdByUserId).query(`SELECT DepartmentId FROM dbo.Users WHERE UserId = @uid`);
                if (dep.recordset.length)
                    departmentId = dep.recordset[0].DepartmentId;
            }
        }
        if (!departmentId && body.createdByName) {
            const depByName = await pool.request().input('uname', body.createdByName).query(`
        SELECT TOP 1 DepartmentId FROM dbo.Users WHERE Name = @uname
      `);
            if (depByName.recordset.length)
                departmentId = depByName.recordset[0].DepartmentId;
        }
        if (!departmentId) {
            const depAny = await pool.request().query(`SELECT TOP 1 DepartmentId FROM dbo.Departments ORDER BY Name`);
            departmentId = depAny.recordset[0]?.DepartmentId || null;
        }
        let riskNo = body.riskNo || null;
        if (!riskNo && departmentId) {
            const rsNo = await pool.request().input('dep', departmentId).query(`
        SELECT MAX(CAST(SUBSTRING(RiskNo, 2, 10) AS INT)) AS MaxNo
        FROM dbo.Risks WHERE DepartmentId = @dep AND ISNUMERIC(SUBSTRING(RiskNo,2,10))=1
      `);
            const nextNo = (rsNo.recordset[0]?.MaxNo || 0) + 1;
            riskNo = `R${String(nextNo).padStart(3, '0')}`;
        }
        let ownerIdToUse = isGuid(body.ownerId) ? body.ownerId : null;
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
        try {
            const mgrs = await pool.request().input('dep', newRisk.DepartmentId).query(`
        SELECT TOP 5 Email FROM dbo.Users WHERE Role = 'manager' AND DepartmentId = @dep AND Email IS NOT NULL
      `);
            if (mgrs.recordset.length) {
                const to = mgrs.recordset.map((m) => m.Email).join(',');
                const { default: nodemailer } = await Promise.resolve().then(() => __importStar(require('nodemailer')));
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
                    try {
                        await transporter.sendMail({ from, to, subject, text });
                    }
                    catch { }
                }
            }
        }
        catch { }
        return res.status(201).json({ ok: true, risk: newRisk });
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
app.put('/api/risks/:id', async (req, res) => {
    try {
        const riskId = req.params.id;
        const { name, description, impact, likelihood, status, identification, existingControlInPlace, planOfAction, categoryId, changedByUserId } = req.body || {};
        const pool = await (0, db_1.getPool)();
        const existingSel = await pool.request().input('RiskId', riskId).query(`
      SELECT Name, Description, Impact, Likelihood, Status, Identification, ExistingControlInPlace, PlanOfAction, CategoryId
      FROM dbo.Risks WHERE RiskId = @RiskId
    `);
        const existing = existingSel.recordset[0] || {};
        const rq = pool.request();
        rq.input('RiskId', riskId);
        if (name !== undefined)
            rq.input('Name', name);
        if (description !== undefined)
            rq.input('Description', description);
        if (impact !== undefined)
            rq.input('Impact', impact);
        if (likelihood !== undefined)
            rq.input('Likelihood', likelihood);
        if (status !== undefined)
            rq.input('Status', status);
        if (identification !== undefined)
            rq.input('Identification', identification);
        if (existingControlInPlace !== undefined)
            rq.input('ExistingControlInPlace', existingControlInPlace);
        if (planOfAction !== undefined)
            rq.input('PlanOfAction', planOfAction);
        if (categoryId !== undefined)
            rq.input('CategoryId', categoryId);
        const sets = [];
        if (name !== undefined)
            sets.push('Name = @Name');
        if (description !== undefined)
            sets.push('Description = @Description');
        if (impact !== undefined)
            sets.push('Impact = @Impact');
        if (likelihood !== undefined)
            sets.push('Likelihood = @Likelihood');
        if (status !== undefined)
            sets.push('Status = @Status');
        if (identification !== undefined)
            sets.push('Identification = @Identification');
        if (existingControlInPlace !== undefined)
            sets.push('ExistingControlInPlace = @ExistingControlInPlace');
        if (planOfAction !== undefined)
            sets.push('PlanOfAction = @PlanOfAction');
        if (categoryId !== undefined)
            sets.push('CategoryId = @CategoryId');
        sets.push('UpdatedAtUtc = SYSUTCDATETIME()');
        if (!sets.length)
            return res.json({ ok: true });
        const sql = `
      UPDATE dbo.Risks
      SET ${sets.join(', ')}
      WHERE RiskId = @RiskId
    `;
        await rq.query(sql);
        const changes = [];
        if (name !== undefined && name !== existing.Name)
            changes.push({ field: 'Name', oldVal: existing.Name, newVal: name });
        if (description !== undefined && description !== existing.Description)
            changes.push({ field: 'Description', oldVal: existing.Description, newVal: description });
        if (impact !== undefined && impact !== existing.Impact)
            changes.push({ field: 'Impact', oldVal: existing.Impact, newVal: impact });
        if (likelihood !== undefined && likelihood !== existing.Likelihood)
            changes.push({ field: 'Likelihood', oldVal: existing.Likelihood, newVal: likelihood });
        if (status !== undefined && status !== existing.Status)
            changes.push({ field: 'Status', oldVal: existing.Status, newVal: status });
        if (identification !== undefined && identification !== existing.Identification)
            changes.push({ field: 'Identification', oldVal: existing.Identification, newVal: identification });
        if (existingControlInPlace !== undefined && existingControlInPlace !== existing.ExistingControlInPlace)
            changes.push({ field: 'ExistingControlInPlace', oldVal: existing.ExistingControlInPlace, newVal: existingControlInPlace });
        if (planOfAction !== undefined && planOfAction !== existing.PlanOfAction)
            changes.push({ field: 'PlanOfAction', oldVal: existing.PlanOfAction, newVal: planOfAction });
        if (categoryId !== undefined && categoryId !== existing.CategoryId)
            changes.push({ field: 'CategoryId', oldVal: existing.CategoryId, newVal: categoryId });
        if (changes.length) {
            const histRq = pool.request();
            histRq.input('RiskId', riskId);
            if (changedByUserId)
                histRq.input('ChangedByUserId', changedByUserId);
            const valuesSql = [];
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
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
app.delete('/api/risks/:id', async (req, res) => {
    try {
        const riskId = req.params.id;
        const pool = await (0, db_1.getPool)();
        const rq = pool.request();
        rq.input('RiskId', riskId);
        await rq.query(`DELETE FROM dbo.incidents_t WHERE RiskId = @RiskId`);
        await rq.query(`DELETE FROM dbo.Risks WHERE RiskId = @RiskId`);
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
app.get('/api/risks/:id/history', async (req, res) => {
    try {
        const riskId = req.params.id;
        const pool = await (0, db_1.getPool)();
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
    }
    catch (e) {
        return res.status(500).json({ error: String(e?.message || e) });
    }
});
// Users
app.get('/api/users', async (_req, res) => {
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
app.post('/api/users', async (req, res) => {
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
            if (six.test(employeeId))
                employeeId = `${employeeId}@kauveryhospital.com`;
            else if (full.test(employeeId)) {
                const digits = employeeId.substring(0, 6);
                employeeId = `${digits}@kauveryhospital.com`;
            }
            else
                return res.status(400).json({ error: 'Employee ID must be 6 digits or 6digits@kauveryhospital.com' });
        }
        const pool = await (0, db_1.getPool)();
        let departmentId = null;
        if (role !== 'admin' && role !== 'unit_head') {
            const depName = departmentName || 'Engineering';
            const depSel = await pool.request().input('dn', depName).query(`SELECT DepartmentId FROM dbo.Departments WHERE Name = @dn`);
            if (depSel.recordset.length)
                departmentId = depSel.recordset[0].DepartmentId;
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
app.put('/api/users/:id', async (req, res) => {
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
                if (six.test(employeeId))
                    employeeId = `${employeeId}@kauveryhospital.com`;
                else if (full.test(employeeId)) {
                    const digits = employeeId.substring(0, 6);
                    employeeId = `${digits}@kauveryhospital.com`;
                }
                else
                    return res.status(400).json({ error: 'Employee ID must be 6 digits or 6digits@kauveryhospital.com' });
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
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Express API listening on http://localhost:${port}`);
});
