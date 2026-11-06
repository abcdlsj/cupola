package hub

import (
	"math"

	"github.com/abcdlsj/cupola/internal/model"
)

// nodeHealth summarises one node for the overview and the node header.
func nodeHealth(node model.NodeRecord, snap *model.Snapshot, daysToFull float64, attention int) model.NodeHealth {
	health := model.NodeHealth{Status: node.Status, DaysToFull: daysToFull, Attention: attention}
	if snap == nil {
		return health
	}
	health.CPUPct = snap.CPU.Percent
	health.MemPct = snap.Memory.UsedPercent
	health.Load1 = snap.CPU.Load1
	health.Load5 = snap.CPU.Load5
	health.Load15 = snap.CPU.Load15
	health.UptimeSec = snap.Node.UptimeSec
	health.Containers = len(snap.Containers)
	health.MemUsed = snap.Memory.Used
	health.MemTotal = snap.Memory.Total
	for _, iface := range snap.Network {
		if iface.Iface != "lo" {
			health.NetRxBps += iface.RxBps
			health.NetTxBps += iface.TxBps
		}
	}
	for _, sensor := range snap.Sensors {
		if sensor.Kind != "temperature" {
			continue
		}
		if health.TempMaxC == nil || sensor.Value > *health.TempMaxC {
			value := sensor.Value
			health.TempMaxC = &value
		}
	}
	for _, gpu := range snap.GPUs {
		if health.GPUPct == nil || gpu.UtilPercent > *health.GPUPct {
			value := gpu.UtilPercent
			health.GPUPct = &value
		}
	}
	for _, service := range snap.Services {
		if service.ActiveState == "failed" {
			health.FailedUnits++
		}
	}
	for _, disk := range snap.Disks {
		if disk.Mount == "/" {
			health.RootDiskPct = disk.UsedPct
			health.RootDiskUsed = disk.Used
			health.RootDiskTotal = disk.Total
		}
	}
	if health.RootDiskPct == 0 {
		for _, disk := range snap.Disks {
			if disk.UsedPct > health.RootDiskPct {
				health.RootDiskPct = disk.UsedPct
			}
		}
	}
	return health
}

// daysToFull fits a line through the last seven days of disk usage and returns
// the days until 100%. A flat or shrinking disk returns 0.
func daysToFull(points []model.SeriesPoint) float64 {
	if len(points) < 12 {
		return 0
	}
	first := points[0]
	last := points[len(points)-1]
	days := float64(last.Ts-first.Ts) / (24 * 3600 * 1000)
	if days < 0.25 {
		return 0
	}
	slope := (last.Avg - first.Avg) / days // percentage points per day
	if slope <= 0.01 {
		return 0
	}
	remaining := 100 - last.Avg
	if remaining <= 0 {
		return 0
	}
	value := remaining / slope
	if math.IsInf(value, 0) || value > 3650 {
		return 0
	}
	return math.Round(value*10) / 10
}
