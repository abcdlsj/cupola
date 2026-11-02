package hub

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/hex"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

// joinTTL is deliberately short: a join code is a bootstrap secret.
const joinTTL = 30 * time.Minute

var codeEncoding = base32.NewEncoding("ABCDEFGHJKMNPQRSTVWXYZ0123456789").WithPadding(base32.NoPadding)

// advertisePattern keeps the tailnet address the hub injects into the install
// command to a plain http(s) origin; the generated command is pasted into a
// shell, so nothing else may slip in.
var advertisePattern = regexp.MustCompile(`^https?://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?$`)

func validAdvertiseURL(raw string) bool {
	if !advertisePattern.MatchString(raw) {
		return false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return false
	}
	if port := parsed.Port(); port != "" {
		number, err := strconv.Atoi(port)
		if err != nil || number < 1 || number > 65535 {
			return false
		}
	}
	return true
}

func newJoinCode() (code, hash string, err error) {
	buf := make([]byte, 10) // 80 bits -> 16 Crockford base32 characters
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	code = codeEncoding.EncodeToString(buf)
	sum := sha256.Sum256([]byte("join:" + code))
	return code, hex.EncodeToString(sum[:]), nil
}

func joinHash(code string) string {
	sum := sha256.Sum256([]byte("join:" + strings.ToUpper(strings.TrimSpace(code))))
	return hex.EncodeToString(sum[:])
}

// handleCreateJoinCode (admin) prepares a pending node and returns the one-time
// code plus the commands the operator pastes into the new machine. Without an
// advertised URL the installer joins in push mode.
func (h *Hub) handleCreateJoinCode(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID        string   `json:"id"`
		Name      string   `json:"name"`
		Labels    []string `json:"labels"`
		Advertise string   `json:"advertise"`
	}
	if err := decodeJSON(r, &body); err != nil {
		apiError(w, http.StatusBadRequest, "json", "invalid body")
		return
	}
	if !nodeIDPattern.MatchString(body.ID) {
		apiError(w, http.StatusBadRequest, "id", "id must be a short lowercase slug")
		return
	}
	if body.Name == "" {
		body.Name = body.ID
	}
	if body.Labels == nil {
		body.Labels = []string{}
	}
	advertise := strings.TrimSpace(body.Advertise)
	if advertise != "" && !validAdvertiseURL(advertise) {
		apiError(w, http.StatusBadRequest, "advertise", "advertise must be an http(s) URL such as http://100.64.0.5:9797")
		return
	}
	advertiseFlag := ""
	if advertise != "" {
		advertiseFlag = " --advertise " + advertise
	}
	existing, err := h.store.GetNode(r.Context(), body.ID)
	if err == nil && existing.LastSeen > 0 {
		apiError(w, http.StatusConflict, "exists", "this node already has an agent; use Edit for a new token")
		return
	}
	record := model.NodeRecord{
		ID: body.ID, Name: body.Name, Labels: body.Labels, Mode: "pull",
		CreatedAt: time.Now().UnixMilli(), Status: "pending",
	}
	if err := h.store.UpsertNode(r.Context(), record, nil, ""); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	code, hash, err := newJoinCode()
	if err != nil {
		apiError(w, http.StatusInternalServerError, "code", err.Error())
		return
	}
	expires := time.Now().Add(joinTTL).UnixMilli()
	if err := h.store.CreateJoinCode(r.Context(), hash, body.ID, expires); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	hubBase := h.cfg.PublicURL
	if hubBase == "" {
		hubBase = "http://" + r.Host
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"code":       code,
		"node_id":    body.ID,
		"expires_at": expires,
		"hub_url":    hubBase,
		"commands": map[string]string{
			"linux":   `curl -fsSL ` + hubBase + `/install.sh | sudo sh -s -- --hub ` + hubBase + ` --code ` + code + ` --node ` + body.ID + advertiseFlag,
			"darwin":  `curl -fsSL ` + hubBase + `/install.sh | sh -s -- --hub ` + hubBase + ` --code ` + code + ` --node ` + body.ID + advertiseFlag,
			"manual":  `cupola agent --config /etc/cupola/agent.json --join ` + hubBase + ` --join-code ` + code + ` --push ` + hubBase,
			"pull":    `cupola agent --config /etc/cupola/agent.json --join ` + hubBase + ` --join-code ` + code + ` --advertise http://<this-host>:9797`,
		},
	})
}

