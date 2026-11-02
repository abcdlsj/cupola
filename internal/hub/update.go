package hub

import (
	"net"
	"net/http"
	"path/filepath"
	"time"

	"github.com/abcdlsj/cupola/internal/updater"
	"github.com/abcdlsj/cupola/internal/version"
)

// The hub never installs anything: it resolves a release, writes a request file
// and a root oneshot unit (cupola-upgrade) performs the swap, restarts the
// service and rolls back if the health check fails. See docs/DEPLOY.md.

func (h *Hub) updatePaths() (request, result, hold string) {
	dir := h.cfg.DataDir
	return filepath.Join(dir, "update.request"), filepath.Join(dir, "update.result"), filepath.Join(dir, "update.hold")
}

func (h *Hub) handleUpdateStatus(w http.ResponseWriter, r *http.Request) {
	requestPath, resultPath, holdPath := h.updatePaths()
	force := r.URL.Query().Get("refresh") == "1"
	release, checkedAt, checkErr := h.updates.Check(r.Context(), force)
	out := map[string]any{
		"current":   version.Get(),
		"enabled":   h.updates.Enabled(),
		"repo":      h.updates.Repo(),
		"can_apply": h.updates.Enabled() && updater.Writable(h.cfg.DataDir),
		"available": false,
	}
	if !checkedAt.IsZero() {
		out["checked_at"] = checkedAt.UnixMilli()
	}
	if release != nil {
		out["latest"] = release
		out["available"] = updater.Newer(release.Version, version.Version)
	}
	if checkErr != nil {
		out["error"] = checkErr.Error()
	}
	if last, err := updater.ReadResult(resultPath); err == nil {
		out["last"] = last
	}
	if hold, err := updater.ReadHold(holdPath); err == nil {
		out["hold"] = hold
	}
	if queued, err := updater.ReadRequest(requestPath); err == nil {
		out["queued"] = queued
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Hub) handleUpdateApply(w http.ResponseWriter, r *http.Request) {
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if !h.limiter.allow("update:" + ip) {
		apiError(w, http.StatusTooManyRequests, "rate_limit", "too many upgrade requests; wait a minute")
		return
	}
	var body struct {
		Version string `json:"version"`
		Force   bool   `json:"force"`
	}
	if err := decodeJSON(r, &body); err != nil {
		apiError(w, http.StatusBadRequest, "body", "expected {\"version\": \"1.2.3\", \"force\": false}")
		return
	}
	if !h.updates.Enabled() {
		apiError(w, http.StatusConflict, "disabled", "update checks are disabled (CUPOLA_UPDATE=0)")
		return
	}
	requestPath, _, holdPath := h.updatePaths()
	if !updater.Writable(h.cfg.DataDir) {
		apiError(w, http.StatusConflict, "not_writable", "the hub cannot write "+requestPath+"; check the data directory permissions")
		return
	}

	release, _, checkErr := h.updates.Check(r.Context(), true)
	if release == nil {
		detail := "no published release for " + version.Version
		if checkErr != nil {
			detail = checkErr.Error()
		}
		apiError(w, http.StatusServiceUnavailable, "unavailable", detail)
		return
	}
	if body.Version != "" && body.Version != release.Version {
		apiError(w, http.StatusBadRequest, "version", "unknown version "+body.Version+"; the newest release is "+release.Version)
		return
	}
	if !updater.Newer(release.Version, version.Version) && !body.Force {
		apiError(w, http.StatusConflict, "up_to_date", "this hub already runs "+version.Version)
		return
	}
	if hold, err := updater.ReadHold(holdPath); err == nil && hold.Version == release.Version && !body.Force {
		apiError(w, http.StatusConflict, "held", hold.Version+" rolled back on this host ("+hold.Reason+"); retry with force")
		return
	}

	id := identityFrom(r.Context())
	request := updater.Request{
		Version:     release.Version,
		Asset:       release.Asset,
		BaseURL:     release.BaseURL,
		Source:      release.Source,
		Force:       body.Force,
		RequestedAt: time.Now().UnixMilli(),
		RequestedBy: id.mode,
	}
	if id.token != nil {
		request.RequestedBy = "token " + id.token.Name
	}
	if err := updater.WriteRequest(requestPath, request); err != nil {
		apiError(w, http.StatusInternalServerError, "write", err.Error())
		return
	}
	h.log.Info("upgrade requested", "version", release.Version, "source", release.Source, "by", request.RequestedBy)
	writeJSON(w, http.StatusAccepted, map[string]any{
		"queued":  true,
		"version": release.Version,
		"source":  release.Source,
	})
}

// handleUpdateCancel drops a queued request before the path unit picks it up.
func (h *Hub) handleUpdateCancel(w http.ResponseWriter, r *http.Request) {
	requestPath, _, _ := h.updatePaths()
	if err := updater.RemoveRequest(requestPath); err != nil {
		apiError(w, http.StatusInternalServerError, "remove", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"queued": false})
}
