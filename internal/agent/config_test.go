package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestConfigRejectsUnsafeActions(t *testing.T) {
	base := Config{
		Listen: "127.0.0.1:9797", NodeID: "n", Name: "n",
		Actions: []ActionConfig{{ID: "a", Name: "A", Type: "script", Script: "backup.sh", Timeout: "5s"}},
	}
	if err := base.Actions[0].validate(); err == nil {
		t.Fatal("relative script path accepted")
	}
	base.Actions[0] = ActionConfig{ID: "a", Name: "A", Type: "script", Script: "/bin/true", Timeout: "90s"}
	if err := base.Actions[0].validate(); err == nil {
		t.Fatal("timeout over 60s accepted")
	}
	base.Actions[0] = ActionConfig{ID: "a", Name: "A", Type: "wol", MAC: "nope", Broadcast: "192.0.2.255"}
	if err := base.Actions[0].validate(); err == nil {
		t.Fatal("bad MAC accepted")
	}
	base.Actions[0] = ActionConfig{ID: "a", Name: "A", Type: "wol", MAC: "aa:bb:cc:dd:ee:ff", Broadcast: "not-an-ip"}
	if err := base.Actions[0].validate(); err == nil {
		t.Fatal("bad broadcast accepted")
	}
}

func TestNonLoopbackListenNeedsOptIn(t *testing.T) {
	dir := t.TempDir()
	token := filepath.Join(dir, "token")
	if err := os.WriteFile(token, []byte(strings.Repeat("a", 32)), 0o600); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "agent.json")
	cfg := Config{Listen: "0.0.0.0:9797", NodeID: "n", TokenFile: token}
	body, _ := json.Marshal(cfg)
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadConfig(path); err == nil {
		t.Fatal("non-loopback listen accepted without allow_remote")
	}
	cfg.AllowRemote = true
	body, _ = json.Marshal(cfg)
	_ = os.WriteFile(path, body, 0o600)
	if _, err := LoadConfig(path); err != nil {
		t.Fatalf("allow_remote rejected: %v", err)
	}
}

func TestInitConfigWrites0600(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agent.json")
	if err := InitConfig(path, "node1", "Node 1", ""); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("config mode = %o", info.Mode().Perm())
	}
	tokenInfo, err := os.Stat(filepath.Join(dir, "agent.token"))
	if err != nil {
		t.Fatal(err)
	}
	if tokenInfo.Mode().Perm() != 0o600 {
		t.Fatalf("token mode = %o", tokenInfo.Mode().Perm())
	}
	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.NodeID != "node1" || len(cfg.TokenFile) == 0 {
		t.Fatalf("unexpected config %+v", cfg)
	}
}

// Builds before 1.0.2 wrote a "relay" block into local-agent.json. The field is
// gone; loading must tolerate it so an upgrade does not stop the hub.
func TestLoadConfigIgnoresTheRemovedRelayBlock(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "local-agent.json")
	body := `{"listen":"127.0.0.1:36025","node_id":"local","name":"hub","relay":{},` +
		`"collect":{"updates":false,"docker":true,"smart":true,"gpu":true,"processes":40}}`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "agent.token"), []byte("token\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig rejected a legacy relay block: %v", err)
	}
	if cfg.NodeID != "local" || cfg.Listen != "127.0.0.1:36025" {
		t.Fatalf("cfg = %+v", cfg)
	}
	if cfg.LegacyRelay != nil {
		t.Fatal("the removed relay block was kept in memory")
	}
}
