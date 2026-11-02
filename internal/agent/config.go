package agent

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Config is the agent's JSON config. It is root-owned, mode 0600, and the only
// place actions may be defined. JSON is used instead of YAML so the binary
// needs no extra dependency; the schema is documented in docs/DEPLOY.md.
type Config struct {
	Listen      string        `json:"listen"`
	NodeID      string        `json:"node_id"`
	Name        string        `json:"name"`
	Labels      []string      `json:"labels,omitempty"`
	TokenFile   string        `json:"token_file,omitempty"`
	AllowRemote bool          `json:"allow_remote,omitempty"`
	Push        PushConfig    `json:"push,omitempty"`
	Collect     CollectConfig `json:"collect,omitempty"`
	Actions     []ActionConfig `json:"actions,omitempty"`

	// Runtime-only join settings, never written to the config file.
	JoinHub       string `json:"-"`
	JoinCode      string `json:"-"`
	JoinAdvertise string `json:"-"`
	JoinMarker    string `json:"-"`
}

// PushConfig makes the agent report to the hub instead of waiting to be polled.
// It is the mode for hosts the hub cannot dial (NAT, CGNAT).
type PushConfig struct {
	Enabled  bool   `json:"enabled,omitempty"`
	HubURL   string `json:"hub_url,omitempty"`
	Interval string `json:"interval,omitempty"`
}

type CollectConfig struct {
	Updates bool `json:"updates"` // pending apt/dnf count, opt-in
	Docker  bool `json:"docker"`
	SMART   bool `json:"smart"`
	GPU     bool `json:"gpu"`
	Processes int `json:"processes"` // top N kept, default 40
}

type ActionConfig struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Type        string `json:"type"` // script | wol
	Danger      bool   `json:"danger"`
	AllowAPI    bool   `json:"allow_api"`

	// script
	Script  string `json:"script,omitempty"`
	Cwd     string `json:"cwd,omitempty"`
	Timeout string `json:"timeout,omitempty"`

	// wol
	MAC       string `json:"mac,omitempty"`
	Broadcast string `json:"broadcast,omitempty"`
	Port      int    `json:"port,omitempty"`
}

// DefaultConfig is written by `cupola agent --init`.
func DefaultConfig() Config {
	return Config{
		Listen: "127.0.0.1:9797",
		NodeID: "",
		Name:   "",
		Collect: CollectConfig{
			Docker:    true,
			SMART:     true,
			GPU:       true,
			Processes: 40,
		},
	}
}

// LoadConfig reads and validates the agent config, creating a token file when
// one is missing.
func LoadConfig(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cfg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if cfg.Listen == "" {
		cfg.Listen = "127.0.0.1:9797"
	}
	if cfg.NodeID == "" {
		return nil, errors.New("config: node_id is required")
	}
	if cfg.Name == "" {
		cfg.Name = cfg.NodeID
	}
	if cfg.Collect.Processes <= 0 {
		cfg.Collect.Processes = 40
	}
	if cfg.Collect.Processes > 200 {
		cfg.Collect.Processes = 200
	}
	if cfg.TokenFile == "" {
		cfg.TokenFile = filepath.Join(filepath.Dir(path), "agent.token")
	}
	if cfg.Push.Enabled && cfg.Push.HubURL == "" {
		return nil, errors.New("config: push.hub_url is required when push is enabled")
	}
	if cfg.Push.Interval == "" {
		cfg.Push.Interval = "5s"
	}
	if _, err := cfg.Push.interval(); err != nil {
		return nil, fmt.Errorf("config: push.interval: %w", err)
	}
	if !cfg.AllowRemote {
		host, _, err := net.SplitHostPort(cfg.Listen)
		if err != nil {
			return nil, fmt.Errorf("config: listen: %w", err)
		}
		if host != "" && host != "127.0.0.1" && host != "::1" && host != "localhost" {
			return nil, fmt.Errorf("config: listen %s is not loopback; set allow_remote to accept that", cfg.Listen)
		}
	}
	for i := range cfg.Actions {
		if err := cfg.Actions[i].validate(); err != nil {
			return nil, fmt.Errorf("action %q: %w", cfg.Actions[i].ID, err)
		}
	}
	return &cfg, nil
}

// interval is the push cadence, defaulting to 5 s.
func (p PushConfig) interval() (time.Duration, error) {
	if p.Interval == "" {
		return 5 * time.Second, nil
	}
	d, err := time.ParseDuration(p.Interval)
	if err != nil {
		return 0, err
	}
	if d < time.Second {
		d = time.Second
	}
	if d > 5*time.Minute {
		d = 5 * time.Minute
	}
	return d, nil
}

func (a *ActionConfig) validate() error {
	if a.ID == "" || a.Name == "" {
		return errors.New("id and name are required")
	}
	if a.Icon == "" {
		a.Icon = "terminal"
	}
	switch a.Type {
	case "script":
		if a.Script == "" {
			return errors.New("script is required for type=script")
		}
		if !filepath.IsAbs(a.Script) {
			return errors.New("script must be an absolute path")
		}
		if a.Cwd != "" && !filepath.IsAbs(a.Cwd) {
			return errors.New("cwd must be absolute")
		}
		if a.Timeout == "" {
			a.Timeout = "30s"
		}
		d, err := time.ParseDuration(a.Timeout)
		if err != nil {
			return fmt.Errorf("timeout: %w", err)
		}
		if d <= 0 || d > 60*time.Second {
			return errors.New("timeout must be between 1s and 60s")
		}
	case "wol":
		if _, err := net.ParseMAC(a.MAC); err != nil {
			return errors.New("mac is invalid")
		}
		if a.Broadcast == "" {
			return errors.New("broadcast is required for type=wol")
		}
		if ip := net.ParseIP(a.Broadcast); ip == nil || ip.To4() == nil {
			return errors.New("broadcast must be an IPv4 address")
		}
		if a.Port == 0 {
			a.Port = 9
		}
		if a.Port < 1 || a.Port > 65535 {
			return errors.New("port is out of range")
		}
	default:
		return fmt.Errorf("unknown type %q", a.Type)
	}
	return nil
}

// InitConfig writes a config with a fresh token at path (0600). It refuses to
// overwrite an existing file.
func InitConfig(path, nodeID, name, listen string) error {
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("%s already exists", path)
	}
	token, err := newToken()
	if err != nil {
		return err
	}
	cfg := DefaultConfig()
	cfg.NodeID = nodeID
	cfg.Name = name
	if listen != "" {
		cfg.Listen = listen
	}
	cfg.TokenFile = filepath.Join(filepath.Dir(path), "agent.token")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(cfg.TokenFile, []byte(token+"\n"), 0o600); err != nil {
		return err
	}
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	body = append(body, '\n')
	if err := os.WriteFile(path, body, 0o600); err != nil {
		return err
	}
	fmt.Printf("wrote %s and %s (0600)\n", path, cfg.TokenFile)
	fmt.Printf("agent token: %s\n", token)
	fmt.Println("store the token in the hub when adding this node; it is not printed again")
	return nil
}

func newToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// ReadToken returns the agent bearer token.
func ReadToken(path string) (string, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	token := strings.TrimSpace(string(body))
	if len(token) < 16 {
		return "", errors.New("token file is too short")
	}
	if info, err := os.Stat(path); err == nil && info.Mode().Perm()&0o077 != 0 {
		fmt.Fprintf(os.Stderr, "warning: %s is readable by others; chmod 600 it\n", path)
	}
	return token, nil
}
