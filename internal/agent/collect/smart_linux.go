//go:build linux

package collect

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	smart "github.com/anatol/smart.go"

	"github.com/abcdlsj/cupola/internal/model"
)

// collectSMART reports health for block devices. smart.go is used for the
// generic device attributes (NVMe/ATA); smartctl's JSON is the fallback and
// adds health/wear where the guest cannot issue the ioctl. Root is usually
// required; permission failures leave the list empty instead of flapping.
func (c *Collector) collectSMART(out *[]model.SMARTDevice, warn func(string, error)) {
	if !c.opts.SMART {
		return
	}
	if time.Since(c.smartAt) < 5*time.Minute {
		*out = append(*out, c.smart...)
		return
	}
	devices := blockDevices()
	list := make([]model.SMARTDevice, 0, len(devices))
	for _, dev := range devices {
		entry := readSMART(dev)
		if entry != nil {
			list = append(list, *entry)
		}
	}
	c.smart = list
	c.smartAt = time.Now()
	*out = append(*out, list...)
}

func blockDevices() []string {
	entries, err := os.ReadDir("/sys/block")
	if err != nil {
		return nil
	}
	var out []string
	for _, entry := range entries {
		name := entry.Name()
		switch {
		case strings.HasPrefix(name, "loop"), strings.HasPrefix(name, "ram"),
			strings.HasPrefix(name, "dm-"), strings.HasPrefix(name, "md"),
			strings.HasPrefix(name, "zram"), strings.HasPrefix(name, "sr"):
			continue
		}
		out = append(out, "/dev/"+name)
	}
	return out
}

type smartctlDoc struct {
	ModelName string `json:"model_name"`
	SmartStatus struct {
		Passed bool `json:"passed"`
	} `json:"smart_status"`
	Temperature struct {
		Current int `json:"current"`
	} `json:"temperature"`
	PowerOnTime struct {
		Hours int64 `json:"hours"`
	} `json:"power_on_time"`
	NVMe *struct {
		PercentageUsed int `json:"percentage_used"`
	} `json:"nvme"`
	ATAAttributes *struct {
		Table []struct {
			Name string `json:"name"`
			Raw  struct {
				Value int64 `json:"value"`
			} `json:"raw"`
		} `json:"table"`
	} `json:"ata_smart_attributes"`
}

func readSMART(dev string) *model.SMARTDevice {
	entry := &model.SMARTDevice{Device: dev, Type: "unknown", Health: "unknown"}
	if doc, ok := smartctl(dev); ok {
		entry.Model = doc.ModelName
		entry.Type = "smartctl"
		entry.TemperatureC = float64(doc.Temperature.Current)
		entry.PowerOnHours = doc.PowerOnTime.Hours
		if doc.SmartStatus.Passed {
			entry.Health = "passed"
		} else {
			entry.Health = "failing"
		}
		if doc.NVMe != nil {
			entry.WearPercent = float64(doc.NVMe.PercentageUsed)
			entry.Type = "nvme"
		}
		if doc.ATAAttributes != nil {
			for _, attr := range doc.ATAAttributes.Table {
				switch attr.Name {
				case "Reallocated_Sector_Ct":
					entry.Reallocated = attr.Raw.Value
				case "Power_On_Hours":
					if entry.PowerOnHours == 0 {
						entry.PowerOnHours = attr.Raw.Value
					}
				case "Media_Wearout_Indicator", "Percentage_Used":
					if entry.WearPercent == 0 && attr.Raw.Value > 0 && attr.Raw.Value <= 100 {
						entry.WearPercent = float64(100 - attr.Raw.Value)
					}
				}
			}
		}
		return entry
	}

	// smart.go: no external binary, but it cannot report the health verdict on
	// every device type.
	device, err := smart.Open(dev)
	if err != nil {
		return nil
	}
	defer device.Close()
	entry.Type = device.Type()
	if attrs, err := device.ReadGenericAttributes(); err == nil && attrs != nil {
		entry.TemperatureC = float64(attrs.Temperature)
		entry.PowerOnHours = int64(attrs.PowerOnHours)
		entry.Health = "unknown"
		return entry
	}
	return nil
}

func smartctl(dev string) (*smartctlDoc, bool) {
	path, err := exec.LookPath("smartctl")
	if err != nil {
		if _, statErr := os.Stat("/usr/sbin/smartctl"); statErr == nil {
			path = "/usr/sbin/smartctl"
		} else {
			return nil, false
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, "-a", "-j", "--device=auto", dev)
	body, err := cmd.Output()
	if len(body) == 0 {
		return nil, false
	}
	var doc smartctlDoc
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, false
	}
	if strings.Contains(string(body), "Permission denied") && doc.ModelName == "" {
		return nil, false
	}
	_ = err // smartctl uses the exit code as a bit mask; the JSON is still valid
	return &doc, true
}

var _ = filepath.Base
