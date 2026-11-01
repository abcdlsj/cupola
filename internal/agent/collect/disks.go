package collect

import (
	"context"
	"sort"
	"strings"

	"github.com/shirou/gopsutil/v4/disk"

	"github.com/abcdlsj/cupola/internal/model"
)

// collectDisks reports usage for disk-backed mounts and attaches IO rates from
// the platform helper. tmpfs, proc and cgroup mounts are excluded by
// Partitions(false).
func (c *Collector) collectDisks(ctx context.Context, out *[]model.DiskStats, warn func(string, error)) {
	parts, err := disk.PartitionsWithContext(ctx, false)
	if err != nil {
		warn("disks", err)
		return
	}
	rates := c.diskIORates()
	var stats []model.DiskStats
	for _, part := range parts {
		if skipMount(part.Mountpoint) {
			continue
		}
		usage, err := disk.UsageWithContext(ctx, part.Mountpoint)
		if err != nil || usage == nil || usage.Total == 0 {
			continue
		}
		entry := model.DiskStats{
			Device:     part.Device,
			Mount:      part.Mountpoint,
			FsType:     part.Fstype,
			Total:      usage.Total,
			Used:       usage.Used,
			Free:       usage.Free,
			UsedPct:    usage.UsedPercent,
			Inodes:     usage.InodesTotal,
			InodesUsed: usage.InodesUsed,
			InodePct:   usage.InodesUsedPercent,
			ReadOnly:   part.Opts != nil && hasOpt(part.Opts, "ro"),
		}
		if rate, ok := rates[part.Device]; ok {
			entry.ReadBps = rate.read
			entry.WriteBps = rate.write
			entry.ReadIOPS = rate.readIOPS
			entry.WriteIOPS = rate.writeIOPS
			entry.LatencyMs = rate.latency
		}
		stats = append(stats, entry)
	}
	sort.Slice(stats, func(i, j int) bool {
		if stats[i].Mount == "/" {
			return true
		}
		if stats[j].Mount == "/" {
			return false
		}
		return stats[i].Mount < stats[j].Mount
	})
	*out = stats
}

// skipMount drops macOS system volumes and simulator images that are not the
// operator's disks.
func skipMount(mount string) bool {
	for _, prefix := range []string{
		"/dev",
		"/snap/",
		"/var/snap/",
		"/System/Volumes/",
		"/Library/Developer/",
		"/private/var/run/",
	} {
		if mount == prefix || strings.HasPrefix(mount, prefix) {
			return true
		}
	}
	return false
}

func hasOpt(opts []string, want string) bool {
	for _, opt := range opts {
		if opt == want {
			return true
		}
	}
	return false
}

type ioRate struct {
	read, write         float64
	readIOPS, writeIOPS float64
	latency             float64
}
