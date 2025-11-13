import { Router } from 'express';
import { getPool } from '../lib/db';

const router = Router();

router.post('/unit', async (req, res) => {
  try {
    const body = req.body || {};
    const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];
    const emails: string[] = Array.isArray(body.emails) ? body.emails : [];
    const subject: string = String(body.subject || 'Unit Risk Notification');
    const content: string = String(body.content || '');

    const recipients: string[] = [];
    emails.forEach((e) => { const t = String(e || '').trim(); if (t) recipients.push(t); });
    if (userIds.length) {
      const pool = await getPool();
      const inList = userIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
      const rs = await pool.request().query(`SELECT Email FROM dbo.Users WHERE UserId IN (${inList}) AND Email IS NOT NULL`);
      for (const row of rs.recordset) {
        const t = String(row.Email || '').trim();
        if (t) recipients.push(t);
      }
    }
    const uniqueRecipients = Array.from(new Set(recipients));
    if (!uniqueRecipients.length) return res.status(400).json({ error: 'No recipients' });

    const { default: nodemailer } = await import('nodemailer');
    const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'true';
    const smtpUser = (process.env.SMTP_USER || 'productanalyst.pushpa@kauveryhospital.com').trim();
    const smtpPass = (process.env.SMTP_PASS || 'fprg nbfn ftat hngt').trim();
    const from = process.env.SMTP_FROM || smtpUser;
    if (!smtpUser || !smtpPass || !from) return res.status(500).json({ error: 'SMTP not configured' });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized },
      debug: process.env.SMTP_DEBUG === 'true'
    });
    await transporter.sendMail({ from, to: uniqueRecipients.join(','), subject, text: content });
    return res.json({ ok: true, sent: uniqueRecipients.length });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;


