# Third-party components

Original integration code is MIT-licensed. Dependencies are not relicensed.

| Component | Version | Source / license |
| --- | --- | --- |
| Scramjet | 1.1.0 | https://github.com/MercuryWorkshop/scramjet/tree/v1.1.0 |
| bare-mux | 2.1.9 | https://github.com/MercuryWorkshop/bare-mux — MIT, Copyright 2024 Mercury Workshop Inc. |
| libcurl-transport (Node edition only) | 1.5.2 | https://github.com/MercuryWorkshop/CurlTransport |
| wisp-js (Node edition only) | 0.4.1 | https://github.com/MercuryWorkshop/wisp-js — LGPL-3.0 |

The installed Scramjet 1.1.0 package declares MIT in package.json but ships an
AGPL-3.0 LICENSE file. This project preserves that shipped license verbatim
in generated deployment assets instead of discarding it. Upstream engine
bundles are unmodified; their corresponding upstream source is linked above.

Builds include /licenses/scramjet.txt and /licenses/bare-mux.txt. Source for
this integration is https://github.com/HJGSfz68/prefix-browser.
