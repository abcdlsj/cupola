package agent

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

const (
	maxOutput = 8 * 1024
	maxRuns   = 200
)

// Actions runs the fixed scripts and Wake-on-LAN packets declared in the agent
// config. There is no shell, no user-supplied argument and no dynamic script
// path: every field comes from the root-owned config file.
type Actions struct {
	defs []ActionConfig
	log  Logger

	mu    sync.Mutex
	last  map[string]model.ActionResult
	busy  map[string]bool
	runs  []model.ActionRun
}

// Logger is the small surface the actions need, so they never receive the
// application logger with its request fields.
type Logger interface {
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
}

func NewActions(defs []ActionConfig, log Logger) *Actions {
	return &Actions{
		defs: append([]ActionConfig(nil), defs...),
		log:  log,
		last: make(map[string]model.ActionResult),
		busy: make(map[string]bool),
	}
}

func (a *Actions) find(id string) (ActionConfig, bool) {
	for _, def := range a.defs {
		if def.ID == id {
			return def, true
		}
	}
	return ActionConfig{}, false
}

// Advertised returns the public view: no script path, MAC or broadcast.
func (a *Actions) Advertised() []model.Action {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]model.Action, 0, len(a.defs))
	for _, def := range a.defs {
		action := model.Action{
			ID:          def.ID,
			Name:        def.Name,
			Description: def.Description,
			Icon:        def.Icon,
			Type:        def.Type,
			Danger:      def.Danger,
			AllowAPI:    def.AllowAPI,
		}
		if last, ok := a.last[def.ID]; ok {
			action.LastRunAt = last.StartedAt
			okCopy := last.OK
			action.LastOK = &okCopy
		}
		out = append(out, action)
	}
	return out
}

// Run executes one action. One run per action at a time; output is capped at
// 8 KiB and every run is recorded as an event.
func (a *Actions) Run(ctx context.Context, id, actor, source string) (model.ActionResult, error) {
	def, ok := a.find(id)
	if !ok {
		return model.ActionResult{}, fmt.Errorf("unknown action %q", id)
	}

	a.mu.Lock()
	if a.busy[id] {
		a.mu.Unlock()
		return model.ActionResult{}, errors.New("this action is already running")
	}
	a.busy[id] = true
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		a.busy[id] = false
		a.mu.Unlock()
	}()

	started := time.Now()
	result := model.ActionResult{
		RunID:     newRunID(),
		ActionID:  id,
		StartedAt: started.UnixMilli(),
	}

	var err error
	switch def.Type {
	case "script":
		result.ExitCode, result.Stdout, result.Stderr, result.Truncated, err = runScript(ctx, def, started)
	case "wol":
		result.Stdout, err = sendWOL(def)
	default:
		err = fmt.Errorf("unknown action type %q", def.Type)
	}
	result.DurationMs = time.Since(started).Milliseconds()
	if err != nil {
		result.OK = false
		if result.ExitCode == 0 {
			result.ExitCode = -1
		}
		if result.Stderr == "" {
			result.Stderr = err.Error()
		}
	} else {
		result.OK = result.ExitCode == 0
	}

	a.mu.Lock()
	a.last[id] = result
	run := model.ActionRun{
		ID:         result.RunID,
		ActionID:   id,
		ActionName: def.Name,
		Ts:         result.StartedAt,
		Actor:      actor,
		Source:     source,
		OK:         result.OK,
		ExitCode:   result.ExitCode,
		DurationMs: result.DurationMs,
	}
	if result.Stdout != "" || result.Stderr != "" {
		run.Output = strings.TrimRight(result.Stdout+result.Stderr, "\n")
	}
	run.Truncated = result.Truncated
	a.runs = append([]model.ActionRun{run}, a.runs...)
	if len(a.runs) > maxRuns {
		a.runs = a.runs[:maxRuns]
	}
	a.mu.Unlock()

	if a.log != nil {
		// Action id, actor and exit code only: never the script path, arguments
		// or output.
		a.log.Info("action run", "action", id, "actor", actor, "source", source, "exit", result.ExitCode, "duration_ms", result.DurationMs)
	}
	return result, nil
}

func (a *Actions) Runs() []model.ActionRun {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]model.ActionRun(nil), a.runs...)
}

