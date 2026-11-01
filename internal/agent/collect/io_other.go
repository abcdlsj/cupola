//go:build !linux

package collect

// Disk IO counters and NIC link details are Linux-only in v1. macOS still gets
// disk usage and per-interface byte rates through gopsutil.
func (c *Collector) diskIORates() map[string]ioRate { return nil }

func (c *Collector) linkInfo() map[string]linkDetail { return nil }
