//go:build linux

package collect

import (
	"github.com/prometheus/procfs"

	"github.com/abcdlsj/cupola/internal/model"
)

// collectPressure reads PSI from /proc/pressure. Kernels without PSI yield
// zeros; that is a feature gap, not a failure.
func (c *Collector) collectPressure(out *model.PressureStats, _ func(string, error)) {
	fs, err := procfs.NewDefaultFS()
	if err != nil {
		return
	}
	read := func(resource string) model.PressureStat {
		stats, err := fs.PSIStatsForResource(resource)
		if err != nil {
			return model.PressureStat{}
		}
		value := model.PressureStat{}
		if stats.Some != nil {
			value.Some = round2(stats.Some.Avg10)
		}
		if stats.Full != nil {
			value.Full = round2(stats.Full.Avg10)
		}
		return value
	}
	out.CPU = read("cpu")
	out.Mem = read("memory")
	out.IO = read("io")
}

func round2(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