func newRunID() string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func runScript(ctx context.Context, def ActionConfig, started time.Time) (int, string, string, bool, error) {
	timeout, err := time.ParseDuration(def.Timeout)
	if err != nil {
		return -1, "", "", false, err
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// No shell, no arguments, fixed binary from the config.
	cmd := exec.CommandContext(runCtx, def.Script)
	cwd := def.Cwd
	if cwd == "" {
		cwd = filepath.Dir(def.Script)
	}
	cmd.Dir = cwd
	cmd.Env = []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"LANG=C.UTF-8",
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		// Kill the whole process group so a script cannot leave children behind.
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}

	stdout := &limitedBuffer{limit: maxOutput}
	stderr := &limitedBuffer{limit: maxOutput}
	cmd.Stdout = stdout
	cmd.Stderr = stderr

	err = cmd.Run()
	exit := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exit = exitErr.ExitCode()
		} else {
			exit = -1
		}
		if runCtx.Err() == context.DeadlineExceeded {
			stderr.WriteString("\n[timeout] action killed after " + timeout.String())
		}
	}
	truncated := stdout.truncated || stderr.truncated
	_ = started
	return exit, stdout.String(), stderr.String(), truncated, nil
}

// limitedBuffer keeps the first limit bytes and drops the rest, remembering
// that it had to truncate.
type limitedBuffer struct {
	buf       []byte
	limit     int
	truncated bool
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if len(b.buf) < b.limit {
		room := b.limit - len(b.buf)
		if len(p) > room {
			b.buf = append(b.buf, p[:room]...)
			b.truncated = true
		} else {
			b.buf = append(b.buf, p...)
		}
	} else {
		b.truncated = true
	}
	return len(p), nil
}

func (b *limitedBuffer) WriteString(s string) {
	_, _ = b.Write([]byte(s))
}

func (b *limitedBuffer) String() string { return string(b.buf) }

// sendWOL builds the 102-byte magic packet from the config and sends it to the
// configured broadcast address. The MAC and broadcast never leave the agent.
func sendWOL(def ActionConfig) (string, error) {
	mac, err := net.ParseMAC(def.MAC)
	if err != nil {
		return "", err
	}
	packet := make([]byte, 6+16*len(mac))
	for i := 0; i < 6; i++ {
		packet[i] = 0xff
	}
	for i := 1; i <= 16; i++ {
		copy(packet[6+6*(i-1):], mac)
	}
	conn, err := net.ListenUDP("udp4", nil)
	if err != nil {
		return "", err
	}
	defer conn.Close()
	if err := setBroadcast(conn); err != nil {
		return "", err
	}
	addr := &net.UDPAddr{IP: net.ParseIP(def.Broadcast).To4(), Port: def.Port}
	if _, err := conn.WriteToUDP(packet, addr); err != nil {
		return "", err
	}
	return fmt.Sprintf("sent %d-byte magic packet to :%d", len(packet), def.Port), nil
}

// EventRing keeps the agent's recent events (action runs) for /v1/events.
type EventRing struct {
	mu     sync.Mutex
	events []model.Event
	next   int64
}

func NewEventRing() *EventRing { return &EventRing{next: 1} }

func (r *EventRing) Add(nodeID, kind, severity, message string, meta any) model.Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	event := model.Event{
		ID:       r.next,
		NodeID:   nodeID,
		Ts:       time.Now().UnixMilli(),
		Kind:     kind,
		Severity: severity,
		Message:  message,
	}
	r.next++
	if meta != nil {
		if body, err := json.Marshal(meta); err == nil {
			event.Meta = string(body)
		}
	}
	r.events = append(r.events, event)
	if len(r.events) > 500 {
		r.events = r.events[len(r.events)-500:]
	}
	return event
}

func (r *EventRing) Since(since int64) []model.Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]model.Event, 0, len(r.events))
	for _, event := range r.events {
		if event.Ts >= since {
			out = append(out, event)
		}
	}
	return out
}

// RecordRun turns an action result into an event.
func RecordRun(ring *EventRing, nodeID string, def ActionConfig, result model.ActionResult, actor, source string) {
	severity := "info"
	message := fmt.Sprintf("%s ran (%s)", def.Name, actor)
	if !result.OK {
		severity = "warning"
		message = fmt.Sprintf("%s failed with exit %d", def.Name, result.ExitCode)
	}
	ring.Add(nodeID, "action", severity, message, map[string]any{
		"action":      def.ID,
		"run_id":      result.RunID,
		"actor":       actor,
		"source":      source,
		"exit_code":   result.ExitCode,
		"duration_ms": result.DurationMs,
		"truncated":   result.Truncated,
	})
}

func readFileTrim(path string) string {
	body, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(body))
}
