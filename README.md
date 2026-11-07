# FrameDrop — Authorized Video Downloader

A responsive dark-themed web app for previewing and downloading **direct video file URLs** that you own or are authorized to save.

## Requirements

- Node.js 20+
- npm

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000.

## Features

- Responsive dark UI with URL validation and inline errors
- Native HTML5 video preview and YouTube embeds for supported links
- Streamed download endpoint with a visible progress indicator
- Original-file downloads; MP4 selection is enabled only for direct `.mp4` sources
- Local download history (stored in the browser)
- Server-side URL validation, redirect revalidation, private-network blocking, and a 500 MB default size limit

## Important format note

This app does not transcode video. “MP4” means the source URL itself points to an MP4 file. Converting other formats requires a separate media-processing pipeline (for example, FFmpeg), which is intentionally not included.
YouTube links can be previewed using YouTube's official embed player, but cannot be downloaded by this app. Downloads are limited to direct video-file URLs you own or are authorized to save.

## Responsible use

Use only direct file URLs that you own, have permission to download, or that the source explicitly makes available for download. The app does not extract media from social platforms or bypass DRM, paywalls, authentication, or platform restrictions. Some hosts block preview playback or require browser-specific access; those sources may not work.

## Configuration

- `PORT`: server port (default `3000`)
- `MAX_DOWNLOAD_BYTES`: maximum source size in bytes (default 524288000 / 500 MB)

## Production deployment

Deploy behind HTTPS. Add authentication and per-user rate limits before exposing the service publicly. Review your hosting provider's outbound-network policy and consider pinning DNS resolutions at connection time for stronger protection against DNS rebinding. The browser buffers the completed file before saving it, so very large downloads can use significant client memory.
