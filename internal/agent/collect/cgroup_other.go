//go:build !linux

package collect

func readCgroup(int32) string { return "" }
