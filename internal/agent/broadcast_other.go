//go:build !unix

package agent

import "net"

func setBroadcast(*net.UDPConn) error { return nil }
