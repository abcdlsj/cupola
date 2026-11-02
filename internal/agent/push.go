package agent

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
	"github.com/abcdlsj/cupola/internal/version"
)

// Pusher reports this agent's snapshot to the hub. It exists for hosts the hub
// cannot dial; the hub's ingest endpoint is the only thing it talks to.
//
// State is deliberately small: the last snapshot in memory and a sequence
// number. If the hub is unreachable the sample is dropped, exactly as a missed
// pull would be, so the agent never grows a queue.
type Pusher struct {
	agent    *Agent
	hubURL   string
	interval time.Duration
	token    string
	client   *http.Client
	seq      uint64
}

func newPusher(a *Agent) (*Pusher, error) {
	interval, err := a.cfg.Push.interval()
	if err != nil {
		return nil, err
	}
	return &Pusher{
		agent:    a,
		hubURL:   strings.TrimRight(a.cfg.Push.HubURL, "/"),
		interval: interval,
		token:    a.token,
		client:   &http.Client{Timeout: 15 * time.Second},
	}, nil
}

// Run reports until the context is cancelled, backing off on failure.
func (p *Pusher) Run(ctx context.Context) {
	p.agent.log.Info("pushing snapshots", "hub", p.hubURL, "interval", p.interval.String())
	backoff := time.Duration(0)
	for {
		delay := p.interval
		if backoff > 0 {
			delay = backoff
		}
		// Jitter keeps fifty agents from landing on the same second.
		delay += time.Duration(rand.Int63n(int64(delay/10) + 1))
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
		err := p.pushOnce(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			p.agent.log.Warn("push failed", "error", err.Error())
			if backoff == 0 {
				backoff = p.interval
			} else if backoff < 60*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = 0
	}
}

func (p *Pusher) pushOnce(ctx context.Context) error {
	snap, err := p.agent.Snapshot(ctx)
	if err != nil {
		return err
	}
	p.seq++
	payload := ingestPayload{Snapshot: snap, Actions: p.agent.actions.Advertised()}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	if _, err := writer.Write(raw); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.hubURL+"/api/v1/ingest", bytes.NewReader(compressed.Bytes()))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+p.token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Content-Encoding", "gzip")
	request.Header.Set("X-Cupola-Seq", strconv.FormatUint(p.seq, 10))
	request.Header.Set("X-Cupola-Agent-Ts", strconv.FormatInt(snap.Ts, 10))
	request.Header.Set("X-Cupola-Agent", version.Version)
	response, err := p.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusOK || response.StatusCode == http.StatusConflict {
		return nil // 409 means the hub already has this sequence
	}
	return fmt.Errorf("hub returned %d", response.StatusCode)
}

// ingestPayload mirrors the hub's ingest body.
type ingestPayload struct {
	Snapshot *model.Snapshot `json:"snapshot"`
	Actions  []model.Action  `json:"actions,omitempty"`
}
