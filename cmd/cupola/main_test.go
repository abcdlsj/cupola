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
	if !strings.Contains(out.String(), "cupola 0.1.0-m0") {
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

func TestUnimplementedSubcommandsSaySo(t *testing.T) {
	for _, cmd := range []string{"agent", "hub", "serve"} {
		var out, errOut bytes.Buffer
		if code := run([]string{cmd}, &out, &errOut); code == 0 {
			t.Fatalf("%s: exit = 0, want a non-zero code until the backend lands", cmd)
		}
		if !strings.Contains(errOut.String(), "not implemented yet") {
			t.Fatalf("%s: stderr = %q, want an explicit not-implemented message", cmd, errOut.String())
		}
	}
}
