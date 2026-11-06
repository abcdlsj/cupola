package model

import "strings"

// PruneServices keeps the systemd units an operator can act on and drops the
// ones that only ever pad the list. It is a structural rule, not a name list:
//
//   - Per-session `.scope` units are login artifacts. A scope left behind by a
//     closed session shows up as failed on desktops and outranks the real
//     failures in a failed-first sort.
//   - `.device`, `.target`, `.slice`, `.path`, `.mount`, `.socket` and `.timer`
//     units are kept only when they actually failed or are restarting; a
//     healthy mount or an idle socket is not something to monitor.
//   - A `.service` that is inactive, or that is an oneshot which already
//     exited, has nothing to watch.
//
// On a desktop this turns ~500 units (100 kB) into ~25 rows (4 kB) with no
// loss of anything that can fail, be stopped or be debugged.
func PruneServices(units []Service) []Service {
	kept := make([]Service, 0, len(units))
	for _, unit := range units {
		if KeepService(unit) {
			kept = append(kept, unit)
		}
	}
	return kept
}

// KeepService reports whether one unit survives PruneServices.
func KeepService(unit Service) bool {
	if unit.Name == "" || strings.HasSuffix(unit.Name, ".scope") {
		return false
	}
	if strings.HasSuffix(unit.Name, ".service") {
		if unit.SubState == "exited" || unit.SubState == "dead" {
			return false
		}
		return unit.ActiveState != "inactive"
	}
	return unit.ActiveState == "failed" || unit.SubState == "auto-restart"
}
