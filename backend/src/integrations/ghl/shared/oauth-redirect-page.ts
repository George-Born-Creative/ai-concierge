/**
 * GHL OAuth redirect page — HTML templates for loading, success, and error.
 * Source copy: redirect-page/src/oauth-redirect-page.ts
 */

export type OAuthRedirectStatus = 'loading' | 'ok' | 'error';

export type OAuthRedirectPageOptions = {
  status: OAuthRedirectStatus;
  deepLink?: string;
  reason?: string;
  /** When status is loading, URL for the finish API (same origin). */
  finishUrl?: string;
};

const BRAND = {
  bg: '#F8FAFF',
  text: '#202124',
  muted: '#5F6368',
  primary: '#1A73E8',
  success: '#188038',
  error: '#D93025',
};

export function buildDeepLink(
  returnBase: string,
  status: 'ok' | 'error',
  reason?: string,
): string {
  const params = new URLSearchParams({ status });
  if (reason) params.set('reason', reason);
  const separator = returnBase.includes('?') ? '&' : '?';
  return `${returnBase}${separator}${params.toString()}`;
}

export function renderOAuthRedirectPage(options: OAuthRedirectPageOptions): string {
  const { status, deepLink, reason, finishUrl } = options;

  if (status === 'loading' && finishUrl) {
    return pageShell({
      state: 'loading',
      title: 'Connecting…',
      body: loadingBody(),
      script: loadingScript(finishUrl),
    });
  }

  const isOk = status === 'ok';
  const headline = isOk
    ? 'GoHighLevel connected'
    : 'Connection failed';
  const sub = isOk
    ? 'Returning you to AI Concierge…'
    : reason
      ? escapeHtml(reason.slice(0, 200))
      : 'Return to the app and try connecting again.';
  const buttonLabel = isOk ? 'Return to AI Concierge' : 'Return to app';
  const safeLink = deepLink ? escapeHtml(deepLink) : '#';

  return pageShell({
    state: isOk ? 'success' : 'error',
    title: isOk ? 'Connected' : 'Connection failed',
    body: resultBody({
      isOk,
      headline,
      sub,
      buttonLabel,
      safeLink,
    }),
    script: deepLink ? autoRedirectScript(deepLink) : '',
  });
}

function pageShell(parts: {
  state: string;
  title: string;
  body: string;
  script: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(parts.title)} · AI Concierge</title>
  <style>${sharedStyles()}</style>
</head>
<body data-state="${escapeHtml(parts.state)}">
  <main class="card" role="main">
    ${logoBlock()}
    ${parts.body}
  </main>
  ${parts.script ? `<script>${parts.script}</script>` : ''}
</body>
</html>`;
}

function logoBlock(): string {
  return `<div class="brand" aria-hidden="true">
    <span class="brand-icon">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="28" height="28" rx="8" fill="${BRAND.primary}"/>
        <path d="M8 14h12M14 8v12" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    </span>
    <span class="brand-name">AI Concierge</span>
  </div>`;
}

function loadingBody(): string {
  return `<div class="status loading" aria-live="polite">
    <div class="spinner" role="status" aria-label="Connecting"></div>
    <h1>Connecting to GoHighLevel</h1>
    <p class="muted">Securing your account. This only takes a moment.</p>
  </div>
  <div class="status result hidden" aria-live="polite"></div>`;
}

function resultBody(opts: {
  isOk: boolean;
  headline: string;
  sub: string;
  buttonLabel: string;
  safeLink: string;
}): string {
  const icon = opts.isOk ? successIcon() : errorIcon();
  return `<div class="status result">
    ${icon}
    <h1>${escapeHtml(opts.headline)}</h1>
    <p class="muted">${opts.sub}</p>
    <a class="btn" href="${opts.safeLink}">${escapeHtml(opts.buttonLabel)}</a>
  </div>`;
}

function loadingScript(finishUrl: string): string {
  const safeFinish = JSON.stringify(finishUrl);
  return `(function(){
  var finishUrl=${safeFinish};
  var resultEl=document.querySelector('.status.result');
  var loadingEl=document.querySelector('.status.loading');
  function showResult(html,deepLink){
    if(loadingEl)loadingEl.classList.add('hidden');
    if(resultEl){resultEl.classList.remove('hidden');resultEl.innerHTML=html;}
    if(deepLink){setTimeout(function(){window.location.replace(deepLink);},300);}
  }
  function icon(ok){return ok?${JSON.stringify(successIcon())}:${JSON.stringify(errorIcon())};}
  fetch(finishUrl,{credentials:'same-origin'})
    .then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d};});})
    .then(function(res){
      var d=res.data||{};
      var ok=res.ok&&d.status==='ok';
      var link=d.deepLink||'';
      var reason=d.reason?String(d.reason).slice(0,200):'';
      var headline=ok?'GoHighLevel connected':'Connection failed';
      var sub=ok?'Returning you to AI Concierge…':(reason||'Return to the app and try again.');
      var btn=ok?'Return to AI Concierge':'Return to app';
      var html=icon(ok)+'<h1>'+headline+'</h1><p class="muted">'+sub+'</p>'+
        (link?'<a class="btn" href="'+link.replace(/"/g,'&quot;')+'">'+btn+'</a>':'');
      showResult(html,link);
    })
    .catch(function(){
      showResult(
        icon(false)+'<h1>Connection failed</h1><p class="muted">Could not reach the server. Return to the app and try again.</p>',
        ''
      );
    });
})();`;
}

function autoRedirectScript(deepLink: string): string {
  return `setTimeout(function(){window.location.replace(${JSON.stringify(deepLink)});},150);`;
}

function successIcon(): string {
  return `<div class="icon success" aria-hidden="true">
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill="#E6F4EA"/>
      <path d="M14 24l7 7 13-14" stroke="${BRAND.success}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>`;
}

function errorIcon(): string {
  return `<div class="icon error" aria-hidden="true">
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill="#FCE8E6"/>
      <path d="M16 16l16 16M32 16L16 32" stroke="${BRAND.error}" stroke-width="3" stroke-linecap="round"/>
    </svg>
  </div>`;
}

function sharedStyles(): string {
  return `
    *,*::before,*::after{box-sizing:border-box}
    body{
      margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      background:${BRAND.bg};color:${BRAND.text};
    }
    .card{max-width:400px;width:100%;text-align:center}
    .brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:32px}
    .brand-name{font-size:15px;font-weight:600;color:${BRAND.muted};letter-spacing:.02em}
    .status h1{font-size:22px;font-weight:600;margin:16px 0 8px;line-height:1.3}
    .muted{color:${BRAND.muted};font-size:15px;line-height:1.5;margin:0 0 24px}
    .hidden{display:none!important}
    .spinner{
      width:44px;height:44px;margin:0 auto 8px;border:3px solid #E8EAED;
      border-top-color:${BRAND.primary};border-radius:50%;
      animation:spin .8s linear infinite;
    }
    @keyframes spin{to{transform:rotate(360deg)}}
    .btn{
      display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;
      font-size:16px;font-weight:600;padding:14px 28px;border-radius:12px;
      transition:opacity .15s;
    }
    .btn:hover{opacity:.92}
    .icon{margin:0 auto 4px}
  `;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
