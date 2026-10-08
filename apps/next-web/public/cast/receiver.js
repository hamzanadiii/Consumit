/* Consumit TV receiver (CAF). Static file, no build step.
 *
 * The TV never holds member identity: the sender passes session context
 * (ids, title, artwork, position, provider headers) in LOAD customData, and
 * keeps progress, history, and telemetry on its own session. This app only
 * plays media, injects provider request headers, and reports player status
 * back through the standard Cast media channel.
 *
 * Reference: https://developers.google.com/cast/docs/web_receiver/basic
 */
(function () {
  'use strict';

  var context = cast.framework.CastReceiverContext.getInstance();
  var playerManager = context.getPlayerManager();
  var brand = document.getElementById('brand');

  /** Provider request headers for the current LOAD, set by the interceptor. */
  var upstreamHeaders = {};

  function validHeaderUrl(value) {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'string' || value.length > 4096 || /[\r\n]/.test(value)) return false;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }

  function headersForLoad(customData) {
    var headers = {};
    var source = (customData && customData.headers) || {};
    if (validHeaderUrl(source.referer)) headers.Referer = source.referer;
    if (validHeaderUrl(source.origin)) headers.Origin = source.origin;
    return headers;
  }

  var PlaybackConfig = cast.framework.PlaybackConfig;
  if (PlaybackConfig) {
    var playbackConfig = new PlaybackConfig();
    // Provider streams may require referer/origin hints. These handlers run
    // per manifest/segment request; unknown shapes fail open (no headers)
    // so playback still attempts and the sender fallback covers a 403.
    var inject = function (requestInfo) {
      try {
        requestInfo.headers = requestInfo.headers || {};
        for (var name in upstreamHeaders) {
          if (Object.prototype.hasOwnProperty.call(upstreamHeaders, name)) {
            requestInfo.headers[name] = upstreamHeaders[name];
          }
        }
      } catch {
        /* Fail open: the sender recovery ladder covers denied requests. */
      }
    };
    if (typeof playbackConfig.manifestRequestHandler !== 'undefined') {
      playbackConfig.manifestRequestHandler = inject;
    }
    if (typeof playbackConfig.segmentRequestHandler !== 'undefined') {
      playbackConfig.segmentRequestHandler = inject;
    }
  }

  playerManager.setMessageInterceptor(
    cast.framework.messages.MessageType.LOAD,
    function (loadRequestData) {
      var customData = loadRequestData.customData || {};
      upstreamHeaders = headersForLoad(customData);
      var position = Number(customData.position);
      if (Number.isFinite(position) && position > 0) {
        loadRequestData.currentTime = position;
      }
      if (brand) brand.hidden = true;
      return loadRequestData;
    },
  );

  playerManager.addEventListener(
    cast.framework.events.category.CORE,
    function (event) {
      if (!brand) return;
      // Show the brand card only when nothing is loaded or after teardown.
      if (
        event.type === cast.framework.events.EventType.MEDIA_STATUS &&
        event.status &&
        event.status.playerState === 'IDLE' &&
        event.status.idleReason === 'FINISHED'
      ) {
        brand.hidden = false;
      }
    },
  );

  context.addEventListener(
    cast.framework.system.EventType.SHUTDOWN,
    function () {
      upstreamHeaders = {};
    },
  );

  context.start(
    playbackConfig ? { playbackConfig: playbackConfig } : undefined,
  );
})();
