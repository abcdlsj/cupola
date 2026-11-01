package hub

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/abcdlsj/cupola/internal/hub/store"
	"github.com/abcdlsj/cupola/internal/model"
)

type channelConfig struct {
	URL    string `json:"url,omitempty"`
	Token  string `json:"token,omitempty"`
	ChatID string `json:"chat_id,omitempty"`
}

type webhookEvent struct {
	ID       int64  `json:"id,omitempty"`
	Kind     string `json:"kind"`
	Severity string `json:"severity"`
	Node     string `json:"node"`
	Message  string `json:"message"`
	Ts       int64  `json:"ts"`
}

type webhookPayload struct {
	Event webhookEvent `json:"event"`
	Alert *model.Alert `json:"alert,omitempty"`
	Hub   string       `json:"hub,omitempty"`
}

// notifier delivers alerts to a channel: generic webhook, ntfy, Discord,
// Slack or Telegram. Webhook URLs and channel secrets are decrypted only here.
type notifier struct {
	cfg   *Config
	store *store.Store
	key   []byte
	log   *slog.Logger
}

func newNotifier(cfg *Config, st *store.Store, key []byte, log *slog.Logger) *notifier {
	return &notifier{cfg: cfg, store: st, key: key, log: log}
}

// notifyAsync records the delivery attempt in the background; the poller never
// waits on a webhook.
func (n *notifier) notifyAsync(alert model.Alert, channelID string) {
	if channelID == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := n.deliver(ctx, alert, channelID); err != nil {
			n.log.Warn("alert delivery failed", "alert", alert.ID, "channel", channelID, "error", err.Error())
		}
	}()
}

func (n *notifier) deliver(ctx context.Context, alert model.Alert, channelID string) error {
	record, err := n.store.GetChannelRecord(ctx, channelID)
	if err != nil {
		return err
	}
	configBody, err := decrypt(n.key, record.ConfigEnc)
	if err != nil {
		return err
	}
	secret, err := decrypt(n.key, record.SecretEnc)
	if err != nil {
		return err
	}
	var config channelConfig
	if err := json.Unmarshal(configBody, &config); err != nil {
		return err
	}
	payload := webhookPayload{
		Event: webhookEvent{
			Kind:     "alert",
			Severity: alertSeverity(alert),
			Node:     alert.NodeID,
			Message:  alert.Message,
			Ts:       alert.Ts,
		},
		Alert: &alert,
		Hub:   n.cfg.PublicURL,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	text := formatAlertText(alert)

	attempts := 0
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		attempts++
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(attempt*attempt) * time.Second):
			}
		}
		lastErr = n.send(ctx, record.Kind, config, string(secret), alert, body, text)
		if lastErr == nil {
			break
		}
	}
	delivery := model.Delivery{
		AlertID:   alert.ID,
		ChannelID: channelID,
		Ts:        time.Now().UnixMilli(),
		OK:        lastErr == nil,
		Attempts:  attempts,
		Status:    "delivered",
	}
	if lastErr != nil {
		delivery.Status = "failed"
		delivery.Error = lastErr.Error()
	}
	_ = n.store.InsertDelivery(ctx, &delivery)
	return lastErr
}

func (n *notifier) send(ctx context.Context, kind string, config channelConfig, secret string, alert model.Alert, payload []byte, text string) error {
	target := config.URL
	var method = http.MethodPost
	var body []byte
	headers := map[string]string{}
	switch kind {
	case "webhook":
		body = payload
		headers["Content-Type"] = "application/json"
		headers["User-Agent"] = "cupola-alerts/1"
		if secret != "" {
			mac := hmac.New(sha256.New, []byte(secret))
			mac.Write(payload)
			headers["X-Cupola-Signature"] = "sha256=" + hex.EncodeToString(mac.Sum(nil))
		}
	case "ntfy":
		body = []byte(text)
		headers["Title"] = alertTitle(alert)
		if config.Token != "" {
			headers["Authorization"] = "Bearer " + config.Token
		}
	case "discord":
		body, _ = json.Marshal(map[string]string{"content": text})
		headers["Content-Type"] = "application/json"
	case "slack":
		body, _ = json.Marshal(map[string]string{"text": text})
		headers["Content-Type"] = "application/json"
	case "telegram":
		if config.Token == "" || config.ChatID == "" {
			return errors.New("telegram needs a bot token and chat id")
		}
		target = "https://api.telegram.org/bot" + config.Token + "/sendMessage"
		body, _ = json.Marshal(map[string]string{"chat_id": config.ChatID, "text": text})
		headers["Content-Type"] = "application/json"
	default:
		return fmt.Errorf("unknown channel kind %q", kind)
	}
	if target == "" {
		return errors.New("channel has no target")
	}
	client, err := n.httpClient()
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(body))
	if err != nil {
		return err
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	snippet, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("channel returned %d: %s", response.StatusCode, strings.TrimSpace(string(snippet)))
	}
	return nil
}

