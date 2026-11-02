#!/bin/sh
# Fictional tailnet for the Playwright suite. Every machine name, address and
# tailnet suffix below is fake; see docs/reports/ACCEPTANCE.md.
cat <<'JSON'
{
  "BackendState": "Running",
  "Self": {
    "HostName": "hub",
    "DNSName": "hub.tailnet-1234.ts.net.",
    "OS": "linux",
    "TailscaleIPs": ["100.64.0.1"]
  },
  "Peer": {
    "nodekey:kiosk": {
      "HostName": "kiosk",
      "DNSName": "kiosk.tailnet-1234.ts.net.",
      "OS": "linux",
      "Online": true,
      "TailscaleIPs": ["100.101.102.103"]
    },
    "nodekey:studio": {
      "HostName": "studio",
      "DNSName": "studio.tailnet-1234.ts.net.",
      "OS": "macOS",
      "Online": false,
      "TailscaleIPs": ["100.101.102.104"]
    }
  }
}
JSON
