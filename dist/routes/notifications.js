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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../lib/db");
const router = (0, express_1.Router)();
router.post('/unit', async (req, res) => {
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
exports.default = router;
