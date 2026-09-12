# Provider authorization and certification

Only providers with documented authorization for the configured regions and media hosts may enter runtime configuration. Technical availability, public endpoints, CORS headers, or source code in a research checkout are not authorization.

Activation requires both `approved: true` in the provider configuration and a current certification artifact matching that exact configuration. Certification is bounded operator traffic; member playback always goes directly from the browser to the authorized HTTPS media host.

The sibling PROVE checkout implements Stellar/Aphrodite as browser-direct HLS and direct subtitles with open CORS headers. Consumit provides native browser-direct adapters (`stellar` and `aphrodite`), but runtime activation remains strictly gated by operator approval (`approved: true`) and valid certification artifacts.
