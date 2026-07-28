import React, {useEffect, useMemo, useState} from 'react';
import { RedocStandalone } from 'redoc';

type RateLimit = {
  per_minute?: number;
  per_hour?: number;
  concurrent?: number;
  tiers?: Record<string, { per_minute?: number; per_hour?: number; concurrent?: number }>;
  strict?: boolean;
};

const LANGS = [
  'JavaScript',
  'Python',
  'Go',
  'Java',
  'Ruby',
  'PHP',
  'cURL',
];

function buildExample(lang: string, baseUrl: string, endpoint: string) {
  const url = `${baseUrl}${endpoint}`;
  switch (lang) {
    case 'Python':
      return `import requests\n\nurl = "${url}"\nheaders = {"Authorization": "Bearer {API_KEY}"}\nresp = requests.get(url, headers=headers)\nprint(resp.status_code, resp.text)`;
    case 'JavaScript':
      return `const fetch = require('node-fetch')\n\nconst url = '${url}'\nconst res = await fetch(url, { headers: { 'Authorization': 'Bearer {API_KEY}' } })\nconst body = await res.text()\nconsole.log(res.status, body)`;
    case 'Go':
      return `package main\n\nimport (\n  \"fmt\"\n  \"net/http\"\n)\n\nfunc main() {\n  req, _ := http.NewRequest(\"GET\", \"${url}\", nil)\n  req.Header.Set(\"Authorization\", \"Bearer {API_KEY}\")\n  resp, _ := http.DefaultClient.Do(req)\n  defer resp.Body.Close()\n  fmt.Println(resp.Status)\n}`;
    case 'Java':
      return `import java.net.*;\nimport java.io.*;\n\nclass Example {\n  public static void main(String[] args) throws Exception {\n    URL url = new URL(\"${url}\");\n    HttpURLConnection con = (HttpURLConnection) url.openConnection();\n    con.setRequestProperty(\"Authorization\", \"Bearer {API_KEY}\");\n    System.out.println(con.getResponseCode());\n  }\n}`;
    case 'Ruby':
      return `require 'net/http'\n\nuri = URI('${url}')\nreq = Net::HTTP::Get.new(uri)\nreq['Authorization'] = 'Bearer {API_KEY}'\nres = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme==\"https\") { |http| http.request(req) }\nputs res.code`;
    case 'PHP':
      return `<?php\n$ch = curl_init();\ncurl_setopt($ch, CURLOPT_URL, '${url}');\ncurl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer {API_KEY}']);\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\n$res = curl_exec($ch);\necho curl_getinfo($ch, CURLINFO_HTTP_CODE);\n?>`;
    case 'cURL':
    default:
      return `curl -X GET '${url}' -H 'Authorization: Bearer {API_KEY}'`;
  }
}

