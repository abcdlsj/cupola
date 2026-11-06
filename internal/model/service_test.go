package model

import "testing"

func TestPruneServicesKeepsWhatCanBeActedOn(t *testing.T) {
	units := []Service{
		{Name: "docker.service", ActiveState: "active", SubState: "running"},
		{Name: "nginx.service", ActiveState: "failed", SubState: "failed"},
		{Name: "weft.service", ActiveState: "activating", SubState: "auto-restart"},
		{Name: "mnt-backup.mount", ActiveState: "failed", SubState: "failed"},
		{Name: "sshd.socket", ActiveState: "active", SubState: "listening"},
		{Name: "apt-daily.timer", ActiveState: "active", SubState: "waiting"},
		{Name: "session-c1.scope", ActiveState: "failed", SubState: "failed"},
		{Name: "dev-ttyS26.device", ActiveState: "active", SubState: "plugged"},
		{Name: "multi-user.target", ActiveState: "active", SubState: "active"},
		{Name: "systemd-fsck@dev-sda1.service", ActiveState: "active", SubState: "exited"},
		{Name: "snapd.seeded.service", ActiveState: "inactive", SubState: "dead"},
		{Name: "getty@tty1.service", ActiveState: "inactive", SubState: "dead"},
	}
	kept := map[string]bool{}
	for _, unit := range PruneServices(units) {
		kept[unit.Name] = true
	}
	for _, want := range []string{"docker.service", "nginx.service", "weft.service", "mnt-backup.mount"} {
		if !kept[want] {
			t.Errorf("PruneServices dropped %s", want)
		}
	}
	for _, unwanted := range []string{"sshd.socket", "apt-daily.timer", "session-c1.scope",
		"dev-ttyS26.device", "multi-user.target", "systemd-fsck@dev-sda1.service",
		"snapd.seeded.service", "getty@tty1.service"} {
		if kept[unwanted] {
			t.Errorf("PruneServices kept noise %s", unwanted)
		}
	}
}

func TestPruneServicesNeverReturnsNil(t *testing.T) {
	if PruneServices(nil) == nil {
		t.Fatal("nil in, nil out: the JSON section would marshal as null")
	}
}
