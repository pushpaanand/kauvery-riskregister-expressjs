import { Router } from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env.local' });
dotenv.config({ path: '../.env' });
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

const router = Router();

router.get('/ping', async (_req, res) => {
  try {
    const endpointRaw = process.env.AZURE_OPENAI_ENDPOINT || process.env.NEXT_PUBLIC_AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.NEXT_PUBLIC_AZURE_OPENAI_API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || process.env.NEXT_PUBLIC_AZURE_OPENAI_API_VERSION || '2025-01-01-preview';
    const deployment = process.env.AZURE_OPENAI_COMPLETION_DEPLOYMENT
      || process.env.AZURE_OPENAI_CHAT_DEPLOYMENT
      || process.env.NEXT_PUBLIC_AZURE_OPENAI_COMPLETION_DEPLOYMENT
      || process.env.NEXT_PUBLIC_AZURE_OPENAI_CHAT_DEPLOYMENT;
    if (!endpointRaw || !apiKey) return res.status(500).json({ error: 'Missing endpoint or apiKey in env' });
    const normalizedEndpoint = String(endpointRaw).trim().replace(/^http:\/\//i, 'https://');
    const isFullUrl = /\/openai\/deployments\//i.test(normalizedEndpoint);
    const body: any = {
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
        if (!r.ok) return res.status(502).json({ error: 'Azure error', status: r.status, body: text, used: { endpoint: normalizedEndpoint, apiVersion } });
        let json: any = {};
        try { json = JSON.parse(text); } catch {}
        const reply = json?.choices?.[0]?.message?.content ?? text;
        return res.json({ ok: true, reply, used: { endpoint: normalizedEndpoint, apiVersion } });
      } catch (e: any) {
        return res.status(502).json({ error: 'REST call failed', message: String(e?.message || e), used: { endpoint: normalizedEndpoint, apiVersion } });
      } finally {
        clearTimeout(timeout);
      }
    }
    try {
      const { AzureOpenAI } = await import('openai');
      const resourceEndpoint = normalizedEndpoint.replace(/\/$/, '');
      // @ts-ignore
      const client = new AzureOpenAI({ endpoint: resourceEndpoint, apiKey, deployment, apiVersion });
      const resp = await client.chat.completions.create({
        messages: body.messages,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        model: deployment as any,
      });
      const text: string = resp?.choices?.[0]?.message?.content || '';
      return res.json({ ok: true, reply: text, used: { endpoint: resourceEndpoint, deployment, apiVersion } });
    } catch (sdkErr: any) {
      try {
        if (/\.openai\.azure\.com\/?$/i.test(normalizedEndpoint)) {
          const { AzureOpenAI } = await import('openai');
          const alt = normalizedEndpoint.replace(/\.openai\.azure\.com\/?$/i, '.cognitiveservices.azure.com/').replace(/\/$/, '');
          // @ts-ignore
          const client2 = new AzureOpenAI({ endpoint: alt, apiKey, deployment, apiVersion });
          const resp2 = await client2.chat.completions.create({
            messages: body.messages, temperature: body.temperature, max_tokens: body.max_tokens, model: deployment as any
          });
          const text2: string = resp2?.choices?.[0]?.message?.content || '';
          return res.json({ ok: true, reply: text2, used: { endpoint: alt, deployment, apiVersion } });
        }
      } catch {}
      return res.status(502).json({ error: 'SDK call failed', message: String(sdkErr?.message || sdkErr), used: { endpoint: normalizedEndpoint, deployment, apiVersion } });
    }
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

router.post('/summary', async (req, res) => {
  try {
    const { department, risks, role, userName, incidents } = req.body || {};
    if (!Array.isArray(risks) || risks.length === 0) return res.status(400).json({ error: 'No risks provided' });
    const endpointRaw = process.env.AZURE_OPENAI_ENDPOINT || process.env.NEXT_PUBLIC_AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.NEXT_PUBLIC_AZURE_OPENAI_API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || process.env.NEXT_PUBLIC_AZURE_OPENAI_API_VERSION;
    const deployment = process.env.AZURE_OPENAI_COMPLETION_DEPLOYMENT
      || process.env.AZURE_OPENAI_CHAT_DEPLOYMENT
      || process.env.NEXT_PUBLIC_AZURE_OPENAI_COMPLETION_DEPLOYMENT
      || process.env.NEXT_PUBLIC_AZURE_OPENAI_CHAT_DEPLOYMENT;
    if (!endpointRaw || !apiKey || !apiVersion) return res.status(500).json({ error: 'Missing Azure OpenAI environment configuration' });
    const scopeLine = (() => {
      const dept = department || 'All';
      const r = (role || '').toLowerCase();
      if (r === 'user') return `Scope: Summarize ONLY the user's visible risks in department ${dept}. User: ${userName || 'N/A'}.`;
      if (r === 'manager') return `Scope: Summarize ONLY risks for department ${dept}.`;
      if (r === 'admin') return dept === 'All' ? 'Scope: Summarize organization-wide risks across all departments.' : `Scope: Summarize ONLY risks for department ${dept}.`;
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
    const risksText = risks.map((r: any) => `- riskNo=${r.riskNo || ''}; name=${r.name || ''}; impact=${r.impact || ''}; likelihood=${r.likelihood || ''}; status=${r.status || ''}; dept=${r.department || ''}`).join('\n');
    const incidentsText = (Array.isArray(incidents) ? incidents : [])
      .map((i: any) => `- riskNo=${i.RiskNo || i.riskNo || ''}; summary=${i.Summary || i.summary || ''}; occurred=${(i.OccurredAtUtc || i.occurredAt || '').toString().slice(0,7)}; status=${i.CurrentStatusText || i.currentStatusText || ''}`)
      .join('\n');
    const body: any = {
      messages: [
        { role: 'system', content: 'You are a professional risk management assistant. Always return concise bullet points using plain hyphens (- ). One sentence per bullet. No numbering, no bold, no tables.' },
        { role: 'user', content: `${userPrompt}\n\nRisks:\n${risksText}${(incidents && Array.isArray(incidents) && incidents.length) ? `\n\nIncidents:\n${incidentsText}` : ''}` },
      ],
      temperature: 0.3,
      max_tokens: 800,
    };
    if (deployment) body.model = deployment;
    const normalizedEndpoint = String(endpointRaw || '').trim().replace(/^http:\/\//i, 'https://');
    const isFullUrl = /\/openai\/deployments\//i.test(normalizedEndpoint);
    if (!isFullUrl && !deployment) return res.status(500).json({ error: 'Missing deployment name: set AZURE_OPENAI_COMPLETION_DEPLOYMENT' });
    try {
      const { AzureOpenAI } = await import('openai');
      const resourceEndpoint = isFullUrl ? normalizedEndpoint.split('/openai/')[0] : normalizedEndpoint.replace(/\/$/, '');
      // @ts-ignore
      const client = new AzureOpenAI({ endpoint: resourceEndpoint, apiKey, deployment, apiVersion });
      const response = await client.chat.completions.create({
        messages: body.messages,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        model: (deployment as any),
      });
      const content: string = (response as any)?.choices?.[0]?.message?.content || '';
      return res.json({ summary: content });
    } catch {
      // fall back to REST
    }
    let url: string;
    if (isFullUrl) {
      const hasVersion = /[?&]api-version=/.test(normalizedEndpoint);
      url = hasVersion ? normalizedEndpoint : `${normalizedEndpoint}${normalizedEndpoint.includes('?') ? '&' : '?'}api-version=${encodeURIComponent(apiVersion)}`;
    } else {
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
      const content: string = data?.choices?.[0]?.message?.content || '';
      return res.json({ summary: content });
    } catch (err: any) {
      return res.status(502).json({
        error: 'Upstream Azure OpenAI fetch failed',
        message: String(err?.message || err)
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;


