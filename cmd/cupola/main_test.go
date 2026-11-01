package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestVersionCommand(t *testing.T) {
	var out, errOut bytes.Buffer
	if code := run([]string{"version"}, &out, &errOut); code != 0 {
		t.Fatalf("exit = %d, want 0 (stderr: %s)", code, errOut.String())
	}
	if !strings.Contains(out.String(), "cupola 1.0.0") {
		t.Fatalf("stdout = %q, want version line", out.String())
	}
}

func TestNoArgumentsPrintsUsage(t *testing.T) {
	var out, errOut bytes.Buffer
	if code := run(nil, &out, &errOut); code != 2 {
		t.Fatalf("exit = %d, want 2", code)
	}
	if !strings.Contains(errOut.String(), "Usage:") {
		t.Fatalf("stderr = %q, want usage", errOut.String())
	}
}

func TestUnknownCommand(t *testing.T) {
	var out, errOut bytes.Buffer
	if code := run([]string{"collect"}, &out, &errOut); code != 2 {
		t.Fatalf("exit = %d, want 2", code)
	}
	if !strings.Contains(errOut.String(), `unknown command "collect"`) {
		t.Fatalf("stderr = %q, want unknown command", errOut.String())
	}
}

func TestAgentMissingConfigFails(t *testing.T) {
	var out, errOut bytes.Buffer
	if code := run([]string{"agent", "--config", "/nonexistent/agent.json"}, &out, &errOut); code != 1 {
		t.Fatalf("exit = %d, want 1", code)
	}
	if !strings.Contains(errOut.String(), "config:") {
		t.Fatalf("stderr = %q, want a config error", errOut.String())
	}
}

func TestHubWithoutPasswordFails(t *testing.T) {
	t.Setenv("CUPOLA_ADMIN_PASSWORD", "")
	t.Setenv("CUPOLA_DATA_DIR", t.TempDir())
	t.Setenv("CUPOLA_LISTEN", "127.0.0.1:0")
	var out, errOut bytes.Buffer
	if code := run([]string{"hub"}, &out, &errOut); code != 1 {
		t.Fatalf("exit = %d, want 1 (stderr: %s)", code, errOut.String())
	}
	if !strings.Contains(errOut.String(), "admin password") {
		t.Fatalf("stderr = %q, want the admin-password instruction", errOut.String())
	}
}
