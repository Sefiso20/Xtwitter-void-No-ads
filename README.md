# XTwitter-void

A small Manifest V3 browser extension that hides promoted and sponsored posts on X,
and also blocks feed ads on Reddit, Instagram, YouTube and Facebook.

## Install (Brave / Chrome / Edge)

1. Download or clone this repo.
2. Open `brave://extensions` (or `chrome://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Reload any open tabs for the supported sites.

## How it works

A content script watches each page and hides posts carrying ad labels such as
"Ad", "Promoted", "Sponsored" or "Ad from example.com". Each site has its own
short rule in `content.js`, so when a site changes its markup only that rule
needs updating.


## Notes

- Facebook is best effort, since it obfuscates its "Sponsored" label.
- YouTube: in-feed ads are removed, but video ads that play inside a video are not.
