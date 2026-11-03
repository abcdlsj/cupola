//go:build linux

package collect

import (
	"os"
	"strconv"
	"strings"
)

// processTTY names the terminal a process is attached to by following its
// standard input. gopsutil's Process.Terminal walks /dev once per process,
// which dominated the profile on hosts with a few hundred processes; one
// readlink per process gives the same answer for a fraction of the cost.
func processTTY(pid int32) string {
	target, err := os.Readlink("/proc/" + strconv.Itoa(int(pid)) + "/fd/0")
	if err != nil {
		return ""
	}
	name, ok := strings.CutPrefix(target, "/dev/")
	if !ok {
		return ""
	}
	if name == "null" {
		return "none"
	}
	if strings.HasPrefix(name, "pts/") || strings.HasPrefix(name, "tty") {
		return name
	}
	return ""
}
