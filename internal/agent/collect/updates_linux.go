//go:build linux

package collect

import (
	"context"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

// collectUpdates counts pending apt/dnf upgrades. It is opt-in because it runs
// a package manager, cached for six hours, and never installs anything.
func (c *Collector) collectUpdates(out **model.Updates, _ func(string, error)) {
	if !c.opts.Updates {
		return
	}
	if c.updates != nil && time.Since(c.updatesAt) < 6*time.Hour {
		*out = c.updates
		return
	}
	updates := checkUpdates()
	c.updates = updates
	c.updatesAt = time.Now()
	*out = updates
}

func checkUpdates() *model.Updates {
	checked := time.Now().UnixMilli()
	if _, err := os.Stat("/usr/bin/apt-get"); err == nil {
		return aptUpdates(checked)
	}
	if _, err := os.Stat("/usr/bin/dnf"); err == nil {
		return dnfUpdates(checked)
	}
	return &model.Updates{Manager: "unknown", CheckedAt: checked, Error: "no apt or dnf"}
}

func aptUpdates(checked int64) *model.Updates {
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "apt-get", "-s", "-o", "Debug::NoLocking=1", "-o", "APT::Get::List-Cleanup=0", "upgrade")
	cmd.Env = []string{"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL=C", "DEBIAN_FRONTEND=noninteractive"}
	body, err := cmd.Output()
	out := &model.Updates{Manager: "apt", CheckedAt: checked}
	if err != nil && len(body) == 0 {
		out.Error = err.Error()
		return out
	}
	for _, line := range strings.Split(string(body), "\n") {
		if !strings.HasPrefix(line, "Inst ") {
			continue
		}
		out.Pending++
		lower := strings.ToLower(line)
		if strings.Contains(lower, "-security") || strings.Contains(lower, "security") {
			out.Security++
		}
	}
	return out
}

func dnfUpdates(checked int64) *model.Updates {
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "dnf", "-q", "--refresh", "check-update")
	cmd.Env = []string{"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL=C"}
	body, err := cmd.Output()
	out := &model.Updates{Manager: "dnf", CheckedAt: checked}
	if err != nil {
		// dnf exits 100 when updates are available.
		if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() != 100 {
			out.Error = err.Error()
			return out
		}
	}
	for _, line := range strings.Split(string(body), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 || strings.HasPrefix(fields[0], "Last") || strings.HasPrefix(fields[0], "Obsoleting") {
			continue
		}
		if !strings.Contains(fields[1], ".") {
			continue
		}
		out.Pending++
	}
	return out
}
