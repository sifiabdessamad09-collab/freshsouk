# FreshSOUK hero journey video

Current asset: assets/videos/freshsouk-journey.mp4
Edit date: 2026-11-05
Output: 29.166667 seconds, 1280x720, 30 fps, H.264 High / yuv420p, no audio, MP4 faststart, 7,524,682 bytes.
The 7.5-second basket shot is included within this edit; only the final montage is shipped.

## Footage and license

All source footage was downloaded through the official Pexels Free download flow. License: https://www.pexels.com/license/ . Website use and editing are permitted, attribution optional. No subscription or purchase was made. Do not imply the people endorse FreshSOUK. This is an illustrative montage, not documentation of FreshSOUK's actual suppliers, team, farms or location.

| Stage | Source | Creator | Source trim | Montage starts |
| --- | --- | --- | --- | --- |
| Harvesting greens | https://www.pexels.com/video/people-harvesting-vegetables-from-the-field-7456581/ | Kindel Media | 0–8s | 0s |
| Selecting produce in a basket | https://www.pexels.com/video/person-holding-basket-full-of-vegetables-7782528/ | RDNE Stock project | 0–7s | 7.4s |
| Courier carrying groceries | https://www.pexels.com/video/fruit-delivery-6994799/ | Kindel Media | 0–7s | 13.8s |
| Doorstep handoff | https://www.pexels.com/video/delivery-man-carrying-a-box-of-groceries-6994796/ | Kindel Media | 0–9s | 20.2s |

Edit recipe: normalize each shot to 1280x720 / square pixels / 30fps / yuv420p, reset timestamps, apply saturation1.06 and contrast1.02, crossfade 0.6s at offsets7.4/13.8/20.2, encode libx264 CRF25 maxrate2400k bufsize4800k, High level3.1, faststart, strip audio. FFmpeg7.1 from verified PyPI imageio-ffmpeg0.6.0 wheel was used locally, outside the repository. Source downloads/tools are not shipped. No competitor footage was copied.

## Integration and verification

The existing full-width hero layout, French/Darija copy, mustard CTA, play/pause controls, reduced-motion/save-data handling, offscreen/hidden pause, fallback image and manual retry remain unchanged. Only the video reference and PWA/CSS/JS query versions changed to journey-video-20261105. No video is added to the atomic shell or offline cache.

Full decode verification passed: 875 frames without decoding errors. Storyboard visually inspected across harvest, basket, courier and handoff. 32 automated tests pass; 96-blob preservation and admin asset build/allowlist pass. The final clip is below the 25MiB static-hosting per-file threshold. Browser confirms 29.166667s playback, muted+loop, mobile390px without overflow and desktop1280px. Physical iPhone remains unverified.

Preview: http://127.0.0.1:8802/#accueil . Standalone output outside repo: outputs/FRESHSOUK-journey-30s.mp4 ; storyboard outputs/FRESHSOUK-journey-storyboard.jpg . Release branch: codex/freshsouk-video-journey, starting from current origin/main. The owner approved publication on 2026-11-05. Domain-launch preparation and backend changes are excluded.
