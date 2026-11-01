package version

import (
	"strings"
	"testing"
)

func TestGetReturnsBuildIdentity(t *testing.T) {
	info := Get()
	if info.Version != Version {
		t.Errorf("Version = %q, want %q", info.Version, Version)
	}
	if info.Commit == "" {
		t.Error("Commit is empty")
	}
}

func TestStringOmitsUnknownDate(t *testing.T) {
	info := Info{Version: "0.1.0-m0", Commit: "abc1234", Date: "unknown"}
	got := info.String()
	if strings.Contains(got, "built") {
		t.Errorf("String() = %q, want no build date", got)
	}
	if !strings.Contains(got, "0.1.0-m0") || !strings.Contains(got, "abc1234") {
		t.Errorf("String() = %q, want version and commit", got)
	}
}

func TestStringIncludesBuildDate(t *testing.T) {
	info := Info{Version: "0.1.0-m0", Commit: "abc1234", Date: "2026-11-01T09:42:00Z"}
	if !strings.Contains(info.String(), "built 2026-11-01T09:42:00Z") {
		t.Errorf("String() = %q, want build date", info.String())
	}
}
