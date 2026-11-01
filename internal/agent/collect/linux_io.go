//go:build linux

package collect

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/procfs"
	"github.com/safchain/ethtool"
)

// diskIORates reads /proc/diskstats through procfs and turns the counters
// into per-second rates for the interval since the previous call.
func (c *Collector) diskIORates() map[string]ioRate {
	fs, err := procfs.NewDefaultFS()
	if err != nil {
		return nil
	}
	stats, err := fs.Diskstats()
	if err != nil {
		return nil
	}
	now := time.Now()
	out := make(map[string]ioRate, len(stats))
	next := make(map[string]diskDelta, len(stats))
	for _, stat := range stats {
		next[stat.Name] = diskDelta{read: stat.ReadBytes, write: stat.WriteBytes, at: now}
		prev, ok := c.prevDisk[stat.Name]
		if !ok {
			// Seed the first sample: the next interval has a delta.
			out[stat.Name] = ioRate{}
			continue
		}
		elapsed := now.Sub(prev.at).Seconds()
		if elapsed <= 0 {
			continue
		}
		rate := ioRate{
			read:  float64(stat.ReadBytes-prev.read) / elapsed,
			write: float64(stat.WriteBytes-prev.write) / elapsed,
		}
		// procfs Diskstats does not expose per-interval IOPS counters directly;
		// reads/writes completed are cumulative.
		rate.latency = 0
		out[stat.Name] = rate
	}
	c.prevDisk = next
	return out
}

// linkInfo adds speed, duplex, driver and carrier state from ethtool and sysfs.
func (c *Collector) linkInfo() map[string]linkDetail {
	out := make(map[string]linkDetail)
	eth, err := ethtool.NewEthtool()
	if err == nil {
		defer eth.Close()
	}
	entries, err := os.ReadDir("/sys/class/net")
	if err != nil {
		return out
	}
	for _, entry := range entries {
		name := entry.Name()
		if name == "lo" {
			continue
		}
		detail := linkDetail{}
		if body, err := os.ReadFile(filepath.Join("/sys/class/net", name, "operstate")); err == nil {
			detail.up = strings.TrimSpace(string(body)) == "up"
		}
		if eth != nil {
			if speed, err := eth.LinkSpeed(name); err == nil {
				detail.speed = int(speed.Speed)
			}
			if info, err := eth.DriverInfo(name); err == nil {
				detail.driver = info.Driver
			}
		}
		out[name] = detail
	}
	return out
}

// readCgroup returns the process's cgroup path (the container id is in it for
// containerised processes). It is informational only.
func readCgroup(pid int32) string {
	body, err := os.ReadFile(fmt.Sprintf("/proc/%d/cgroup", pid))
	if err != nil {
		return ""
	}
	line := strings.SplitN(strings.TrimSpace(string(body)), "\n", 2)[0]
	fields := strings.SplitN(line, ":", 3)
	if len(fields) != 3 {
		return ""
	}
	path := strings.TrimSpace(fields[2])
	if len(path) > 200 {
		path = path[:200]
	}
	return path
}

// resolveSocketPIDs maps socket inodes to (pid, process name) by scanning
// /proc/<pid>/fd. This is the only way to attribute a listening port; there is
// no library for the inode join.
func resolveSocketPIDs() map[uint64]socketOwner {
	out := make(map[uint64]socketOwner)
	procs, err := os.ReadDir("/proc")
	if err != nil {
		return out
	}
	total := 0
	for _, entry := range procs {
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid <= 0 {
			continue
		}
		fdDir := filepath.Join("/proc", entry.Name(), "fd")
		fds, err := os.ReadDir(fdDir)
		if err != nil {
			continue
		}
		for _, fd := range fds {
			if total > 20000 {
				return out
			}
			total++
			target, err := os.Readlink(filepath.Join(fdDir, fd.Name()))
			if err != nil || !strings.HasPrefix(target, "socket:[") {
				continue
			}
			inode, err := strconv.ParseUint(strings.TrimSuffix(strings.TrimPrefix(target, "socket:["), "]"), 10, 64)
			if err != nil {
				continue
			}
			if _, exists := out[inode]; exists {
				continue
			}
			name := ""
			if comm, err := os.ReadFile(filepath.Join("/proc", entry.Name(), "comm")); err == nil {
				name = strings.TrimSpace(string(comm))
			}
			out[inode] = socketOwner{PID: int32(pid), Name: name}
		}
	}
	return out
}

type socketOwner struct {
	PID  int32
	Name string
}

func ipString(ip net.IP) string {
	if ip == nil {
		return ""
	}
	return ip.String()
}
