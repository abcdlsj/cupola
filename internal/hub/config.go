package hub

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/abcdlsj/cupola/internal/hub/store"
)

// Config is the hub's runtime configuration. Environment variables override
// the flags, which override the defaults.
type Config struct {
	Listen     string
	DataDir    string
	WebDir     string
	PublicURL  string
	EmbedAgent bool
	AgentConfig string
	Logger     *slog.Logger

	PollInterval         time.Duration
	AllowPrivateWebhooks bool
	CORSOrigins          []string
	SessionTTL           time.Duration
}

func (c *Config) normalize() error {
	if c.Listen == "" {
		c.Listen = envOr("CUPOLA_LISTEN", "127.0.0.1:8080")
	}
	if c.DataDir == "" {
		c.DataDir = envOr("CUPOLA_DATA_DIR", "data")
	}
	if c.WebDir == "" {
		c.WebDir = envOr("CUPOLA_WEB_DIR", "web/dist")
	}
	if c.PublicURL == "" {
		c.PublicURL = strings.TrimRight(os.Getenv("CUPOLA_PUBLIC_URL"), "/")
	}
	if c.PollInterval == 0 {
		c.PollInterval = 5 * time.Second
		if raw := os.Getenv("CUPOLA_POLL_INTERVAL"); raw != "" {
			if parsed, err := time.ParseDuration(raw); err == nil && parsed >= time.Second {
				c.PollInterval = parsed
			}
		}
	}
	if c.SessionTTL == 0 {
		c.SessionTTL = 7 * 24 * time.Hour
	}
	if !c.AllowPrivateWebhooks {
		c.AllowPrivateWebhooks = os.Getenv("CUPOLA_ALLOW_PRIVATE_WEBHOOKS") == "1"
	}
	if len(c.CORSOrigins) == 0 {
		for _, origin := range strings.Split(os.Getenv("CUPOLA_CORS_ORIGINS"), ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				c.CORSOrigins = append(c.CORSOrigins, origin)
			}
		}
	}
	if err := os.MkdirAll(c.DataDir, 0o700); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(c.DataDir), 0o700); err != nil {
		return err
	}
	return nil
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

type secrets struct {
	key       []byte
	adminHash string
}

// loadSecrets creates or loads the hub key and the admin password hash. The
// key encrypts node tokens, webhook URLs and channel secrets at rest.
func loadSecrets(ctx context.Context, cfg *Config, st *store.Store) (*secrets, error) {
	key, err := loadKey(cfg)
	if err != nil {
		return nil, err
	}
	out := &secrets{key: key}

	stored, err := st.GetSetting(ctx, "admin_hash")
	if err != nil {
		return nil, err
	}
	if password := os.Getenv("CUPOLA_ADMIN_PASSWORD"); password != "" {
		if len(password) < 10 {
			return nil, errors.New("CUPOLA_ADMIN_PASSWORD must be at least 10 characters")
		}
		hash, err := hashPassword(password)
		if err != nil {
			return nil, err
		}
		if err := st.SetSetting(ctx, "admin_hash", hash); err != nil {
			return nil, err
		}
		stored = hash
	}
	if stored == "" {
		return nil, errors.New("no admin password: set CUPOLA_ADMIN_PASSWORD (at least 10 characters) on first start")
	}
	out.adminHash = stored
	return out, nil
}

func loadKey(cfg *Config) ([]byte, error) {
	if raw := os.Getenv("CUPOLA_SECRET"); raw != "" {
		key, err := base64.StdEncoding.DecodeString(raw)
		if err != nil || len(key) != 32 {
			return nil, errors.New("CUPOLA_SECRET must be 32 bytes, base64 encoded")
		}
		return key, nil
	}
	path := filepath.Join(cfg.DataDir, "secret.key")
	if body, err := os.ReadFile(path); err == nil {
		key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(body)))
		if err != nil || len(key) != 32 {
			return nil, fmt.Errorf("%s is not a 32-byte base64 key", path)
		}
		return key, nil
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	encoded := base64.StdEncoding.EncodeToString(key)
	if err := os.WriteFile(path, []byte(encoded+"\n"), 0o600); err != nil {
		return nil, err
	}
	return key, nil
}

func (c *Config) log() *slog.Logger {
	if c.Logger != nil {
		return c.Logger
	}
	return slog.New(slog.NewTextHandler(os.Stderr, nil))
}

func boolEnv(key string) bool {
	value, _ := strconv.ParseBool(os.Getenv(key))
	return value
}
