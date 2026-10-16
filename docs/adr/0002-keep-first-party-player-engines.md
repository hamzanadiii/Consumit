# Keep first-party engines over Shaka Player

Consumit keeps native media, hls.js, and dash.js behind the existing visual player and does not adopt Shaka Player. Our catalog is direct HLS/DASH/native with no licensed-DRM, live low-latency, Chromecast, or offline requirement, and the fixture suite already proves decoding, fallback, renewal, and caption paths on the current engines. On Apple platforms Shaka delegates to native HLS playback anyway, so a migration would unify everything except the platform where unification matters most while adding bundle weight and a second engine API during an open canary (ADR 0001).

Our playback edge lives above the engines — recovery ladder, cheapest-path routing, session retention — and is engine-agnostic. Revisit only when a slice demands licensed DRM, live low-latency, or Chromecast; that slice re-opens this decision with measurements, not before.
