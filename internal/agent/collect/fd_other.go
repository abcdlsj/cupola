//go:build !linux

package collect

import "github.com/abcdlsj/cupola/internal/model"

func (c *Collector) collectFD(*model.FDStats, func(string, error)) {}
