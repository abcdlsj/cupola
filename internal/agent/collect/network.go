package collect

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/net"

	"github.com/abcdlsj/cupola/internal/model"
)

// collectNetwork reports per-interface counters, rates and link details.
func (c *Collector) collectNetwork(ctx context.Context, out *[]model.NetStats, warn func(string, error)) {
	counters, err := net.IOCountersWithContext(ctx, true)
	if err != nil {
		warn("network", err)
		return
	}
	links := c.linkInfo()
	ifaces, _ := net.InterfacesWithContext(ctx)
	up := make(map[string]bool, len(ifaces))
	for _, iface := range ifaces {
		up[iface.Name] = strings.Contains(strings.Join(iface.Flags, ","), "up")
	}
	now := time.Now()
	next := make(map[string]netDelta, len(counters))
	stats := make([]model.NetStats, 0, len(counters))
	for _, counter := range counters {
		if counter.Name == "" || ignoredInterface(counter.Name) {
			continue
		}
		entry := model.NetStats{
			Iface:    counter.Name,
			Up:       up[counter.Name],
			RxBytes:  counter.BytesRecv,
			TxBytes:  counter.BytesSent,
			RxErrors: counter.Errin,
			TxErrors: counter.Errout,
			RxDrops:  counter.Dropin,
			TxDrops:  counter.Dropout,
		}
		if info, ok := links[counter.Name]; ok {
			entry.SpeedMbps = info.speed
			entry.Duplex = info.duplex
			entry.Driver = info.driver
			if info.up {
				entry.Up = true
			}
		}
		if prev, ok := c.prevNet[counter.Name]; ok {
			elapsed := now.Sub(prev.at).Seconds()
			if elapsed > 0 {
				if counter.BytesRecv >= prev.rx {
					entry.RxBps = float64(counter.BytesRecv-prev.rx) / elapsed
				}
				if counter.BytesSent >= prev.tx {
					entry.TxBps = float64(counter.BytesSent-prev.tx) / elapsed
				}
			}
		}
		next[counter.Name] = netDelta{rx: counter.BytesRecv, tx: counter.BytesSent, at: now}
		stats = append(stats, entry)
	}
	c.prevNet = next
	sort.Slice(stats, func(i, j int) bool {
		return stats[i].Iface < stats[j].Iface
	})
	*out = stats
}

// ignoredInterface reports whether a counter is noise rather than bandwidth.
//
// Loopback never leaves the machine, and a container's veth pair carries the
// same bytes its bridge already counted: keeping either double-counts the
// machine and fills the per-interface history with rows nobody reads. On one
// five-node host they were 43 % of the table.
func ignoredInterface(name string) bool {
	if name == "lo" {
		return true
	}
	// veth* is the host end of a container's virtual pair; docker0 and br-*
	// stand for the same traffic once, so only the host ends go.
	return strings.HasPrefix(name, "veth")
}

type linkDetail struct {
	speed  int
	duplex string
	driver string
	up     bool
}