// handleJoin (public, rate limited) lets a new agent claim its pending node.
// The agent sends the token it generated; the hub stores it encrypted and never
// echoes it back.
func (h *Hub) handleJoin(w http.ResponseWriter, r *http.Request) {
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if !h.limiter.allow("join:" + ip) {
		apiError(w, http.StatusTooManyRequests, "rate_limit", "too many join attempts; wait a minute")
		return
	}
	var body struct {
		Code      string `json:"code"`
		URL       string `json:"url"`
		Advertise string `json:"advertise"`
		Token     string `json:"token"`
		Mode      string `json:"mode"`
		OS        string `json:"os"`
		Arch      string `json:"arch"`
		Agent     string `json:"agent_version"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Code == "" || body.Token == "" {
		apiError(w, http.StatusBadRequest, "join", "code and token are required")
		return
	}
	advertise := body.URL
	if advertise == "" {
		advertise = body.Advertise
	}
	mode := body.Mode
	if mode == "" {
		mode = "pull"
	}
	if mode != "pull" && mode != "push" {
		apiError(w, http.StatusBadRequest, "mode", "mode must be pull or push")
		return
	}
	if mode == "pull" {
		parsed, err := url.Parse(advertise)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			apiError(w, http.StatusBadRequest, "url", "a pull agent must advertise an http(s) URL")
			return
		}
	}
	nodeID, err := h.store.ConsumeJoinCode(r.Context(), joinHash(body.Code), time.Now().UnixMilli())
	if err != nil {
		apiError(w, http.StatusBadRequest, "code", err.Error())
		return
	}
	tokenEnc, err := encrypt(h.keys.key, []byte(body.Token))
	if err != nil {
		apiError(w, http.StatusInternalServerError, "encrypt", err.Error())
		return
	}
	record, err := h.store.GetNode(r.Context(), nodeID)
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found", "the pending node is gone")
		return
	}
	record.URL = advertise
	record.Mode = mode
	if body.OS != "" {
		record.OS = body.OS
	}
	if err := h.store.UpsertNode(r.Context(), record, tokenEnc, tokenHash(body.Token)); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	_ = h.store.SetNodeStatus(r.Context(), nodeID, "unknown", 0)
	h.log.Info("agent joined", "node", nodeID, "mode", mode, "os", body.OS, "arch", body.Arch, "agent", body.Agent)
	hubBase := h.cfg.PublicURL
	if hubBase == "" {
		hubBase = "http://" + r.Host
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"node_id": nodeID,
		"name":    record.Name,
		"node_url": strings.TrimRight(hubBase, "/") + "/nodes/" + nodeID,
	})
}

// handleJoinStatus lets the Add-system dialog poll until the agent registers.
func (h *Hub) handleJoinStatus(w http.ResponseWriter, r *http.Request) {
	record, err := h.store.GetNode(r.Context(), r.PathValue("id"))
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found", "no such node")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"node_id":   record.ID,
		"name":      record.Name,
		"status":    record.Status,
		"last_seen": record.LastSeen,
		"joined":    record.LastSeen > 0,
	})
}

// handleInstallScript serves scripts/install.sh with the hub's own base URL
// substituted, so the same script works for any deployment.
func (h *Hub) handleInstallScript(w http.ResponseWriter, r *http.Request) {
	body, err := webAssets.ReadFile("assets/install.sh")
	if err != nil {
		apiError(w, http.StatusInternalServerError, "install", "install script missing")
		return
	}
	hubBase := h.cfg.PublicURL
	if hubBase == "" {
		hubBase = "https://" + r.Host
	}
	out := strings.ReplaceAll(string(body), "@HUB@", strings.TrimRight(hubBase, "/"))
	w.Header().Set("Content-Type", "text/x-shellscript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write([]byte(out))
}

// handleInstallBinary serves the running hub binary; the same executable is the
// agent. It only answers for the hub's own os/arch, so a linux/amd64 hub can
// bootstrap linux/amd64 machines without a release pipeline.
func (h *Hub) handleInstallBinary(w http.ResponseWriter, r *http.Request) {
	wantOS := r.URL.Query().Get("os")
	wantArch := r.URL.Query().Get("arch")
	if wantOS == "" {
		wantOS = runtime.GOOS
	}
	if wantArch == "" {
		wantArch = runtime.GOARCH
	}
	if wantOS == "darwin" || wantArch != runtime.GOARCH || wantOS != runtime.GOOS {
		apiError(w, http.StatusNotFound, "platform", "this hub can only serve its own platform ("+runtime.GOOS+"/"+runtime.GOARCH+"); publish a release for others")
		return
	}
	path, err := os.Executable()
	if err != nil {
		apiError(w, http.StatusInternalServerError, "binary", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="cupola"`)
	http.ServeFile(w, r, path)
}
