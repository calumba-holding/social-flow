# Changelog

## 0.2.0

- Added Marketing API support: `meta marketing` (ad accounts, campaigns, ad sets, creatives, async insights, status, create-campaign).
- Added Ads throttling retry/backoff in shared API client (handles error codes 17/32).
- Config: added default Marketing ad account id (`defaults.marketingAdAccountId`).

## 0.2.1

- Marketing: `create-adset`, `create-creative`, `create-ad`, `upload-image`.
- Marketing: `insights --export` to CSV/JSON.

## 0.2.2

- Marketing: `set-status`, `pause`, `resume` for campaigns/ad sets/ads.
- Marketing: `set-budget` for campaigns/ad sets.
