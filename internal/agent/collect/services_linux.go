//go:build linux

package collect

import (
	"context"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/coreos/go-systemd/v22/dbus"

	"github.com/abcdlsj/cupola/internal/model"
)

// collectServices reads systemd units over D-Bus (go-systemd). When D-Bus is
// unavailable (containers), it falls back to `systemctl list-units`; both are
// fixed invocations, never a shell.
func (c *Collector) collectServices(out *[]model.Service, warn func(string, error)) {
	if time.Since(c.servicesAt) < 15*time.Second {
		*out = append(*out, c.services...)
		return
	}
	services, err := listUnitsDbus()
	if err != nil {
		services, err = listUnitsSystemctl()
	}
	if err != nil {
		warn("services", err)
		return
	}
	for i := range services {
		services[i].Enabled = unitEnabled(services[i].Name)
	}
	// Failed units first, then auto-restart, then the rest.
	sortServices(services)
	if len(services) > 500 {
		services = services[:500]
	}
	c.services = services
	c.servicesAt = time.Now()
	*out = append(*out, services...)
}

func listUnitsDbus() ([]model.Service, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	conn, err := dbus.NewSystemConnectionContext(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	units, err := conn.ListUnitsContext(ctx)
	if err != nil {
		return nil, err
	}
	services := make([]model.Service, 0, len(units))
	for _, unit := range units {
		service := model.Service{
			Name:        unit.Name,
			Description: unit.Description,
			LoadState:   unit.LoadState,
			ActiveState: unit.ActiveState,
			SubState:    unit.SubState,
		}
		if unit.ActiveState == "failed" || unit.SubState == "auto-restart" {
			if prop, err := conn.GetUnitPropertyContext(ctx, unit.Name, "NRestarts"); err == nil {
				if value, ok := prop.Value.Value().(uint32); ok {
					service.Restarts = int(value)
				}
			}
		}
		services = append(services, service)
	}
	return services, nil
}

func listUnitsSystemctl() ([]model.Service, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "systemctl", "list-units", "--all", "--plain", "--no-legend", "--no-pager")
	cmd.Env = []string{"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL=C"}
	body, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var services []model.Service
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimPrefix(line, "● ")
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		service := model.Service{
			Name:        fields[0],
			LoadState:   fields[1],
			ActiveState: fields[2],
			SubState:    fields[3],
		}
		if len(fields) > 4 {
			service.Description = strings.Join(fields[4:], " ")
		}
		services = append(services, service)
	}
	return services, nil
}

// unitEnabled inspects the .wants/.requires links; there is no cheap D-Bus
// property for hundreds of units.
func unitEnabled(name string) string {
	patterns := []string{
		"/etc/systemd/system/*.wants/" + name,
		"/etc/systemd/system/*.requires/" + name,
		"/usr/lib/systemd/system/*.wants/" + name,
	}
	for _, pattern := range patterns {
		if matches, _ := filepath.Glob(pattern); len(matches) > 0 {
			return "enabled"
		}
	}
	return "disabled"
}

func sortServices(services []model.Service) {
	for i := 1; i < len(services); i++ {
		for j := i; j > 0 && serviceRank(services[j]) < serviceRank(services[j-1]); j-- {
			services[j], services[j-1] = services[j-1], services[j]
		}
	}
}

func serviceRank(service model.Service) int {
	switch {
	case service.ActiveState == "failed":
		return 0
	case service.SubState == "auto-restart":
		return 1
	case service.ActiveState == "active":
		return 3
	default:
		return 2
	}
}
