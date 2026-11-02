package hub

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const tailnetFixture = `{
  "BackendState": "Running",
  "Self": {
    "HostName": "hub",
    "DNSName": "hub.tailnet-1234.ts.net.",
    "OS": "linux",
    "TailscaleIPs": ["100.64.0.1", "fd7a:115c:a1e0::1"]
  },
  "Peer": {
    "nodekey:aaa": {
      "HostName": "kiosk",
      "DNSName": "kiosk.tailnet-1234.ts.net.",
      "OS": "linux",
      "Online": true,
      "TailscaleIPs": ["fd7a:115c:a1e0::2", "100.101.102.103"],
      "PublicKey": "nodekey:aaa"
    },
    "nodekey:bbb": {
      "HostName": "studio",
      "DNSName": "studio.tailnet-1234.ts.net.",
      "OS": "macOS",
      "Online": false,
      "TailscaleIPs": ["100.101.102.104"]
    },
    "nodekey:self": {
      "HostName": "hub",
      "DNSName": "hub.tailnet-1234.ts.net.",
      "OS": "linux",
      "Online": true,
      "TailscaleIPs": ["100.64.0.1"]
    }
  }
}`

func writeTailnetStub(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "tailscale-stub.sh")
	script := "#!/bin/sh\ncat <<'EOF'\n" + body + "\nEOF\n"
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func loginAdmin(t *testing.T, serverURL string) *http.Client {
	t.Helper()
	client := testClient(t)
	if status, _ := doJSON(t, client, http.MethodPost, serverURL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	return client
}

func TestTailnetPeers(t *testing.T) {
	t.Setenv("CUPOLA_TAILSCALE_BIN", writeTailnetStub(t, tailnetFixture))
	_, server := newTestHub(t)
	client := loginAdmin(t, server.URL)

	status, body := doJSON(t, client, http.MethodGet, server.URL+"/api/v1/tailnet/peers", nil, "")
	if status != http.StatusOK || body["available"] != true {
		t.Fatalf("peers = %d %+v", status, body)
	}
	peers := body["peers"].([]any)
	if len(peers) != 2 {
		t.Fatalf("peers = %d, want 2 (self excluded): %+v", len(peers), peers)
	}
	first := peers[0].(map[string]any)
	if first["name"] != "kiosk" || first["ipv4"] != "100.101.102.103" || first["os"] != "linux" || first["online"] != true {
		t.Fatalf("first peer = %+v", first)
	}
	if first["dns_name"] != "kiosk.tailnet-1234.ts.net" {
		t.Fatalf("dns_name = %v", first["dns_name"])
	}
	second := peers[1].(map[string]any)
	if second["name"] != "studio" || second["ipv4"] != "100.101.102.104" || second["online"] != false {
		t.Fatalf("second peer = %+v", second)
	}

	status, raw := doRaw(t, client, server.URL+"/api/v1/tailnet/peers")
	if status != http.StatusOK {
		t.Fatalf("raw peers = %d", status)
	}
	for _, forbidden := range []string{"nodekey", "PublicKey", "TailscaleIPs", "BackendState"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("response leaks %q: %s", forbidden, raw)
		}
	}

	// A read token can list peers; an anonymous client cannot.
	status, token := doJSON(t, client, http.MethodPost, server.URL+"/api/v1/tokens", map[string]any{
		"name": "read", "scopes": []string{"read"},
	}, "")
	if status != http.StatusCreated {
		t.Fatalf("token = %d", status)
	}
	if status, _ := doJSON(t, testClient(t), http.MethodGet, server.URL+"/api/v1/tailnet/peers", nil, token["token"].(string)); status != http.StatusOK {
		t.Fatalf("read token peers = %d", status)
	}
	if status, _ := doJSON(t, testClient(t), http.MethodGet, server.URL+"/api/v1/tailnet/peers", nil, ""); status != http.StatusUnauthorized {
		t.Fatalf("anonymous peers = %d, want 401", status)
	}
}