export default function ApiReference(): React.JSX.Element {
  const [specPaths, setSpecPaths] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('/');
  const [rateLimit, setRateLimit] = useState<RateLimit | null>(null);
  const [desiredPerMinute, setDesiredPerMinute] = useState<number>(60);
  const [batchSize, setBatchSize] = useState<number>(1);
  const [lang, setLang] = useState<string>(() => {
    try { return localStorage.getItem('pp_lang_pref') || LANGS[0]; } catch { return LANGS[0]; }
  });

  useEffect(() => { localStorage.setItem('pp_lang_pref', lang); }, [lang]);

  useEffect(() => {
    // Fetch and minimal-parse openapi.yaml to extract paths and optional x-rate-limit extensions.
    fetch('/openapi.yaml')
      .then(r => r.text())
      .then(text => {
        const lines = text.split(/\r?\n/);
        const paths: string[] = [];
        let currentPath: string | null = null;
        const limitsForPath: Record<string, RateLimit> = {};
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i].trimEnd();
          const m = ln.match(/^\s*\/\S.*:$/);
          if (m) {
            currentPath = ln.trim().replace(/:$/, '');
            paths.push(currentPath);
            continue;
          }
          if (currentPath) {
            const trim = ln.trim();
            // Look for extension keys like x-rate-limit, x-rate-limits, x-limit
            if (/^x[-_]rate[-_]limit/i.test(trim) || /^x[-_]limits/i.test(trim) || /^x[-_]ratelimit/i.test(trim)) {
              // very small parse: look forward a few lines for numeric keys
              const rl: RateLimit = {};
              for (let j = i+1; j < Math.min(i+8, lines.length); j++) {
                const t = lines[j].trim();
                const m2 = t.match(/per[_- ]?minute:\s*(\d+)/i) || t.match(/requests[_- ]?per[_- ]?minute:\s*(\d+)/i) || t.match(/minute:\s*(\d+)/i);
                if (m2) rl.per_minute = Number(m2[1]);
                const m3 = t.match(/per[_- ]?hour:\s*(\d+)/i) || t.match(/hour:\s*(\d+)/i);
                if (m3) rl.per_hour = Number(m3[1]);
                const m4 = t.match(/concurrent:\s*(\d+)/i) || t.match(/concurrency:\s*(\d+)/i);
                if (m4) rl.concurrent = Number(m4[1]);
                if (/strict:\s*(true|yes|1)/i.test(t)) rl.strict = true;
              }
              limitsForPath[currentPath] = rl;
            }
          }
        }
        setSpecPaths(paths.length ? paths : ['/']);
        if (paths.length) {
          setSelectedPath(paths[0]);
          if (limitsForPath[paths[0]]) setRateLimit(limitsForPath[paths[0]]);
          else setRateLimit(null);
        }
      })
      .catch(() => { setSpecPaths(['/']); setRateLimit(null); });
  }, []);

  useEffect(() => {
    // Attempt to re-parse openapi.yaml to get rate limits for the selected path
    if (!selectedPath) return;
    fetch('/openapi.yaml')
      .then(r => r.text())
      .then(text => {
        const chunk = text.split(selectedPath)[1] || '';
        const rl: RateLimit = {};
        const lines = chunk.split(/\r?\n/).slice(0, 20);
        for (const ln of lines) {
          const t = ln.trim();
          const m2 = t.match(/per[_- ]?minute:\s*(\d+)/i) || t.match(/requests[_- ]?per[_- ]?minute:\s*(\d+)/i) || t.match(/minute:\s*(\d+)/i);
          if (m2) rl.per_minute = Number(m2[1]);
          const m3 = t.match(/per[_- ]?hour:\s*(\d+)/i) || t.match(/hour:\s*(\d+)/i);
          if (m3) rl.per_hour = Number(m3[1]);
          const m4 = t.match(/concurrent:\s*(\d+)/i) || t.match(/concurrency:\s*(\d+)/i);
          if (m4) rl.concurrent = Number(m4[1]);
          if (/strict:\s*(true|yes|1)/i.test(t)) rl.strict = true;
        }
        setRateLimit(Object.keys(rl).length ? rl : null);
      })
      .catch(() => setRateLimit(null));
  }, [selectedPath]);

  const baseUrl = useMemo(() => {
    // Use window origin as base URL for examples (placeholder)
    try { return window.location.origin; } catch { return 'https://api.example.com'; }
  }, []);

  const perSecond = useMemo(() => (desiredPerMinute / 60), [desiredPerMinute]);
  const feasible = useMemo(() => {
    if (!rateLimit || !rateLimit.per_minute) return true; // unknown => assume ok
    return desiredPerMinute <= rateLimit.per_minute;
  }, [desiredPerMinute, rateLimit]);

  return (
    <div style={{ position: 'relative' }}>
      <RedocStandalone
        specUrl="/openapi.yaml"
        options={{
          hideHostname: false,
          disableSearch: false,
          expandResponses: '200,201',
          requiredPropsFirst: true,
          sortPropsAlphabetically: true,
        }}
      />

      <aside className="pp-rate-widget" aria-live="polite">
        <h4>Endpoint Rate Limits</h4>
        <label>Endpoint</label>
        <select value={selectedPath} onChange={e => setSelectedPath(e.target.value)}>
          {specPaths.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <div className="pp-rate-details">
          <strong>Limits</strong>
          {rateLimit ? (
            <ul>
              <li>Requests / minute: {rateLimit.per_minute ?? '—'}</li>
              <li>Requests / hour: {rateLimit.per_hour ?? '—'}</li>
              <li>Concurrent: {rateLimit.concurrent ?? '—'}</li>
            </ul>
          ) : (
            <div className="pp-muted">No explicit limits found; using global defaults.</div>
          )}
          {rateLimit?.strict && <div className="pp-alert">Strict limits applied to this endpoint</div>}
        </div>

        <div className="pp-calc">
          <strong>Calculator</strong>
          <label>Desired requests / minute</label>
          <input type="number" value={desiredPerMinute} onChange={e => setDesiredPerMinute(Number(e.target.value || 0))} />
          <label>Batch size per request</label>
          <input type="number" value={batchSize} onChange={e => setBatchSize(Number(e.target.value || 1))} />
          <div className="pp-calc-results">
            <div>{desiredPerMinute} requests/min = {perSecond.toFixed(2)} req/sec</div>
            <div>Effective items/sec = {(perSecond * batchSize).toFixed(2)}</div>
            <div className={feasible ? 'pp-ok' : 'pp-notok'}>
              {feasible ? 'Feasible within limits' : 'Not feasible: exceeds per-minute limit'}
            </div>
          </div>
        </div>

        <div className="pp-examples">
          <strong>Code Examples</strong>
          <div className="pp-lang-tabs">
            {LANGS.map(l => (
              <button key={l} className={l === lang ? 'active' : ''} onClick={() => setLang(l)}>{l}</button>
            ))}
          </div>
          <div className="pp-code-block">
            <pre>{buildExample(lang, baseUrl, selectedPath)}</pre>
            <button className="pp-copy" onClick={() => navigator.clipboard.writeText(buildExample(lang, baseUrl, selectedPath))}>Copy</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
