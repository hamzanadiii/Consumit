# Controlled media

These fixtures were generated locally with FFmpeg testsrc2 and a 440 Hz sine wave. They contain no third-party film, provider credentials, or remote media. The 30-second H.264 baseline/AAC clip and two-second HLS segments exercise real decoding, range requests, native text tracks, and failure recovery.

Regenerate with FFmpeg:

```sh
ffmpeg -f lavfi -i testsrc2=size=640x360:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 30 -c:v libx264 -profile:v baseline -pix_fmt yuv420p -preset fast -b:v 500k -g 48 -c:a aac -b:a 64k -movflags +faststart reference.mp4
ffmpeg -i reference.mp4 -c copy -hls_time 2 -hls_playlist_type vod -hls_segment_filename segment-%02d.ts media.m3u8
```

`reference-180.webm` is a true 320×180 VP8/Opus rendition of the same color bars and tone. It lets the Watch fixture exercise an actual same-provider quality change while retaining audio. Regenerate it with FFmpeg:

```sh
ffmpeg -i reference.mp4 -vf scale=320:180 -c:v libvpx -crf 36 -b:v 0 -c:a libopus -b:a 64k reference-180.webm
```

The fixture server is loopback-only, uses injected transport, and is excluded from production entry points. It does not test public DNS or external-provider performance.
