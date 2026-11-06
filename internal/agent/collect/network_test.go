package collect

import "testing"

func TestIgnoredInterfaceDropsLoopbackAndContainerHosts(t *testing.T) {
	drop := []string{"lo", "veth0", "veth1a2b3c4", "vethdeadbeef"}
	for _, name := range drop {
		if !ignoredInterface(name) {
			t.Errorf("%q should be ignored", name)
		}
	}
	keep := []string{"eth0", "ens3", "enp5s0", "wlan0", "docker0", "br-1a2b3c", "tailscale0", "wg0", "tun0", "bond0"}
	for _, name := range keep {
		if ignoredInterface(name) {
			t.Errorf("%q should be kept", name)
		}
	}
}
