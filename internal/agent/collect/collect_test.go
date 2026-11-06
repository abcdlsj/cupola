package collect

import "testing"

func TestRedactCommandKeepsOnlyNameAndCount(t *testing.T) {
	if got := redactCommand("codex", []string{"codex", "--token", "secret", "prompt"}); got != "codex [3 args redacted]" {
		t.Fatalf("redact = %q", got)
	}
	if got := redactCommand("ollama", []string{"ollama", "serve"}); got != "ollama [1 args redacted]" {
		t.Fatalf("redact = %q", got)
	}
	if got := redactCommand("systemd", nil); got != "systemd" {
		t.Fatalf("redact = %q", got)
	}
}

func TestSensorKey(t *testing.T) {
	chip, label := splitSensorKey("coretemp/Core 0")
	if chip != "coretemp" || label != "Core 0" {
		t.Fatalf("got %q %q", chip, label)
	}
}
