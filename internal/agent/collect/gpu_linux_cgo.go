//go:build linux && cgo

package collect

import (
	"github.com/NVIDIA/go-nvml/pkg/nvml"

	"github.com/abcdlsj/cupola/internal/model"
)

// nvidiaGPUs reads NVML: utilisation, VRAM, temperature, power and the
// per-process VRAM map.
func nvidiaGPUs() []model.GPU {
	if ret := nvml.Init(); ret != nvml.SUCCESS {
		return nil
	}
	defer nvml.Shutdown()
	count, ret := nvml.DeviceGetCount()
	if ret != nvml.SUCCESS {
		return nil
	}
	out := make([]model.GPU, 0, count)
	for i := 0; i < count; i++ {
		device, ret := nvml.DeviceGetHandleByIndex(i)
		if ret != nvml.SUCCESS {
			continue
		}
		name, _ := nvml.DeviceGetName(device)
		gpu := model.GPU{Index: i, Vendor: "nvidia", Name: name}
		if util, ret := nvml.DeviceGetUtilizationRates(device); ret == nvml.SUCCESS {
			gpu.UtilPercent = float64(util.Gpu)
		}
		if mem, ret := nvml.DeviceGetMemoryInfo(device); ret == nvml.SUCCESS {
			gpu.MemUsed = mem.Used
			gpu.MemTotal = mem.Total
		}
		if temp, ret := nvml.DeviceGetTemperature(device, nvml.TEMPERATURE_GPU); ret == nvml.SUCCESS {
			gpu.TempC = float64(temp)
		}
		if power, ret := nvml.DeviceGetPowerUsage(device); ret == nvml.SUCCESS {
			gpu.PowerW = float64(power) / 1000
		}
		if limit, ret := nvml.DeviceGetEnforcedPowerLimit(device); ret == nvml.SUCCESS {
			gpu.PowerLimitW = float64(limit) / 1000
		}
		if procs, ret := nvml.DeviceGetComputeRunningProcesses(device); ret == nvml.SUCCESS {
			for _, proc := range procs {
				gpu.Processes = append(gpu.Processes, model.GPUProcess{
					PID:      int32(proc.Pid),
					MemBytes: proc.UsedGpuMemory,
				})
			}
		}
		out = append(out, gpu)
	}
	return out
}
