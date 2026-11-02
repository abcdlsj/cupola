// Package version reports the build identity of the cupola binary.
package version

import "strings"

// Version follows semver. It is a variable, not a constant, so the release
// workflow can stamp the tag into the binary; without that the hub could not
// tell which release it runs and would offer itself an upgrade forever.
var Version = "1.0.0"

// Commit and Date are overridden at build time:
//
//	go build -ldflags "-X github.com/abcdlsj/cupola/internal/version.Version=1.0.1 -X github.com/abcdlsj/cupola/internal/version.Commit=$(git rev-parse --short HEAD)"
var (
	Commit = "dev"
	Date   = "unknown"
)

// Info is the machine-readable build identity.
type Info struct {
	Version string `json:"version"`
	Commit  string `json:"commit"`
	Date    string `json:"date"`
}

// Get returns the current build identity.
func Get() Info {
	return Info{Version: Version, Commit: Commit, Date: Date}
}

// String renders the identity for humans.
func (i Info) String() string {
	parts := []string{"cupola " + i.Version, "commit " + i.Commit}
	if i.Date != "" && i.Date != "unknown" {
		parts = append(parts, "built "+i.Date)
	}
	return strings.Join(parts, "  ")
}
