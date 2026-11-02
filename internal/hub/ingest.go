package hub

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

// ingestMaxBody bounds a pushed snapshot. A 50-process snapshot is 5-15 KiB
// after gzip; 1 MiB is generous and keeps a hostile agent cheap to reject.
const ingestMaxBody = 1 << 20

// ingestPayload is what an agent posts. Identity comes from the bearer token,
// never from the body.
type ingestPayload struct {
	Snapshot *model.Snapshot `json:"snapshot"`
	Actions  []model.Action  `json:"actions,omitempty"`
}

// handleIngest accepts a pushed snapshot from a NATed agent. It is the mirror
// of the pull source: same auth token, same pipeline, no downward channel.
func (h *Hub) handleIngest(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if token == "" {
		apiError(w, http.StatusUnauthorized, "unauthorized", "an agent token is required")
		return
	}
	hash := tokenHash(token)
	node, err := h.store.NodeByTokenHash(r.Context(), hash)
	if err != nil {
		apiError(w, http.StatusUnauthorized, "unauthorized", "unknown agent token")
		return
	}
	if node.Mode != "push" {
		apiError(w, http.StatusConflict, "mode", "this node is pull-only; it cannot push samples")
		return
	}
	if !h.ingestLimiter.allow(node.ID) {
		apiError(w, http.StatusTooManyRequests, "rate_limit", "too many samples; slow down")
		return
	}

	body, err := readIngestBody(r)
	if err != nil {
		apiError(w, http.StatusRequestEntityTooLarge, "body", err.Error())
		return
	}
	var payload ingestPayload
	if err := json.Unmarshal(body, &payload); err != nil || payload.Snapshot == nil {
		apiError(w, http.StatusBadRequest, "json", "a snapshot is required")
		return
	}
	snap := payload.Snapshot

	seq, _ := strconv.ParseInt(r.Header.Get("X-Cupola-Seq"), 10, 64)
	agentTs, _ := strconv.ParseInt(r.Header.Get("X-Cupola-Agent-Ts"), 10, 64)
	if seq > 0 {
		fresh, err := h.store.RecordIngest(r.Context(), node.ID, seq, agentTs)
		if err != nil {
			apiError(w, http.StatusInternalServerError, "store", err.Error())
			return
		}
		if !fresh {
			writeJSON(w, http.StatusConflict, map[string]any{"ok": false, "error": map[string]string{
				"code": "stale", "message": "this sequence was already accepted",
			}})
			return
		}
	}

	// The hub clock is the sample time, so rollups and retention match pull.
	// The agent's own clock is only a skew signal.
	snap.Ts = time.Now().UnixMilli()
	if agentTs > 0 && absDuration(snap.Ts-agentTs) > 60_000 {
		snap.Warnings = append(snap.Warnings, "agent clock is off by more than a minute")
	}
	if snap.Node.ID == "" {
		snap.Node.ID = node.ID
	}
	if snap.Node.ID != node.ID {
		apiError(w, http.StatusBadRequest, "node", "the snapshot node id does not match the token")
		return
	}

	h.poller.processSnapshot(r.Context(), node, snap, payload.Actions)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"next_poll_sec": int(h.poller.ingestInterval().Seconds()),
	})
}

func readIngestBody(r *http.Request) ([]byte, error) {
	var reader io.Reader = io.LimitReader(r.Body, ingestMaxBody+1)
	if strings.EqualFold(r.Header.Get("Content-Encoding"), "gzip") {
		gz, err := gzip.NewReader(reader)
		if err != nil {
			return nil, err
		}
		defer gz.Close()
		reader = io.LimitReader(gz, ingestMaxBody+1)
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	if len(body) > ingestMaxBody {
		return nil, errIngestTooLarge
	}
	return body, nil
}

type ingestError string

func (e ingestError) Error() string { return string(e) }

const errIngestTooLarge = ingestError("the sample is larger than 1 MiB")

func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func absDuration(ms int64) int64 {
	if ms < 0 {
		return -ms
	}
	return ms
}
