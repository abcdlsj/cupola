// Package version reports the build identity of the cupola binary.
package version

import "strings"

// Version follows semver with the milestone suffix while the product is under
// construction.
const Version = "0.1.0-m0"

// Commit and Date are overridden at build time:
//
//	go build -ldflags "-X github.com/abcdlsj/cupola/internal/version.Commit=$(git rev-parse --short HEAD)"
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
