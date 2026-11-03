//go:build linux

package collect

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/abcdlsj/cupola/internal/model"
)

func (c *Collector) collectGPUsPlatform(out *[]model.GPU, _ func(string, error)) {
	if gpus := nvidiaGPUs(); len(gpus) > 0 {
		*out = append(*out, gpus...)
	}
	if gpus := amdGPUs(); len(gpus) > 0 {
		*out = append(*out, gpus...)
	}
}

// isCardName reports whether a /sys/class/drm entry is a card device rather
// than a connector (card0-DP-1, renderD128, version).
func isCardName(name string) bool {
	rest, ok := strings.CutPrefix(name, "card")
	if !ok || rest == "" {
		return false
	}
	for _, r := range rest {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// amdGPUs reads sysfs; there is no stable Go library for amdgpu. It lists the
// directory once and filters names, which is much cheaper than a glob: the
// pattern walk was visible in profiles even when the host had no card.
func amdGPUs() []model.GPU {
	entries, err := os.ReadDir("/sys/class/drm")
	if err != nil {
		return nil
	}
	var out []model.GPU
	for _, item := range entries {
		name := item.Name()
		if !isCardName(name) {
			continue
		}
		entry := filepath.Join("/sys/class/drm", name)
		device := filepath.Join(entry, "device")
		vendor := readTrim(filepath.Join(device, "vendor"))
		if vendor != "0x1002" {
			continue
		}
		index, _ := strconv.Atoi(strings.TrimPrefix(name, "card"))
		gpu := model.GPU{
			Index:  index,
			Vendor: "amd",
			Name:   readTrim(filepath.Join(device, "product_name")),
		}
		if gpu.Name == "" {
			gpu.Name = "AMD GPU"
		}
		if value, err := readUint(filepath.Join(device, "gpu_busy_percent")); err == nil {
			gpu.UtilPercent = float64(value)
		}
		if value, err := readUint(filepath.Join(device, "mem_info_vram_used")); err == nil {
			gpu.MemUsed = value
		}
		if value, err := readUint(filepath.Join(device, "mem_info_vram_total")); err == nil {
			gpu.MemTotal = value
		}
		if hwmons, _ := filepath.Glob(filepath.Join(device, "hwmon", "hwmon*")); len(hwmons) > 0 {
			base := hwmons[0]
			if value, err := readUint(filepath.Join(base, "temp1_input")); err == nil {
				gpu.TempC = float64(value) / 1000
			}
			if value, err := readUint(filepath.Join(base, "power1_average")); err == nil {
				gpu.PowerW = float64(value) / 1e6
			}
		}
		out = append(out, gpu)
	}
	return out
}

func readTrim(path string) string {
	body, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(body))
}

func readUint(path string) (uint64, error) {
	value := readTrim(path)
	return strconv.ParseUint(value, 10, 64)
}
