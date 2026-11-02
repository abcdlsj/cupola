package updater

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Request is what the hub writes and the root upgrader consumes. It carries no
// checksum: the upgrader fetches checksums.txt from the same base URL, so the
// hub cannot vouch for a binary it did not verify either.
type Request struct {
	Version     string `json:"version"`
	Asset       string `json:"asset"`
	BaseURL     string `json:"base_url"`
	Source      string `json:"source"`
	Force       bool   `json:"force,omitempty"`
	RequestedAt int64  `json:"requested_at"`
	RequestedBy string `json:"requested_by,omitempty"`
}

// Result is what the upgrader leaves behind for the hub to render.
type Result struct {
	Status string `json:"status"` // ok | rolled_back | failed
	From   string `json:"from"`
	To     string `json:"to"`
	At     int64  `json:"at"`
	Web    bool   `json:"web"`
	Detail string `json:"detail,omitempty"`
}

// Hold blocks an automatic retry of a version that already rolled back.
type Hold struct {
	Version string `json:"version"`
	Reason  string `json:"reason"`
	At      int64  `json:"at"`
}

// ReadRequest loads a pending request; a missing file reports os.ErrNotExist.
func ReadRequest(path string) (Request, error) {
	var request Request
	if err := readJSON(path, &request); err != nil {
		return Request{}, err
	}
	if request.Version == "" || request.Asset == "" || request.BaseURL == "" {
		return Request{}, errors.New("update request is incomplete")
	}
	return request, nil
}

// WriteRequest replaces the request file atomically. A rename into place also
// trips the PathChanged watcher on the upgrade unit.
func WriteRequest(path string, request Request) error {
	if request.RequestedAt == 0 {
		request.RequestedAt = time.Now().UnixMilli()
	}
	return writeJSONAtomic(path, request, 0o644)
}

// RemoveRequest deletes a consumed request, ignoring a missing file.
func RemoveRequest(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// ReadResult returns the outcome of the last upgrade run.
func ReadResult(path string) (Result, error) {
	var result Result
	if err := readJSON(path, &result); err != nil {
		return Result{}, err
	}
	return result, nil
}

// WriteResult records the outcome for the hub to display. It is written world
// readable because the hub runs without privileges.
func WriteResult(path string, result Result) error {
	if result.At == 0 {
		result.At = time.Now().UnixMilli()
	}
	return writeJSONAtomic(path, result, 0o644)
}

// ReadHold returns the blocked version, or os.ErrNotExist when nothing failed.
func ReadHold(path string) (Hold, error) {
	var hold Hold
	if err := readJSON(path, &hold); err != nil {
		return Hold{}, err
	}
	return hold, nil
}

// WriteHold records a version that must not be retried without --force.
func WriteHold(path string, hold Hold) error {
	if hold.At == 0 {
		hold.At = time.Now().UnixMilli()
	}
	return writeJSONAtomic(path, hold, 0o644)
}

// ClearHold forgets a previous failure after a successful install.
func ClearHold(path string) error {
	if path == "" {
		return nil
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func readJSON(path string, out any) error {
	body, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("%s: %w", filepath.Base(path), err)
	}
	return nil
}

func writeJSONAtomic(path string, value any, perm os.FileMode) error {
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	body = append(body, '\n')
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	if _, err := tmp.Write(body); err != nil {
		_ = tmp.Close()
		_ = os.Remove(name)
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		_ = os.Remove(name)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(name)
		return err
	}
	if err := os.Chmod(name, perm); err != nil {
		_ = os.Remove(name)
		return err
	}
	if err := os.Rename(name, path); err != nil {
		_ = os.Remove(name)
		return err
	}
	return nil
}
