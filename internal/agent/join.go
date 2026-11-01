package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/abcdlsj/cupola/internal/version"
)

// join registers this agent with the hub that issued the code: it sends the
// advertised URL (or the relay connection string) and the agent token, then
// prints the node's URL so the operator can jump back to the dashboard.
func (a *Agent) join(ctx context.Context, connString string) error {
	if a.cfg.JoinHub == "" || a.cfg.JoinCode == "" {
		return nil
	}
	if marker := a.cfg.JoinMarker; marker != "" {
		if _, err := os.Stat(marker); err == nil {
			return nil
		}
	}
	payload := map[string]any{
		"code":          a.cfg.JoinCode,
		"token":         a.token,
		"os":            runtime.GOOS,
		"arch":          runtime.GOARCH,
		"agent_version": version.Version,
	}
	if connString != "" {
		payload["transport"] = "bolthole"
		payload["conn"] = connString
	} else {
		payload["transport"] = "direct"
		payload["url"] = a.cfg.JoinAdvertise
	}
	body, _ := json.Marshal(payload)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(a.cfg.JoinHub, "/")+"/api/v1/join", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var result struct {
		NodeURL string `json:"node_url"`
		Error   struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.NewDecoder(response.Body).Decode(&result)
	if response.StatusCode != http.StatusOK {
		if result.Error.Message != "" {
			return fmt.Errorf("join rejected: %s", result.Error.Message)
		}
		return fmt.Errorf("join rejected with status %d", response.StatusCode)
	}
	if marker := a.cfg.JoinMarker; marker != "" {
		_ = os.WriteFile(marker, []byte(result.NodeURL+"\n"), 0o600)
	}
	fmt.Println("open:", result.NodeURL)
	return nil
}
