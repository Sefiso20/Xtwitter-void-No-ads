// XTwitter-void: hides promoted/sponsored posts. Rules are per site, so when a site
// changes its markup, only that site's rule below needs updating.

const LABELS = new Set([
  "ad", "ads", "promoted", "sponsored", "promoted tweet",
  "gesponsert", "promocionado", "patrocinado", "sponsorisé", "anúncio", "annonce"
]);
const LABEL_FROM = /^(ad|promoted|sponsored|gesponsert|promocionado|patrocinado|sponsorisé|anúncio|annonce) (from|by|de|von|por) \S+/i;

const host = location.hostname.replace(/^www\./, "");

// True if any element inside root has visible text that is an ad label
// ("Ad", "Promoted", "Ad from example.com", ...). Checks every leaf element,
// so it does not depend on tag names or attributes.
function hasLabel(root) {
  for (const el of root.querySelectorAll("*")) {
    if (el.children.length !== 0) continue;
    const t = el.textContent.trim();
    if (t.length > 0 && t.length < 60 && (LABELS.has(t.toLowerCase()) || LABEL_FROM.test(t))) {
      return true;
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

// ---- X (Twitter) -----------------------------------------------------------
// X's timeline is a virtualized list: <li data-index> items positioned
// absolutely at offsets X computes from each item's measured height.
//
// We must NOT shift items around ourselves, or X's idea of the layout drifts
// from what is on screen and it stops rendering/loading posts further down.
// Instead we collapse each ad to a 1px-tall invisible sliver. X then measures
// the smaller height and lays out the rest of the feed itself, so the tweets
// connect naturally and infinite scroll keeps working.
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

function collapse(li) {
  li.dataset.adHidden = "1";
  setProps(li, COLLAPSE);
  for (const c of li.children) setProps(c, COLLAPSE_CHILD);
}
function restore(li) {
  delete li.dataset.adHidden;
  clearProps(li, COLLAPSE);
  for (const c of li.children) clearProps(c, COLLAPSE_CHILD);
}

function xIsAd(article) {
  return hasLabel(article) || !!article.querySelector('[data-testid="placementTracking"]');
}

function xRule() {
  const now = Date.now();
  let changed = false;

  // 1) Restore items that X recycled for a normal post.
  document.querySelectorAll("li[data-index][data-ad-hidden]").forEach(li => {
    const a = li.querySelector("article");
    if (a && !xIsAd(a)) { restore(li); changed = true; }
  });

  // 2) Find and collapse new ads.
  document.querySelectorAll("article:not([data-ad-hidden])").forEach(a => {
    const li = a.closest("li[data-index]");
    const holder = li || a.closest("[data-testid='cellInnerDiv']") || a;
    if (holder.dataset.adHidden) return;

    // Labels can load a moment after the post; re-check a few times, then stop.
    const n = +(a.dataset.adN || 0);
    const t = +(a.dataset.adT || 0);
    if (n >= 4 || now - t < 800) return;
    a.dataset.adN = n + 1;
    a.dataset.adT = now;

    if (!xIsAd(a)) return;

    if (li) collapse(li); else hide(holder);
    changed = true;
  });

  // Nudge X to re-measure its list right away (harmless if it already does).
  if (changed) window.dispatchEvent(new Event("resize"));
}

const rules = {
  "x.com": () => xRule(),

  "reddit.com": () => {
    document.querySelectorAll("shreddit-ad-post, shreddit-comments-page-ad, [data-testid='ad-post']")
      .forEach(hide);
    document.querySelectorAll("shreddit-post:not([data-ad-checked])").forEach(p => {
      p.dataset.adChecked = "1";
      if (p.hasAttribute("promoted") || hasLabel(p)) hide(p);
    });
  },

  "instagram.com": () => {
    document.querySelectorAll("article:not([data-ad-checked])").forEach(a => {
      a.dataset.adChecked = "1";
      if (hasLabel(a)) hide(a);
    });
  },

  "youtube.com": () => {
    document.querySelectorAll(
      "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer, " +
      "ytd-promoted-sparkles-web-renderer, #masthead-ad, ytd-display-ad-renderer"
    ).forEach(el => hide(el.closest("ytd-rich-item-renderer") || el));
  },

  // Best effort: Facebook obfuscates its "Sponsored" label, so this may miss some.
  "facebook.com": () => {
    document.querySelectorAll('div[role="article"]:not([data-ad-checked])').forEach(a => {
      a.dataset.adChecked = "1";
      if (hasLabel(a) || a.querySelector('a[href*="/ads/about"]')) hide(a);
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
