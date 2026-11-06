package model

import (
	"strconv"
	"strings"
)

// clientPorts are the ports a protocol client binds for its own use: DHCPv4
// (68), DHCPv6 (546) and the NTP client socket (323). They are never a service
// somebody dials, but they show up as bound UDP sockets on every host.
var clientPorts = map[uint32]bool{68: true, 323: true, 546: true}

// EphemeralMin is the first port the kernel hands out when a program does not
// ask for a specific one on Linux (net.ipv4.ip_local_port_range). A listener
// bound to one interface address on such a port was chosen by the kernel, not
// configured: it cannot be reached as a service, and it changes on restart.
const EphemeralMin = 32768

// PrunePorts drops sockets that are not services, and collapses the IPv6 twin
// of a dual-stack listener. It is structural, with no list of process names:
//
//   - protocol client ports (DHCP, NTP) are not listeners;
//   - a listener bound to one address on an ephemeral port is a kernel-chosen
//     socket (tailscaled, container runtimes), not a service;
//   - when the same process listens on 0.0.0.0:p and [::]:p, that is one
//     service and belongs in one row.
func PrunePorts(ports []Port) []Port {
	kept := make([]Port, 0, len(ports))
	for _, port := range ports {
		if KeepPort(port) {
			kept = append(kept, port)
		}
	}
	// Collapse dual-stack twins after filtering, so a dropped IPv4 row cannot
	// resurrect a dead IPv6 one.
	v4any := make(map[string]bool, len(kept))
	for _, port := range kept {
		if port.Address == "0.0.0.0" {
			v4any[portTwinKey(port)] = true
		}
	}
	deduped := kept[:0]
	for _, port := range kept {
		if port.Address == "::" && v4any[portTwinKey(port)] {
			continue
		}
		deduped = append(deduped, port)
	}
	return deduped
}

// KeepPort reports whether one socket survives PrunePorts, ignoring duplicates.
func KeepPort(port Port) bool {
	if port.Proto == "udp" && clientPorts[port.Port] {
		return false
	}
	if port.Port >= EphemeralMin && !sharedAddress(port.Address) {
		return false
	}
	return true
}

// sharedAddress reports whether a socket is bound to an address every client
// can reach: any address, or loopback.
func sharedAddress(address string) bool {
	switch address {
	case "0.0.0.0", "::", "::1":
		return true
	}
	return strings.HasPrefix(address, "127.")
}

// portTwinKey identifies one service across address families: same protocol,
// same port, same state, same owner.
func portTwinKey(port Port) string {
	return port.Proto + "/" + strconv.FormatUint(uint64(port.Port), 10) + "/" + port.State + "/" + port.Process
}