func TestTailnetPeersCachedUntilRefresh(t *testing.T) {
	counter := filepath.Join(t.TempDir(), "runs")
	script := "#!/bin/sh\necho run >> " + counter + "\ncat <<'EOF'\n" + tailnetFixture + "\nEOF\n"
	stub := filepath.Join(t.TempDir(), "tailscale-stub.sh")
	if err := os.WriteFile(stub, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CUPOLA_TAILSCALE_BIN", stub)
	_, server := newTestHub(t)
	client := loginAdmin(t, server.URL)

	for _, url := range []string{"/api/v1/tailnet/peers", "/api/v1/tailnet/peers"} {
		if status, _ := doJSON(t, client, http.MethodGet, server.URL+url, nil, ""); status != http.StatusOK {
			t.Fatalf("peers = %d", status)
		}
	}
	runs, err := os.ReadFile(counter)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(string(runs), "run"); got != 1 {
		t.Fatalf("tailscale ran %d times, want 1 within the cache window", got)
	}
	if status, _ := doJSON(t, client, http.MethodGet, server.URL+"/api/v1/tailnet/peers?refresh=1", nil, ""); status != http.StatusOK {
		t.Fatalf("refresh peers = %d", status)
	}
	runs, err = os.ReadFile(counter)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(string(runs), "run"); got != 2 {
		t.Fatalf("tailscale ran %d times after refresh, want 2", got)
	}
}

func TestTailnetUnavailable(t *testing.T) {
	t.Run("missing binary", func(t *testing.T) {
		t.Setenv("CUPOLA_TAILSCALE_BIN", filepath.Join(t.TempDir(), "no-tailscale"))
		_, server := newTestHub(t)
		client := loginAdmin(t, server.URL)
		status, body := doJSON(t, client, http.MethodGet, server.URL+"/api/v1/tailnet/peers", nil, "")
		if status != http.StatusOK || body["available"] != false {
			t.Fatalf("peers = %d %+v", status, body)
		}
		if message, _ := body["error"].(string); message == "" {
			t.Fatalf("missing error message: %+v", body)
		}
	})

	t.Run("not logged in", func(t *testing.T) {
		t.Setenv("CUPOLA_TAILSCALE_BIN", writeTailnetStub(t, `{"BackendState":"NeedsLogin","Self":{},"Peer":{}}`))
		_, server := newTestHub(t)
		client := loginAdmin(t, server.URL)
		status, body := doJSON(t, client, http.MethodGet, server.URL+"/api/v1/tailnet/peers", nil, "")
		if status != http.StatusOK || body["available"] != false {
			t.Fatalf("peers = %d %+v", status, body)
		}
		if message, _ := body["error"].(string); !strings.Contains(message, "not connected") {
			t.Fatalf("error = %q", message)
		}
	})
}

func TestJoinCodeAdvertise(t *testing.T) {
	_, server := newTestHub(t)
	client := loginAdmin(t, server.URL)

	status, created := doJSON(t, client, http.MethodPost, server.URL+"/api/v1/join/codes", map[string]any{
		"id": "kiosk", "name": "kiosk", "advertise": "http://100.101.102.103:9797",
	}, "")
	if status != http.StatusCreated {
		t.Fatalf("create code = %d %+v", status, created)
	}
	commands := created["commands"].(map[string]any)
	for _, key := range []string{"linux", "darwin"} {
		command := commands[key].(string)
		if !strings.Contains(command, "--advertise http://100.101.102.103:9797") {
			t.Fatalf("%s command missing the tailnet address: %s", key, command)
		}
	}

	status, body := doJSON(t, client, http.MethodPost, server.URL+"/api/v1/join/codes", map[string]any{
		"id": "kiosk2", "advertise": "http://100.101.102.103:9797; rm -rf /",
	}, "")
	if status != http.StatusBadRequest {
		t.Fatalf("injected advertise = %d %+v", status, body)
	}
}
