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

func TestAgentRegistry(t *testing.T) {
	cases := []struct {
		name, cmd, cwd, want string
		ok                   bool
	}{
		{"codex", "codex [4 args redacted]", "/home/dev/src/cupola", "codex", true},
		{"claude", "claude [2 args redacted]", "/home/dev/src/api", "claude", true},
		{"ollama", "ollama serve", "/home/dev/models", "ollama", true},
		{"llama-server", "llama-server [2 args redacted]", "/srv/models", "llamacpp", true},
		{"pi", "pi [3 args redacted]", "/home/dev/src/pi", "pi", true},
		{"pi", "pi", "/usr/bin", "", false},
		{"python3", "python3 main.py", "/home/dev/ComfyUI", "comfyui", true},
		{"nginx", "nginx [1 args redacted]", "/", "", false},
	}
	for _, c := range cases {
		def, ok := matchAgent(c.name, c.cmd, c.cwd)
		if ok != c.ok || (ok && def.Type != c.want) {
			t.Fatalf("matchAgent(%q, %q, %q) = %q, %v; want %q, %v", c.name, c.cmd, c.cwd, def.Type, ok, c.want, c.ok)
		}
	}
}

func TestSensorKey(t *testing.T) {
	chip, label := splitSensorKey("coretemp/Core 0")
	if chip != "coretemp" || label != "Core 0" {
		t.Fatalf("got %q %q", chip, label)
	}
}
