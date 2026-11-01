//go:build linux

package collect

import (
	"os"
	"strconv"
	"strings"

	"github.com/abcdlsj/cupola/internal/model"
)

func (c *Collector) collectFD(out *model.FDStats, _ func(string, error)) {
	if body, err := os.ReadFile("/proc/sys/fs/file-nr"); err == nil {
		fields := strings.Fields(string(body))
		if len(fields) >= 3 {
			out.Allocated, _ = strconv.ParseUint(fields[0], 10, 64)
			out.Max, _ = strconv.ParseUint(fields[2], 10, 64)
		}
	}
	if body, err := os.ReadFile("/proc/sys/net/netfilter/nf_conntrack_count"); err == nil {
		value, _ := strconv.Atoi(strings.TrimSpace(string(body)))
		out.Conntrack = value
	}
}
