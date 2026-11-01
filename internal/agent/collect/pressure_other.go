//go:build !linux

package collect

import "github.com/abcdlsj/cupola/internal/model"

func (c *Collector) collectPressure(*model.PressureStats, func(string, error)) {}
