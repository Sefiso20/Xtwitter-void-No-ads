// XTwitter-void: hides promoted/sponsored posts. Rules are per site, so when a site
// changes its markup, only that site's rule below needs updating.

const LABELS = new Set([
  "ad", "promoted", "sponsored", "promoted tweet",
  "gesponsert", "promocionado", "patrocinado", "sponsorisé", "anúncio", "annonce"
]);
const LABEL_FROM = /^(ad|promoted|sponsored|gesponsert|promocionado|patrocinado|sponsorisé|anúncio|annonce) (from|by|de|von|por) \S+/i;

const host = location.hostname.replace(/^www\./, "");

// True if any leaf element inside root carries an ad label. Leaves inside an
// ignored subtree (comments, tweet text...) are skipped, but only subtrees that
// are inside root count; otherwise a post sitting in a <ul> would be ignored.
// "Ad from site.com" style labels only count when they are inside a link, which
// is how X renders them, so a normal tweet that happens to start with
// "Sponsored by ..." is left alone.
function hasLabel(root, ignoreSelector) {
  if (!root) return false;
  for (const el of root.querySelectorAll("*")) {
    if (el.children.length !== 0) continue;
    if (ignoreSelector) {
      const skip = el.closest(ignoreSelector);
      if (skip && root.contains(skip)) continue;
    }
    const t = el.textContent.trim();
    if (t.length === 0 || t.length >= 60) continue;
    if (LABELS.has(t.toLowerCase())) return true;
    if (LABEL_FROM.test(t)) {
      const link = el.closest("a");
      if (link && root.contains(link)) return true;
    }
  }
  return false;
}

function hide(el) {
  if (el && !el.dataset.adHidden) {
    el.dataset.adHidden = "1";
    el.style.display = "none";
  }
}

// Re-checks posts a few times so lazy-loaded "Sponsored"/"Ad" badges are not missed,
// scheduling a single shared follow-up pass even if no new DOM nodes are added.
let retryTimer = null;
function queueRetry(delay) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    schedule();
  }, delay);
}

function shouldCheck(el, maxAttempts = 5, intervalMs = 700) {
  const now = Date.now();
  const n = +(el.dataset.adN || 0);
  const t = +(el.dataset.adT || 0);
  if (n >= maxAttempts) return false;
  if (now - t < intervalMs) {
    queueRetry(intervalMs - (now - t) + 20);
    return false;
  }
  el.dataset.adN = n + 1;
  el.dataset.adT = now;
  if (n + 1 < maxAttempts) {
    queueRetry(intervalMs + 20);
  }
  return true;
}

// ---- X (Twitter) -----------------------------------------------------------
// X's timeline is a virtualized list (li[data-index] or div[data-testid="cellInnerDiv"])
// positioned via computed offsets. Collapsing ad rows to 1px preserves X's scroll
// math and allows recycled containers to be restored when reused for normal posts.
const X_ROW_SEL = 'li[data-index], div[data-testid="cellInnerDiv"]';
const X_IGNORE_SEL = '[data-testid="tweetText"], [data-testid="card.wrapper"], [role="blockquote"]';

const COLLAPSE = {
  height: "1px", "min-height": "0", "max-height": "1px",
  overflow: "hidden", visibility: "hidden"
};
const COLLAPSE_CHILD = {
  "max-height": "1px", overflow: "hidden", padding: "0", margin: "0", border: "0"
};

function setProps(el, props) {
  for (const k in props) el.style.setProperty(k, props[k], "important");
}
function clearProps(el, props) {
  for (const k in props) el.style.removeProperty(k);
}

function collapse(row) {
  row.dataset.adHidden = "1";
  setProps(row, COLLAPSE);
  for (const c of row.children) setProps(c, COLLAPSE_CHILD);
}
function restore(row) {
  delete row.dataset.adHidden;
  clearProps(row, COLLAPSE);
  for (const c of row.children) clearProps(c, COLLAPSE_CHILD);
}

function xIsAd(article) {
  return !!article.querySelector('[data-testid="placementTracking"]') || hasLabel(article, X_IGNORE_SEL);
}

function xRule() {
  let changed = false;

  // 1) Restore virtualized rows (both li[data-index] and cellInnerDiv) recycled for normal posts.
  document.querySelectorAll('li[data-index][data-ad-hidden], div[data-testid="cellInnerDiv"][data-ad-hidden]').forEach(row => {
    const a = row.querySelector("article");
    if (!a || !xIsAd(a)) {
      restore(row);
      if (a) {
        delete a.dataset.adN;
        delete a.dataset.adT;
      }
      changed = true;
    }
  });

  // 2) Detect and collapse new ads.
  document.querySelectorAll("article").forEach(a => {
    const row = a.closest(X_ROW_SEL);
    const holder = row || a;
    if (holder.dataset.adHidden) return;

    // Reset retry counters if X swaps a new tweet into an existing <article> node.
    const statusHref = a.querySelector('a[href*="/status/"]')?.getAttribute("href") || "";
    if (a.dataset.adHref !== statusHref) {
      a.dataset.adHref = statusHref;
      delete a.dataset.adN;
      delete a.dataset.adT;
    }

    if (!shouldCheck(a)) return;
    if (!xIsAd(a)) return;

    if (row) collapse(row);
    else hide(holder);
    changed = true;
  });

  // Nudge X to re-measure its virtualized list right away.
  if (changed) window.dispatchEvent(new Event("resize"));
}

const rules = {
  "x.com": () => xRule(),
  "twitter.com": () => xRule(),

  "reddit.com": () => {
    document.querySelectorAll("shreddit-ad-post, shreddit-comments-page-ad, [data-testid='ad-post']")
      .forEach(hide);
    document.querySelectorAll("shreddit-post:not([data-ad-hidden])").forEach(p => {
      if (!shouldCheck(p)) return;
      if (p.hasAttribute("promoted") || hasLabel(p, '[slot="text-body"], [slot="comment"], shreddit-comment')) {
        hide(p);
      }
    });
  },

  "instagram.com": () => {
    document.querySelectorAll("article:not([data-ad-hidden])").forEach(a => {
      if (!shouldCheck(a)) return;
      if (hasLabel(a, "ul, form")) hide(a);
    });
  },

  "youtube.com": () => {
    document.querySelectorAll(
      "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer, " +
      "ytd-promoted-sparkles-web-renderer, #masthead-ad, ytd-display-ad-renderer"
    ).forEach(el => hide(el.closest("ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer") || el));
  },

  "facebook.com": () => {
    document.querySelectorAll('div[role="article"]:not([data-ad-hidden])').forEach(a => {
      if (!shouldCheck(a)) return;
      if (
        a.querySelector('a[href*="/ads/about"]') ||
        hasLabel(a, '[data-ad-preview="message"], [aria-label*="Comment" i], ul')
      ) {
        hide(a);
      }
    });
  }
};

const key = Object.keys(rules).find(k => host === k || host.endsWith("." + k));
const run = key ? rules[key] : () => {};

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; try { run(); } catch (e) {} });
}

run();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