// httpClient refuses private targets unless the operator opts in, resolves DNS
// itself and dials the checked address (no DNS rebinding), and never follows a
// redirect.
func (n *notifier) httpClient() (*http.Client, error) {
	allowPrivate := n.cfg.AllowPrivateWebhooks
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{
		DisableKeepAlives:   true,
		TLSHandshakeTimeout: 5 * time.Second,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			var chosen net.IP
			for _, address := range addresses {
				if !allowPrivate && !publicIP(address.IP) {
					return nil, fmt.Errorf("target %s resolves to a private address", host)
				}
				if chosen == nil {
					chosen = address.IP
				}
			}
			if chosen == nil {
				return nil, fmt.Errorf("target %s has no address", host)
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(chosen.String(), port))
		},
	}
	return &http.Client{
		Timeout:   5 * time.Second,
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, nil
}

func publicIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127: // CGNAT
			return false
		case v4[0] == 198 && (v4[1] == 18 || v4[1] == 19): // benchmarking
			return false
		case v4[0] >= 240:
			return false
		}
		return true
	}
	if len(ip) == net.IPv6len && ip[0]&0xfe == 0xfc { // ULA
		return false
	}
	return true
}

// validateChannelURL rejects bad schemes and private hosts at creation time, so
// the operator sees the error in the UI rather than in a delivery log.
func validateChannelURL(raw string, allowPrivate bool) error {
	parsed, err := url.Parse(raw)
	if err != nil {
		return err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("URL must be http or https")
	}
	host := parsed.Hostname()
	if host == "" {
		return errors.New("URL has no host")
	}
	if ip := net.ParseIP(host); ip != nil {
		if !allowPrivate && !publicIP(ip) {
			return errors.New("private targets are blocked; set CUPOLA_ALLOW_PRIVATE_WEBHOOKS=1 to allow them")
		}
		return nil
	}
	addresses, err := net.DefaultResolver.LookupIPAddr(context.Background(), host)
	if err != nil {
		return fmt.Errorf("DNS: %w", err)
	}
	for _, address := range addresses {
		if !allowPrivate && !publicIP(address.IP) {
			return errors.New("host resolves to a private address; blocked")
		}
	}
	return nil
}

func formatAlertText(alert model.Alert) string {
	state := alert.State
	if state == "" {
		state = "firing"
	}
	return fmt.Sprintf("[%s] %s · %s: %s", state, alert.NodeID, alert.RuleName, alert.Message)
}

func alertTitle(alert model.Alert) string {
	if alert.RuleName != "" {
		return "Cupola · " + alert.RuleName
	}
	return "Cupola alert"
}

func alertSeverity(alert model.Alert) string {
	if alert.State == "resolved" {
		return "info"
	}
	return "warning"
}

var metricNames = map[string]bool{
	"cpu": true, "mem": true, "load": true, "disk": true, "inode": true, "temp": true,
	"psi_cpu": true, "psi_io": true,
}

// metricValue extracts the number a metric rule compares.
func metricValue(snap *model.Snapshot, metric string) (float64, bool) {
	if snap == nil {
		return 0, false
	}
	switch metric {
	case "cpu":
		return snap.CPU.Percent, true
	case "mem":
		return snap.Memory.UsedPercent, true
	case "load":
		return snap.CPU.Load1, true
	case "disk":
		value := 0.0
		for _, disk := range snap.Disks {
			if disk.UsedPct > value {
				value = disk.UsedPct
			}
		}
		return value, true
	case "inode":
		value := 0.0
		for _, disk := range snap.Disks {
			if disk.InodePct > value {
				value = disk.InodePct
			}
		}
		return value, true
	case "temp":
		value := 0.0
		for _, sensor := range snap.Sensors {
			if sensor.Kind == "temperature" && sensor.Value > value {
				value = sensor.Value
			}
		}
		return value, value > 0
	case "psi_cpu":
		return snap.Pressure.CPU.Some, true
	case "psi_io":
		return snap.Pressure.IO.Some, true
	}
	return 0, false
}

func conditionMet(comparator string, value, threshold float64) bool {
	switch comparator {
	case "lt":
		return value < threshold
	default:
		return value > threshold
	}
}
