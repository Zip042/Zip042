import { Hono } from "hono";
import { clearEntries, readEntries } from "../lib/debug-recorder.js";
import { loadEnv } from "../env.js";
import type { AppBindings } from "../middleware/auth.js";

/**
 * 관리자 디버그 콘솔.
 *
 * 어떤 요청이 들어와 무엇을 돌려줬는지, 어떤 외부 API 가 실제로 불렸는지,
 * AI 가 무엇을 읽었는지를 한 화면에서 봅니다.
 *
 * ⚠️ **로컬 전용입니다.** 여기에는 등기부에서 읽은 실제 주소·이름이 남습니다.
 *    `ZIP042_DEBUG_CONSOLE=true` 일 때만 붙고, 운영에서는 env 검증이 부팅을 막습니다.
 *    인증을 걸지 않은 것은 로컬 개발 도구이기 때문입니다 — 외부에 노출하지 마세요.
 */
export const debugRoute = new Hono<AppBindings>();

debugRoute.get("/_debug/events", (c) => {
  const after = Number(c.req.query("after") ?? 0);
  return c.json({ entries: readEntries(Number.isFinite(after) ? after : 0) });
});

debugRoute.delete("/_debug/events", (c) => {
  clearEntries();
  return c.json({ ok: true });
});

debugRoute.get("/_debug/state", (c) => {
  const env = loadEnv();
  return c.json({
    mode: env.mode,
    demo: env.ZIP042_DEMO,
    model: env.ANTHROPIC_MODEL,
    llmProvider: env.LLM_PROVIDER,
    keys: {
      supabase: Boolean(env.SUPABASE_URL),
      anthropic: Boolean(env.ANTHROPIC_API_KEY),
      gemini: Boolean(env.GEMINI_API_KEY),
      dataGoKr: Boolean(env.DATA_GO_KR_SERVICE_KEY),
      juso: Boolean(env.JUSO_CONFM_KEY),
      kakao: Boolean(env.KAKAO_REST_API_KEY),
      lawGoKr: Boolean(env.LAW_GO_KR_OC),
    },
  });
});

debugRoute.get("/_debug", (c) => c.html(PAGE));

const PAGE = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Zip042 디버그 콘솔</title>
<style>
  :root{--bg:#0d1117;--panel:#151b23;--line:#26303d;--ink:#e6edf3;--dim:#7d8590;
        --ok:#3fb950;--warn:#d29922;--err:#f85149;--brand:#2f81f7}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  header{position:sticky;top:0;background:var(--panel);border-bottom:1px solid var(--line);
         padding:12px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;z-index:2}
  h1{font-size:14px;margin:0;font-weight:700}
  .chip{padding:2px 8px;border-radius:999px;border:1px solid var(--line);font-size:11px;color:var(--dim)}
  .chip.on{color:var(--ok);border-color:#1f6f36}
  .chip.off{color:var(--dim)}
  .grow{flex:1}
  button{background:#21262d;color:var(--ink);border:1px solid var(--line);
         border-radius:6px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}
  button:hover{border-color:var(--brand)}
  input[type=search]{background:#0d1117;border:1px solid var(--line);border-radius:6px;
                     color:var(--ink);padding:5px 9px;font:inherit;font-size:12px;min-width:200px}
  main{padding:8px 0 60px}
  .row{display:grid;grid-template-columns:78px 62px 1fr auto;gap:10px;padding:7px 16px;
       border-bottom:1px solid #1b2430;align-items:baseline}
  .row:hover{background:#11171f}
  .t{color:var(--dim);font-size:11px}
  .lvl{font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  .info{color:var(--dim)} .warn{color:var(--warn)} .error{color:var(--err)} .debug{color:#6e7681}
  .msg{white-space:pre-wrap;word-break:break-word}
  .m{color:var(--brand);font-weight:700}
  .s-2{color:var(--ok)} .s-4{color:var(--warn)} .s-5{color:var(--err)}
  .dur{color:var(--dim);font-size:11px;text-align:right}
  details{margin-top:4px}
  summary{cursor:pointer;color:var(--dim);font-size:11px}
  pre{margin:6px 0 0;padding:8px 10px;background:#0b0f14;border:1px solid var(--line);
      border-radius:6px;overflow:auto;max-height:340px;font-size:11.5px}
  .empty{padding:40px 16px;color:var(--dim);text-align:center}
</style></head>
<body>
<header>
  <h1>Zip042 디버그 콘솔</h1>
  <span id="state" class="chip">…</span>
  <span class="grow"></span>
  <input type="search" id="q" placeholder="필터 (경로·메시지)"/>
  <label class="chip"><input type="checkbox" id="auto" checked/> 자동 새로고침</label>
  <button id="clear">비우기</button>
</header>
<main id="list"><div class="empty">요청을 기다리는 중… 화면에서 무언가를 해보세요.</div></main>
<script>
let after = 0, rows = [], paused = false;

async function loadState(){
  try{
    const s = await (await fetch('/v1/_debug/state')).json();
    const on = Object.entries(s.keys).filter(([,v])=>v).map(([k])=>k);
    document.getElementById('state').textContent =
      s.mode + (s.demo ? ' · demo' : '') + ' · ' + s.model + ' · 키 ' + on.length + '개';
    document.getElementById('state').className = 'chip ' + (s.mode==='live'?'on':'off');
  }catch{}
}

function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}

function render(){
  const q = document.getElementById('q').value.trim().toLowerCase();
  const list = document.getElementById('list');
  const shown = rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  if(!shown.length){ list.innerHTML = '<div class="empty">표시할 기록이 없습니다.</div>'; return; }
  list.innerHTML = shown.slice(-300).reverse().map(r => {
    const time = r.ts.slice(11,19);
    const statusCls = r.status ? 's-' + String(r.status)[0] : '';
    const head = r.kind === 'request'
      ? '<span class="m">'+esc(r.method)+'</span> '+esc(r.path)+
        ' <span class="'+statusCls+'">'+r.status+'</span>'
      : esc(r.message);
    const body = r.fields
      ? '<details><summary>자세히</summary><pre>'+esc(JSON.stringify(r.fields,null,2))+'</pre></details>'
      : '';
    return '<div class="row"><span class="t">'+time+'</span>'+
      '<span class="lvl '+r.level+'">'+r.level+'</span>'+
      '<span class="msg">'+head+body+'</span>'+
      '<span class="dur">'+(r.durationMs!=null?r.durationMs+'ms':'')+'</span></div>';
  }).join('');
}

async function poll(){
  if(paused || !document.getElementById('auto').checked) return;
  try{
    const r = await (await fetch('/v1/_debug/events?after='+after)).json();
    if(r.entries.length){
      rows = rows.concat(r.entries);
      after = r.entries[r.entries.length-1].seq;
      if(rows.length > 600) rows = rows.slice(-600);
      render();
    }
  }catch{}
}

document.getElementById('q').addEventListener('input', render);
document.getElementById('clear').addEventListener('click', async ()=>{
  await fetch('/v1/_debug/events',{method:'DELETE'});
  rows = []; after = 0; render();
});

loadState();
setInterval(poll, 700);
setInterval(loadState, 10000);
poll();
</script>
</body></html>`;
