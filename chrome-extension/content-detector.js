(() => {
  if (window.__jobFilterBadBoardDetectorLoaded) {
    if (typeof window.__jobFilterRunCheck === 'function') {
      window.__jobFilterRunCheck();
    }
    return;
  }
  window.__jobFilterBadBoardDetectorLoaded = true;

  const JOB_FILTER_API = 'http://localhost:8000';
  const IGNORED_HOSTS = ['localhost', '127.0.0.1'];
  const DEFAULT_BAD_DOMAINS = ['cims.com', 'icims.com'];
  const MULTI_TENANT_ATS = [
    'icims.com', 'cims.com', 'myworkdayjobs.com', 'workday.com',
    'taleo.net', 'successfactors.com', 'successfactors.eu',
    'greenhouse.io', 'lever.co', 'ashbyhq.com', 'smartrecruiters.com',
    'workable.com', 'breezy.hr', 'bamboohr.com', 'jobvite.com',
    'ultipro.com', 'dayforcehcm.com', 'brassring.com', 'oraclecloud.com',
    'pageuppeople.com', 'avature.net', 'recruitee.com', 'teamtailor.com'
  ];

  const currentHost = (window.location.hostname || '').toLowerCase().replace(/^www\./, '');
  if (!currentHost || IGNORED_HOSTS.some(h => currentHost === h || currentHost.endsWith('.' + h))) {
    return;
  }

  function extractCleanDomain(urlOrDomain) {
    if (!urlOrDomain) return '';
    try {
      const raw = urlOrDomain.includes('://') ? urlOrDomain : 'https://' + urlOrDomain;
      const u = new URL(raw);
      const host = (u.hostname || '').toLowerCase().replace(/^www\./, '');
      if (!host) return '';
      for (const ats of MULTI_TENANT_ATS) {
        if (host === ats || host.endsWith('.' + ats)) return ats;
      }
      const parts = host.split('.');
      if (parts.length >= 3 && ['co', 'com', 'org', 'net', 'gov'].includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) {
        return parts.slice(-3).join('.');
      }
      if (parts.length >= 2) {
        return parts.slice(-2).join('.');
      }
      return host;
    } catch (_) {
      return '';
    }
  }

  function collectIframeUrls() {
    const urls = [];
    document.querySelectorAll('iframe[src]').forEach(iframe => {
      const src = iframe.getAttribute('src') || iframe.src;
      if (src && src.startsWith('http')) {
        urls.push(src);
      }
    });
    return urls;
  }

  function matchLocalDomains(urls, badDomains) {
    const cleanBadList = Array.from(
      new Set([...DEFAULT_BAD_DOMAINS, ...(badDomains || [])].map(d => extractCleanDomain(d)).filter(Boolean))
    );
    if (cleanBadList.includes('cims.com') && !cleanBadList.includes('icims.com')) cleanBadList.push('icims.com');
    if (cleanBadList.includes('icims.com') && !cleanBadList.includes('cims.com')) cleanBadList.push('cims.com');

    for (const rawUrl of urls) {
      const dom = extractCleanDomain(rawUrl);
      if (dom && cleanBadList.includes(dom)) {
        return { domain: dom, hitUrl: rawUrl };
      }
    }
    return null;
  }

  function removeBadBoardBanner() {
    const existing = document.getElementById('__job_filter_bad_board_banner__');
    if (existing) existing.remove();
  }

  function showBadBoardBanner({ matchedDomain, reason, linkedJob }) {
    removeBadBoardBanner();

    const host = document.createElement('div');
    host.id = '__job_filter_bad_board_banner__';
    host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    const shadow = host.attachShadow({ mode: 'open' });
    const companyNote = linkedJob && linkedJob.company
      ? `<div style="margin-top:4px;font-size:12px;color:#fecaca;">🔗 Привязано к компании в Job Filter: <b>${linkedJob.title || ''} @ ${linkedJob.company}</b></div>`
      : '';

    shadow.innerHTML = `
      <style>
        .banner {
          background: linear-gradient(90deg, #7f1d1d 0%, #991b1b 50%, #450a0a 100%);
          color: #ffffff;
          border-bottom: 3px solid #ef4444;
          box-shadow: 0 10px 25px rgba(0,0,0,0.65);
          padding: 12px 20px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .title {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.2px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .badge {
          background: #ef4444;
          color: #fff;
          font-family: monospace;
          padding: 2px 8px;
          border-radius: 5px;
          font-size: 13px;
        }
        .sub {
          font-size: 12px;
          color: #fca5a5;
          margin-top: 2px;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        button {
          cursor: pointer;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 12px;
          border: none;
          transition: opacity 0.15s;
        }
        button:hover {
          opacity: 0.9;
        }
        .btn-dismiss {
          background: rgba(0,0,0,0.35);
          color: #fecaca;
          border: 1px solid rgba(255,255,255,0.25);
        }
      </style>
      <div class="banner">
        <div>
          <div class="title">
            <span>⛔ СТОП! В ЧЕРНОМ СПИСКЕ</span>
            <span class="badge">${matchedDomain || 'cims.com'}</span>
            <span>— НЕ ПЫТАЙСЯ ЕГО ЗАПОЛНЯТЬ!</span>
          </div>
          <div class="sub">${reason || 'На этом джоб-борде невозможно нормально заполнить форму отклика.'}</div>
          ${companyNote}
        </div>
        <div class="actions">
          <button class="btn-dismiss" id="btnDismiss">✕ Скрыть плашку</button>
        </div>
      </div>
    `;

    (document.body || document.documentElement).appendChild(host);

    shadow.getElementById('btnDismiss').addEventListener('click', () => {
      host.remove();
    });
  }

  async function runCheck() {
    const iframeUrls = collectIframeUrls();
    const allUrls = [window.location.href, ...iframeUrls];

    // 1. Быстрая проверка по chrome.storage.local (работает мгновенно и без сервера)
    let stored = {};
    try {
      stored = await chrome.storage.local.get(['badBoards']);
    } catch (_) {}

    const localHit = matchLocalDomains(allUrls, stored.badBoards || []);
    if (localHit) {
      showBadBoardBanner({
        matchedDomain: localHit.domain,
        reason: 'Этот домен в твоём чёрном списке джоб-бордов (автозаполнение отключено).'
      });
    } else {
      removeBadBoardBanner();
    }

    // 2. Прямая сверка с сервером Job Filter (localhost:8000) для синхронизации и авто-привязки компании
    try {
      const params = new URLSearchParams({
        url: window.location.href,
        frames: iframeUrls.join(','),
        auto_link: 'true'
      });
      const res = await fetch(`${JOB_FILTER_API}/api/blacklist/check?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.all_blacklisted_domains)) {
          const cleanList = data.all_blacklisted_domains.map(d => extractCleanDomain(d)).filter(Boolean);
          await chrome.storage.local.set({ badBoards: Array.from(new Set([...DEFAULT_BAD_DOMAINS, ...cleanList])) });
        }
        if (data.is_blacklisted) {
          showBadBoardBanner({
            matchedDomain: extractCleanDomain(data.matched_domain) || data.matched_domain,
            reason: data.reason,
            linkedJob: data.linked_job
          });
        }
      }
    } catch (_) {}
  }

  window.__jobFilterRunCheck = runCheck;

  // Мгновенно реагируем, если пользователь добавил или удалил домен в попапе расширения
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.badBoards) {
        runCheck();
      }
    });
  } catch (_) {}

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'getPageUrls') {
      sendResponse({
        url: window.location.href,
        frames: collectIframeUrls()
      });
      return true;
    }
    if (msg.action === 'showBadBoardBannerNow') {
      showBadBoardBanner({
        matchedDomain: msg.matchedDomain,
        reason: msg.reason,
        linkedJob: msg.linkedJob
      });
      sendResponse({ ok: true });
      return true;
    }
    if (msg.action === 'hideBadBoardBannerNow') {
      removeBadBoardBanner();
      sendResponse({ ok: true });
      return true;
    }
  });

  runCheck();

  // На случай если iframe с cims.com/icims.com подгружается динамически на странице
  let checkTimeout = null;
  const observer = new MutationObserver(() => {
    if (document.getElementById('__job_filter_bad_board_banner__')) return;
    if (checkTimeout) clearTimeout(checkTimeout);
    checkTimeout = setTimeout(runCheck, 1000);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
