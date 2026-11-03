//go:build !linux

package collect

// processTTY is a stub off Linux; the macOS build keeps gopsutil's answer.
func processTTY(int32) string { return "" }
